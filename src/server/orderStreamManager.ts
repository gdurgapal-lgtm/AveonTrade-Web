import { EventEmitter } from "events";
import { io, type Socket } from "socket.io-client";
import { toSafeSocketUrl } from "@/lib/safeSocketUrl";
import { ServerConfig } from "@/lib/serverConfig";
import type { StoredSession } from "@/lib/session";
import { normalizeOrder, isOpenOrder } from "@/types/trading";

/**
 * Real-time order & trade messages from the Synapsewave CloudRest streaming
 * API (https://developer.synapsewave.com/docs/MyCloudRest/real-time-streaming).
 *
 *  - connect to `messageSocket` (login response `others.messageSocket`) with socket.io, websocket transport
 *  - authenticate:    emit("loginAPI", { jToken })
 *  - receive:         on("MSG:DATA") — MessageType "ORD_NRML" (order) or "TRD_MSG" (trade)
 *
 * One upstream connection per logged-in user, shared by every browser tab that
 * has the SSE route open. Like marketFeedManager.ts this needs a long-running
 * Node server (`next dev` / `next start`), not a serverless function. The
 * access token stays on the server — the browser only receives the events.
 */

export type StreamKind = "order" | "trade";
export type StreamState = "connecting" | "live" | "down";

const CLOSE_GRACE_MS = 30_000; // keep the socket briefly after the last tab leaves (page reloads / navigation)
const KICK_RETRY_BASE_MS = 2_000; // after the broker closes our socket on purpose
const KICK_RETRY_MAX_MS = 30_000;
const STABLE_CONNECTION_MS = 60_000; // a connection this old counts as healthy again

/** The payload may be one object, an array of them, or a JSON string of either. */
export function toMessages(payload: unknown): Record<string, unknown>[] {
  let value = payload;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  const list = Array.isArray(value) ? value : [value];
  return list.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
}

/** Maps a streamed message to the kind of event it represents (null = ignore). */
export function messageKind(message: Record<string, unknown>): StreamKind | null {
  const type = String(message.MessageType ?? "");
  if (type === "ORD_NRML") return "order";
  if (type === "TRD_MSG") return "trade";
  return null;
}

class OrderStreamConnection {
  readonly emitter = new EventEmitter();
  state: StreamState = "connecting";
  private socket: Socket | null = null;
  private subscribers = 0;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private connectedAt = 0;
  private kicks = 0;

  constructor(readonly userId: string, readonly url: string, readonly token: string) {
    this.emitter.setMaxListeners(0);
    this.start();
  }

  private setState(state: StreamState, reason?: string) {
    if (this.state === state && !reason) return;
    this.state = state;
    this.emitter.emit("status", { state, reason });
  }

  private start() {
    const socket = io(this.url, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 15_000,
      timeout: 10_000,
    });
    this.socket = socket;

    // `connect` fires again after every automatic reconnect, so we log in each time.
    socket.on("connect", () => {
      this.connectedAt = Date.now();
      socket.emit("loginAPI", { jToken: this.token });
      this.setState("live");
      // eslint-disable-next-line no-console
      console.log(`[AveonTrade] Order stream connected for ${this.userId}`);
    });
    socket.on("disconnect", (reason) => {
      this.setState("down", String(reason));
      // socket.io reconnects by itself after network problems, but NOT when the
      // server closed the socket on purpose ("io server disconnect") — do that
      // ourselves, backing off so a server that keeps kicking us isn't hammered.
      if (reason === "io server disconnect" && !this.disposed) {
        if (Date.now() - this.connectedAt > STABLE_CONNECTION_MS) this.kicks = 0;
        const delay = Math.min(KICK_RETRY_MAX_MS, KICK_RETRY_BASE_MS * 2 ** this.kicks);
        this.kicks += 1;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          if (!this.disposed) socket.connect();
        }, delay);
      }
    });
    socket.on("connect_error", (error) => this.setState("down", error?.message ?? "connect error"));

    socket.on("MSG:DATA", (payload: unknown) => {
      // DEBUG LOG ENABLED: Always print raw payloads and parsed status / filled quantities
      // eslint-disable-next-line no-console
      console.log("[AveonTrade][OrderStream DEBUG] Received MSG:DATA payload:", typeof payload === "string" ? payload : JSON.stringify(payload));

      for (const message of toMessages(payload)) {
        const kind = messageKind(message);
        
        // SynapseWave socket prices are sent in minor units (paisa).
        // DecimalLocator is the broker-provided divisor (e.g. 100). Keep this
        // marker on the event so every consumer normalizes consistently, while
        // REST snapshots remain untouched.
        const locator = Number(message.DecimalLocator ?? message.decimal_locator);
        const socketPriceDivisor = Number.isFinite(locator) && locator > 0 ? locator : 100;
        const socketMessage = { ...message, __socketPriceDivisor: socketPriceDivisor };
        let emittedData: Record<string, unknown> = socketMessage;

        if (kind === "order") {
          const normalized = normalizeOrder(socketMessage);
          // Send the marked raw socket payload. The browser store normalizes it once;
          // merging normalized fields here would cause a second divisor application.
          emittedData = socketMessage;
          // eslint-disable-next-line no-console
          console.log(`[AveonTrade][OrderStream DEBUG] Parsed kind: order, normalized status: ${normalized.status}, isOpen: ${isOpenOrder(normalized)}`);
        } else {
          // eslint-disable-next-line no-console
          if (kind === "trade") {
            const tradePriceRaw = message.TradedPrice ?? message.trade_price ?? message.tradePrice ?? message.price;
            const tradePrice = tradePriceRaw == null ? undefined : Number(tradePriceRaw) / socketPriceDivisor;
            console.log(`[AveonTrade][OrderStream DEBUG] Parsed kind: trade, tradeId: ${message.TradeNumber ?? message.trade_id ?? "N/A"}, orderNumber: ${message.OrderNumber ?? "N/A"}, uniqueCode: ${message.UniqueCode ?? "N/A"}, qty: ${message.TradeQty ?? message.trade_quantity ?? "N/A"}, price: ${tradePrice ?? "N/A"}`);
          } else {
            console.log(`[AveonTrade][OrderStream DEBUG] Parsed kind: ${kind}, status: ${message.status ?? message.OrderStatus ?? "N/A"}, filled: ${message.filled_quantity ?? message.TradedQTY ?? "N/A"}`);
          }
        }

        if (kind) this.emitter.emit("message", kind, emittedData);
      }
    });
  }

  retain() {
    this.subscribers += 1;
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
  }

  release() {
    this.subscribers = Math.max(0, this.subscribers - 1);
    if (this.subscribers === 0 && !this.closeTimer) {
      this.closeTimer = setTimeout(() => {
        this.closeTimer = null;
        if (this.subscribers === 0) this.dispose();
      }, CLOSE_GRACE_MS);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.closeTimer) clearTimeout(this.closeTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.emitter.emit("closed");
    this.emitter.removeAllListeners();
    const registry = getRegistry();
    if (registry.get(this.userId) === this) registry.delete(this.userId);
  }
}

// Module state must survive Next.js dev hot-reloads, or each reload would leak a socket.
const globalForStream = globalThis as unknown as { __aveonOrderStreams?: Map<string, OrderStreamConnection> };
function getRegistry() {
  if (!globalForStream.__aveonOrderStreams) globalForStream.__aveonOrderStreams = new Map();
  return globalForStream.__aveonOrderStreams;
}

/** Why the stream can't be used for this session (null = available). */
export function orderStreamUnavailableReason(session: StoredSession): string | null {
  if (!session.accessToken) return "No access token in this session.";
  if (!toSafeSocketUrl(session.messageSocketUrl || ServerConfig.messageSocketUrl)) {
    return "No message-socket URL for this session. Log out and log in again.";
  }
  return null;
}

export function getOrderStream(session: StoredSession): OrderStreamConnection | null {
  const url = toSafeSocketUrl(session.messageSocketUrl || ServerConfig.messageSocketUrl);
  if (!url || !session.accessToken) return null;

  const registry = getRegistry();
  const existing = registry.get(session.userId);
  if (existing && existing.url === url && existing.token === session.accessToken) return existing;
  existing?.dispose(); // re-login produced a new token / URL

  const created = new OrderStreamConnection(session.userId, url, session.accessToken);
  registry.set(session.userId, created);
  return created;
}