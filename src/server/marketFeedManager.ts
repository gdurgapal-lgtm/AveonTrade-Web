import { EventEmitter } from "events";
import { ODINMarketFeedClient } from "odin-market-feed-client";
import type { StoredSession } from "@/lib/session";

type DepthLevel = { price: number; quantity: number; orders: number };

const TOUCHLINE_BATCH_SIZE = 90;
const RELEASE_GRACE_MS = Number(process.env.FEED_RELEASE_GRACE_MS) || 8_000;

function batches<T>(items: T[], size = TOUCHLINE_BATCH_SIZE): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

function decodeOdinPacket(message: string): Record<string, unknown> | null {
  const tags: Record<string, string> = {};
  const parts = message.split("|").flatMap((part) => part.split("$"));
  for (const part of parts) {
    const separator = part.indexOf("=");
    if (separator > 0) tags[part.slice(0, separator)] = part.slice(separator + 1);
  }

  const token = tags["7"];
  const mktSegId = Number(tags["1"]);
  if (!token || !Number.isFinite(mktSegId)) return null;

  const scale = Number(tags["399"]) > 0 ? Number(tags["399"]) : 100;
  const number = (value: string | undefined) => Number(value) || 0;
  const price = (value: string | undefined) => number(value) / scale;

  const parsePercent = (val: string | undefined) => {
    if (val === undefined) return 0;
    const cleaned = String(val).replace("%", "").trim();
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  
  const isDepthPacket = tags["64"] === "128";

  const depth = isDepthPacket ? {
    ...decodeDepth(parts, scale),
    totalBuyQty: number(tags["81"]),
    totalSellQty: number(tags["82"]),
    avgTradedPrice: price(tags["80"]),
    week52High: price(tags["93"]),
    week52Low: price(tags["94"]),
    circuitRange: tags["380"],
  } : undefined;

  return {
    mktSegId,
    token,
    ltp: price(tags["8"]),
    ltq: number(tags["9"]),
    bidQty: number(tags["2"]),
    buyQty: number(tags["2"]),
    sellQty: number(tags["5"]),
    askQty: number(tags["5"]),
    bidPrice: price(tags["3"]),
    askPrice: price(tags["6"]),
    lastTradeTime: tags["73"] ?? "",
    lastUpdateTime: tags["74"] ?? "",
    openInterest: number(tags["88"]),
    netChange: parsePercent(tags["54"]),
    changePercent: parsePercent(tags["54"]),
    change_percent: parsePercent(tags["54"]),
    closePrice: price(tags["76"] ?? tags["250"]),
    previousDayClosePrice: price(tags["250"]),
    open: price(tags["75"]),
    high: price(tags["77"]),
    low: price(tags["78"]),
    volume: number(tags["79"]),
    avgTradedPrice: price(tags["80"]),
    totalBuyQty: number(tags["81"]),
    totalSellQty: number(tags["82"]),
    lifetimeHigh: price(tags["93"]),
    lifetimeLow: price(tags["94"]),
    marketType: tags["38"] ?? "",
    openInterestPercentage: number(tags["465"]),
    highOpenInterest: number(tags["466"]),
    lowOpenInterest: number(tags["467"]),
    dailyPriceRange: tags["380"] ?? "",
    tradeExecutionRange: tags["499"] ?? "",
    change: tags["393"] !== undefined ? number(tags["393"]) : 0,
    decimalLocator: scale,
    casReferencePrice: price(tags["417"]),
    indicativeClosePrice: price(tags["418"]),
    imbalanceQtyEquiPrice: price(tags["419"]),
    imbalanceQtyMarketOrderEquiPrice: price(tags["420"]),
    ...(depth ? { depth } : {}),
  };
}

function decodeDepth(parts: string[], scale: number): { bids: DepthLevel[]; asks: DepthLevel[] } {
  const bids: DepthLevel[] = [];
  const asks: DepthLevel[] = [];
  let side = 0;
  let level: Record<string, string> = {};
  const flush = () => {
    if ((side !== 1 && side !== 2) || level["12"] === undefined || level["14"] === undefined) {
      level = {};
      return;
    }
    const parsed = { quantity: Number(level["12"]) || 0, price: (Number(level["14"]) || 0) / scale, orders: Number(level["37"]) || 0 };
    (side === 1 ? bids : asks).push(parsed);
    level = {};
  };
  for (const part of parts) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const key = part.slice(0, separator);
    const value = part.slice(separator + 1);
    if (key === "11") {
      flush();
      side = Number(value);
    } else if (key === "12" && Object.keys(level).length > 0) {
      flush();
      level[key] = value;
    } else if (side === 1 || side === 2) {
      level[key] = value;
    }
  }
  flush();
  return { bids: bids.slice(0, 5), asks: asks.slice(0, 5) };
}

class FeedConnection {
  readonly client = new ODINMarketFeedClient();
  readonly emitter = new EventEmitter();
  ready = false;
  private pendingTokens = new Set<string>();
  private subscribedTokens = new Set<string>();
  private subscriptionCounts = new Map<string, number>();
  private depthSubscriptionCounts = new Map<string, number>();
  private loggedSamples = 0;
  private traceSubscriptionCounts = new Map<string, number>();
  private traceSamples = new Map<string, number>();
  private connectPromise: Promise<void> | null = null;
  private opQueue: Promise<unknown> = Promise.resolve();
  private pendingDrops = new Map<string, number>();
  private dropTimer: ReturnType<typeof setTimeout> | null = null;
  private depthActive = new Set<string>();

  constructor(private session: StoredSession) {
    this.emitter.setMaxListeners(500);

    this.client.onOpen = async () => {
      this.ready = true;
      const pending = Array.from(this.pendingTokens).filter((token) => this.subscribedTokens.has(token));
      for (const batch of batches(pending)) {
        const activeBatch = batch.filter((token) => this.subscribedTokens.has(token) && this.pendingTokens.has(token));
        if (activeBatch.length === 0) continue;
        try {
          await this.client.subscribeLTPTouchline(activeBatch);
          await this.client.subscribeTouchline(activeBatch, "0", false);
          const releasedDuringSubscribe = activeBatch.filter((token) => !this.subscribedTokens.has(token));
          if (releasedDuringSubscribe.length > 0) {
            try {
              await this.client.UnsubscribeLTPTouchline(releasedDuringSubscribe);
              await this.client.unsubscribeTouchline(releasedDuringSubscribe);
            } catch {}
          }
          activeBatch.forEach((token) => {
            if (this.subscribedTokens.has(token)) this.pendingTokens.delete(token);
          });
        } catch (err) {
          console.error("[AveonTrade] Feed subscribe-on-open failed:", err);
        }
      }
      for (const tokenKey of Array.from(this.depthSubscriptionCounts.keys())) {
        const [segment, token] = tokenKey.split("_");
        const marketSegmentId = Number(segment);
        if (!token || !Number.isFinite(marketSegmentId) || !this.depthSubscriptionCounts.has(tokenKey)) continue;
        try {
          await this.client.subscribeBestFive(token, marketSegmentId);
          this.depthActive.add(tokenKey);
          if (!this.depthSubscriptionCounts.has(tokenKey)) {
            try { await this.client.unsubscribeBestFive(token, marketSegmentId); } catch {}
            this.depthActive.delete(tokenKey);
          }
        } catch (err) {
          console.error("[AveonTrade] Best-Five subscribe-on-open failed:", err);
        }
      }
    };

    this.client.onMessage = (message: string) => {
      if (this.loggedSamples < 5) {
        this.loggedSamples += 1;
      }
      let frames: string[] = [message];
      if (!message.includes("|")) {
        try {
          const splitFrames = this.client.parseData(message) ?? [];
          if (splitFrames.length > 0) frames = splitFrames;
        } catch {}
      }
      let emitted = false;
      for (const frame of frames) {
        const record = decodeOdinPacket(frame);
        if (record) {
          emitted = true;
          const traceKey = `${String(record.mktSegId)}_${String(record.token)}`;
          if (this.traceSubscriptionCounts.has(traceKey)) {
            const sampleCount = this.traceSamples.get(traceKey) ?? 0;
            if (sampleCount < 3) {
              this.traceSamples.set(traceKey, sampleCount + 1);
            }
          }
          this.emitter.emit("tick", record);
        }
      }
      if (!emitted) this.emitter.emit("raw", message);
    };

    this.client.onError = (error: string) => {
      console.error("[AveonTrade] Feed error:", error);
      this.emitter.emit("connection-error", error);
    };

    this.client.onClose = (code: number, reason: string) => {
      this.ready = false;
      if (this.dropTimer) clearTimeout(this.dropTimer);
      this.dropTimer = null;
      this.pendingDrops.clear();
      this.depthActive.clear();
      registry.delete(session.userId);
      this.emitter.emit("closed", { code, reason });
    };
  }

  connect(): Promise<void> {
    if (!this.connectPromise) {
      const host = this.session.broadcastHost;
      const port = this.session.broadcastPort;
      const ssl = this.session.broadcastSsl ?? true;

      if (!host || !Number.isFinite(port) || !port || port < 1 || port > 65535) {
        return Promise.reject(new Error("Broadcast server is not configured correctly."));
      }

      const token = this.session.broadcastToken || this.session.accessToken;
      const connectCall = this.client.connect(host, port, ssl, this.session.userId, token);
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Feed connect() timed out after 10s connecting to ${host}:${port}`)), 10_000)
      );

      this.connectPromise = Promise.race([connectCall, timeout]).catch((err) => {
        console.error("[AveonTrade] Feed connect() failed:", err?.message ?? err);
        this.connectPromise = null;
        throw err;
      });
    }
    return this.connectPromise;
  }

  private enqueue<T>(op: () => Promise<T>): Promise<T> {
    const run = this.opQueue.then(op);
    this.opQueue = run.catch(() => undefined);
    return run;
  }

  async subscribe(tokens: string[]) {
    const fresh: string[] = [];
    for (const token of new Set(tokens)) {
      const count = this.subscriptionCounts.get(token) ?? 0;
      this.subscriptionCounts.set(token, count + 1);
      if (count === 0) {
        if (this.pendingDrops.delete(token) && this.subscribedTokens.has(token)) continue;
        this.subscribedTokens.add(token);
        fresh.push(token);
      }
    }
    if (fresh.length === 0) return;
    fresh.forEach((t) => this.pendingTokens.add(t));
    if (!this.ready) return;
    await this.enqueue(async () => {
      for (const batch of batches(fresh)) {
        const activeBatch = batch.filter((token) => this.subscribedTokens.has(token));
        if (activeBatch.length === 0) continue;
        await this.client.subscribeLTPTouchline(activeBatch);
        await this.client.subscribeTouchline(activeBatch, "0", false);
        const releasedDuringSubscribe = activeBatch.filter((token) => !this.subscribedTokens.has(token));
        if (releasedDuringSubscribe.length > 0) {
          try {
            await this.client.UnsubscribeLTPTouchline(releasedDuringSubscribe);
            await this.client.unsubscribeTouchline(releasedDuringSubscribe);
          } catch {}
        }
        activeBatch.forEach((token) => {
          if (this.subscribedTokens.has(token)) this.pendingTokens.delete(token);
        });
      }
    });
  }

  async release(tokens: string[]) {
    const dropAt = Date.now() + RELEASE_GRACE_MS;
    for (const token of new Set(tokens)) {
      const count = this.subscriptionCounts.get(token) ?? 0;
      if (count <= 1) {
        this.subscriptionCounts.delete(token);
        if (this.subscribedTokens.has(token)) this.pendingDrops.set(token, dropAt);
      } else {
        this.subscriptionCounts.set(token, count - 1);
      }
    }
    this.scheduleDropFlush();
  }

  private scheduleDropFlush() {
    if (this.dropTimer || this.pendingDrops.size === 0) return;
    const nextAt = Math.min(...Array.from(this.pendingDrops.values()));
    this.dropTimer = setTimeout(() => {
      this.dropTimer = null;
      void this.flushDrops();
    }, Math.max(0, nextAt - Date.now()) + 50);
  }

  private async flushDrops() {
    const now = Date.now();
    const due: string[] = [];
    for (const [token, at] of Array.from(this.pendingDrops.entries())) {
      if (at > now) continue;
      this.pendingDrops.delete(token);
      if (!this.subscriptionCounts.has(token) && this.subscribedTokens.has(token)) due.push(token);
    }
    this.scheduleDropFlush();
    if (due.length === 0) return;
    due.forEach((t) => {
      this.subscribedTokens.delete(t);
      this.pendingTokens.delete(t);
    });
    if (!this.ready) return;
    await this.enqueue(async () => {
      const stillDue = due.filter((t) => !this.subscribedTokens.has(t));
      if (stillDue.length === 0) return;
      try {
        for (const batch of batches(stillDue)) {
          await this.client.UnsubscribeLTPTouchline(batch);
          await this.client.unsubscribeTouchline(batch);
        }
      } catch {}
    });
  }

  enableTrace(tokens: string[]) {
    for (const token of new Set(tokens)) {
      this.traceSubscriptionCounts.set(token, (this.traceSubscriptionCounts.get(token) ?? 0) + 1);
    }
  }

  disableTrace(tokens: string[]) {
    for (const token of new Set(tokens)) {
      const count = this.traceSubscriptionCounts.get(token) ?? 0;
      if (count <= 1) this.traceSubscriptionCounts.delete(token);
      else this.traceSubscriptionCounts.set(token, count - 1);
    }
  }

  async subscribeDepth(tokenKey: string) {
    const [segment, token] = tokenKey.split("_");
    if (!token || !Number.isFinite(Number(segment))) return;
    this.depthSubscriptionCounts.set(tokenKey, (this.depthSubscriptionCounts.get(tokenKey) ?? 0) + 1);
    await this.reconcileDepth(tokenKey);
  }

  async releaseDepth(tokenKey: string) {
    const count = this.depthSubscriptionCounts.get(tokenKey) ?? 0;
    if (count > 1) {
      this.depthSubscriptionCounts.set(tokenKey, count - 1);
      return;
    }
    this.depthSubscriptionCounts.delete(tokenKey);
    await this.reconcileDepth(tokenKey);
  }

  private reconcileDepth(tokenKey: string): Promise<void> {
    return this.enqueue(async () => {
      const [segment, token] = tokenKey.split("_");
      const marketSegmentId = Number(segment);
      if (!token || !Number.isFinite(marketSegmentId) || !this.ready) return;
      const wanted = this.depthSubscriptionCounts.has(tokenKey);
      const active = this.depthActive.has(tokenKey);
      if (wanted && !active) {
        await this.client.subscribeBestFive(token, marketSegmentId);
        this.depthActive.add(tokenKey);
      } else if (!wanted && active) {
        try { await this.client.unsubscribeBestFive(token, marketSegmentId); } catch {}
        this.depthActive.delete(tokenKey);
      }
    });
  }
}

const registry = new Map<string, FeedConnection>();

export async function getFeedConnection(session: StoredSession): Promise<FeedConnection> {
  let entry = registry.get(session.userId);
  if (!entry) {
    entry = new FeedConnection(session);
    registry.set(session.userId, entry);
  }
  await entry.connect();
  return entry;
}
