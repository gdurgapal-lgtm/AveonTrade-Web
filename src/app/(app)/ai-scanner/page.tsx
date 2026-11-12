"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  PREDEFINED_WATCHLIST_GROUPS,
  PredefinedWatchlistGroup,
} from "@/data/predefinedWatchlists";
import { resolvePredefinedWatchlist } from "@/lib/watchlistLoader";
import { useMarketStream } from "@/hooks/useMarketStream";
import {
  classifyInstrument,
  feedToken,
  isIndexInstrument,
  exchangeSegmentFor,
  normalizeInstrument,
  type Instrument,
  type TransactionType,
  type ProductType,
  type OrderKind,
} from "@/types/trading";
import {
  AnalysisSnapshot,
  ScanEvaluation,
  ScannedSignal,
  ScannerCategory,
  ScannerTimeframe,
} from "@/types/aiScanner";
import {
  SCANNER_MIN_BARS,
  evaluateInstrument,
  isMarketOpen,
  type ScannerCandle,
} from "@/lib/aiScannerEngine";
import OrderTicketModal from "@/components/market/OrderTicketModal";
import MarketDepth from "@/components/market/MarketDepth";
import dynamic from "next/dynamic";
import {
  Loader2,
  ArrowUpDown,
  Activity,
  BarChart3,
  Layers,
  Sparkles,
  AlertTriangle,
  Bell,
  BellOff,
  X,
} from "lucide-react";

const ChartViewPanel = dynamic(
  () => import("@/components/market/ChartViewPanel"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-aveon-panel text-xs text-aveon-muted font-mono">
        Loading Chart Workspace...
      </div>
    ),
  }
);

const TIMEFRAMES: ScannerTimeframe[] = ["5m", "15m", "1h", "1D"];
const CHART_RANGES = [
  { label: "1D", days: 1 },
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
];
const CHART_TIMEFRAMES = ["1m", "5m", "15m", "1h", "D"];

const CATEGORIES: { id: ScannerCategory; label: string }[] = [
  { id: "ALL", label: "All Signals" },
  { id: "BULLISH_BREAKOUT", label: "Bullish Breakouts" },
  { id: "BEARISH_BREAKDOWN", label: "Bearish Breakdowns" },
  { id: "VOLUME_SPIKE", label: "Volume Spikes" },
  { id: "EMA_CROSSOVER", label: "EMA Crossovers" },
  { id: "RSI_REVERSAL", label: "RSI Pullback Turns" },
  { id: "TREND_CONTINUATION", label: "Trend Continuation" },
];

type SortKey =
  | "symbol"
  | "ltp"
  | "change"
  | "rsi"
  | "confidence"
  | "rr"
  | "volume";

interface EnrichedSignal extends ScannedSignal {
  sector: string;
  /** When this signal first appeared in the current session of the page. */
  firstSeen: number;
  /** Appeared after the initial load (not part of the baseline). */
  isNew: boolean;
}

interface LiveTechnicalReport {
  analysis: AnalysisSnapshot;
  quoteAgeMs: number;
  signal: EnrichedSignal | null;
  noSignalReason: string | null;
}

interface InstrumentEval {
  evaluation: ScanEvaluation | null;
  /** Why there is no evaluation (no tick, stale tick, history loading ...). */
  note?: string;
  quoteAt: number;
}

interface DataIssue {
  symbol: string;
  message: string;
}

interface ScanStats {
  universe: number;
  historyLoaded: number;
  noQuote: number;
  staleQuote: number;
  evaluated: number;
  signals: number;
  rejects: Record<string, number>;
  issues: DataIssue[];
  marketOpen: boolean;
  scannedAt: number;
  historyAt: number;
}

const EMPTY_INSTRUMENTS: Instrument[] = [];
const EMPTY_STATS: ScanStats = {
  universe: 0,
  historyLoaded: 0,
  noQuote: 0,
  staleQuote: 0,
  evaluated: 0,
  signals: 0,
  rejects: {},
  issues: [],
  marketOpen: false,
  scannedAt: 0,
  historyAt: 0,
};

/** A quote older than this is not used for signals or order sizing. */
const QUOTE_MAX_AGE_MS = 30_000;
/** Signals are re-evaluated on this cadence - NOT on every tick. */
const SCAN_INTERVAL_MS = 1_000;
/** A signal that stops qualifying stays visible this long (stops row flicker around VWAP/EMA). */
const SIGNAL_HOLD_MS = 5_000;
/** A signal must qualify on this many scans before it is shown. */
const SIGNAL_CONFIRM_SCANS = 2;
const BASELINE_GRACE_MS = 5_000;
const NEW_BADGE_MS = 90_000;
const PREFS_KEY = "aveon.aiScanner.prefs.v1";
const MIN_SCORE_OPTIONS = [50, 60, 70, 80];

const REJECT_LABELS: Record<string, string> = {
  NO_HISTORY: "No history",
  STALE_HISTORY: "Stale history",
  TOO_FEW_BARS: "Too few bars",
  BAD_LTP: "Bad live price",
  LTP_DEVIATION: "Live price vs history mismatch",
  NO_VWAP: "No session VWAP yet",
  NO_TREND_ALIGNMENT: "No trend alignment",
  LOW_SCORE: "Score below 50",
  NO_LOT_SIZE: "Lot size missing",
};
/** Rejections that mean "something is wrong with the data", as opposed to "no setup right now". */
const DATA_QUALITY_REJECTS = new Set(["NO_HISTORY", "STALE_HISTORY", "TOO_FEW_BARS", "BAD_LTP", "LTP_DEVIATION", "NO_LOT_SIZE"]);

function symbolOf(inst: Instrument): string {
  const i = inst as Instrument & { instrumentSymbol?: string; name?: string };
  return i.tradingSymbol || i.symbol || i.instrumentSymbol || i.name || "";
}

function normalizeCandles(data: unknown[]): ScannerCandle[] {
  return data
    .map((raw) => {
      const c = raw as Record<string, unknown>;
      const t = Number(c.time);
      return {
        O: Number(c.O ?? c.open),
        H: Number(c.H ?? c.high),
        L: Number(c.L ?? c.low),
        C: Number(c.C ?? c.close),
        V: Number(c.V ?? c.volume ?? 0),
        DT: String(c.DT ?? c.datetime ?? (Number.isFinite(t) && t > 0 ? new Date(t * 1000).toISOString() : "")),
      };
    })
    .filter((c) => [c.O, c.H, c.L, c.C, c.V].every(Number.isFinite) && !!c.DT);
}

/** Replace everything from the first refreshed candle onward; keep older candles. */
function mergeCandles(old: ScannerCandle[], fresh: ScannerCandle[]): ScannerCandle[] {
  if (!fresh.length) return old;
  const firstFresh = Date.parse(fresh[0].DT);
  if (!Number.isFinite(firstFresh)) return fresh;
  const kept = old.filter((c) => {
    const t = Date.parse(c.DT);
    return Number.isFinite(t) && t < firstFresh;
  });
  return kept.concat(fresh);
}

async function fetchHistory(
  inst: Instrument,
  interval: "DAY" | "MIN",
  days: number,
  countBack: number,
  signal: AbortSignal
): Promise<ScannerCandle[]> {
  const segment = exchangeSegmentFor(inst) || inst.exchangeSegment || inst.exchange;
  if (!segment || !inst.token) throw new Error("Instrument exchange segment/token missing");
  const params = new URLSearchParams({
    exchangeSegment: String(segment),
    token: String(inst.token),
    interval,
    days: String(days),
    countBack: String(countBack),
  });
  const response = await fetch(`/api/broker/chart-history?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
    signal,
  });
  if (response.status === 401) throw new Error("Session expired - please log in again");
  let payload: { success?: boolean; status?: string; message?: string; data?: unknown } | null = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`History response unreadable (${response.status})`);
  }
  // The route reports upstream failures as HTTP 200 with success:false, so check the body, not just response.ok.
  if (!response.ok || payload?.success === false || payload?.status === "error" || !Array.isArray(payload?.data)) {
    throw new Error(payload?.message || `History request failed (${response.status})`);
  }
  return normalizeCandles(payload.data);
}

function loadPrefs(): Partial<{
  watchlist: string;
  timeframe: ScannerTimeframe;
  risk: number;
  minScore: number;
  sound: boolean;
}> {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function beep() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
    osc.onended = () => void ctx.close();
  } catch {
    /* audio is best-effort */
  }
}

const fmtTime = (ms: number) =>
  ms > 0
    ? new Date(ms).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Kolkata" })
    : "—";
const fmtInr = (v: number) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export default function AiScannerPage() {
  const [watchlists] = useState<PredefinedWatchlistGroup[]>(
    PREDEFINED_WATCHLIST_GROUPS
  );
  const [activeId, setActiveId] = useState<string>("nifty50");
  const [resolvedItemsMap, setResolvedItemsMap] = useState<
    Record<string, Instrument[]>
  >({});
  const [resolving, setResolving] = useState(true);

  const [timeframe, setTimeframe] = useState<ScannerTimeframe>("15m");
  const [selectedCategory, setSelectedCategory] =
    useState<ScannerCategory>("ALL");
  const [sideFilter, setSideFilter] = useState<"ALL" | "BUY" | "SELL">("ALL");
  const [minConfidence, setMinConfidence] = useState<number>(50);
  const [riskPerTrade, setRiskPerTrade] = useState<number>(2500);
  const [riskInput, setRiskInput] = useState<string>("2500");
  const [soundOn, setSoundOn] = useState<boolean>(false);
  const [showHealth, setShowHealth] = useState<boolean>(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState<{ loaded: number; total: number }>({ loaded: 0, total: 0 });
  const [scan, setScan] = useState<{
    rows: EnrichedSignal[];
    evals: Record<string, InstrumentEval>;
    stats: ScanStats;
  }>({ rows: [], evals: {}, stats: EMPTY_STATS });

  // Candle history lives in refs: it is large, changes by the second, and must never trigger a render by itself.
  const historyRef = useRef<Map<string, { candles: ScannerCandle[]; fetchedAt: number }>>(new Map());
  const historyFailRef = useRef<
    Map<string, { symbol: string; message: string; attempts: number; nextTry: number }>
  >(new Map());
  const stickyRef = useRef<
    Map<string, { sig: EnrichedSignal; firstSeen: number; lastOk: number; seen: number }>
  >(new Map());
  const alertedRef = useRef<Set<string>>(new Set());
  const baselineUntilRef = useRef<number>(Infinity);
  const prefsLoadedRef = useRef(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [sortKey, setSortKey] = useState<SortKey>("confidence");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [depthOrder, setDepthOrder] = useState<{
    side: TransactionType;
    price?: number;
    quantity?: number;
    productType?: ProductType;
    orderKind?: OrderKind;
  } | null>(null);
  const [activeOrderInstrument, setActiveOrderInstrument] =
    useState<Instrument | null>(null);
  const [cashPair, setCashPair] = useState<Instrument[]>([]);

  const [popupModalOpen, setPopupModalOpen] = useState(false);
  const [popupActiveTab, setPopupActiveTab] = useState<"CHART" | "DEPTH">(
    "CHART"
  );
  const [popupInstrument, setPopupInstrument] = useState<Instrument | null>(
    null
  );

  const [analyzedInstrument, setAnalyzedInstrument] =
    useState<Instrument | null>(null);

  const [chartRangeIdx, setChartRangeIdx] = useState(2);
  const [chartTimeframe, setChartTimeframe] = useState("15m");
  const [candles, setCandles] = useState<any[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartMessage, setChartMessage] = useState<string | null>(null);


  useEffect(() => {
    const handleGlobalHotkeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (orderModalOpen) {
          event.preventDefault();
          setOrderModalOpen(false);
          setDepthOrder(null);
          return;
        }
        if (analyzedInstrument) {
          event.preventDefault();
          setAnalyzedInstrument(null);
          return;
        }
        if (popupModalOpen) {
          event.preventDefault();
          setPopupModalOpen(false);
          return;
        }
      }
    };

    window.addEventListener("keydown", handleGlobalHotkeys);
    return () => window.removeEventListener("keydown", handleGlobalHotkeys);
  }, [popupModalOpen, orderModalOpen, analyzedInstrument]);

  useEffect(() => {
    const openOrderEvent = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          instrument?: Instrument;
          side?: TransactionType;
          price?: number;
          quantity?: number;
          productType?: ProductType;
          orderKind?: OrderKind;
        }>
      ).detail;
      const targetInst = detail?.instrument ?? popupInstrument;
      if (!targetInst) return;

      if (isIndexInstrument(targetInst)) {
        window.alert("Indices Instruments are non-tradable");
        return;
      }

      setActiveOrderInstrument(targetInst);
      setDepthOrder(
        detail?.side
          ? {
              side: detail.side,
              price: detail.price,
              quantity: detail.quantity,
              productType: detail.productType,
              orderKind: detail.orderKind,
            }
          : { side: "BUY" }
      );
      setOrderModalOpen(true);
    };

    window.addEventListener("aveon:open-order-entry", openOrderEvent);
    return () =>
      window.removeEventListener("aveon:open-order-entry", openOrderEvent);
  }, [popupInstrument]);

  useEffect(() => {
    let cancelled = false;

    async function loadActiveWatchlistTokens() {
      setResolving(true);
      setResolveError(null);
      if (resolvedItemsMap[activeId]) {
        if (!cancelled) setResolving(false);
        return;
      }

      try {
        const items = await resolvePredefinedWatchlist(activeId);
        if (!cancelled) {
          setResolvedItemsMap((prev) => ({ ...prev, [activeId]: items }));
        }
      } catch (err) {
        console.error(
          `Failed to resolve predefined watchlist ${activeId}:`,
          err
        );
        if (!cancelled) {
          setResolveError("Could not resolve this watchlist's exchange tokens. Check your connection and re-select the list.");
        }
      } finally {
        if (!cancelled) setResolving(false);
      }
    }

    loadActiveWatchlistTokens();
    return () => {
      cancelled = true;
    };
  }, [activeId, resolvedItemsMap]);

  const currentInstruments = resolvedItemsMap[activeId] ?? EMPTY_INSTRUMENTS;
  const activeCashPair = orderModalOpen ? cashPair : [];
  const { quotes, quotesByToken, connected } = useMarketStream(
    currentInstruments,
    popupInstrument,
    activeCashPair
  );

  useEffect(() => {
    if (
      !orderModalOpen ||
      !activeOrderInstrument ||
      !activeOrderInstrument.token
    ) {
      setCashPair([]);
      return;
    }

    const segment = exchangeSegmentFor(activeOrderInstrument).toUpperCase();
    const isCash = segment === "NSE_EQ" || segment === "BSE_EQ";
    if (!isCash) {
      setCashPair([activeOrderInstrument]);
      return;
    }

    let cancelled = false;
    const symbolQuery = (
      activeOrderInstrument.symbol ||
      activeOrderInstrument.tradingSymbol ||
      ""
    ).trim();
    const oppositeSegment = segment === "NSE_EQ" ? "BSE_EQ" : "NSE_EQ";
    const expectedMktSegId = oppositeSegment === "NSE_EQ" ? 1 : 3;

    setCashPair([activeOrderInstrument]);

    const fetchCashPair = async () => {
      try {
        const lookupUrl =
          "/api/broker/scrip-lookup?q=" + encodeURIComponent(symbolQuery);
        const response = await fetch(lookupUrl, { credentials: "include" });
        const json = await response.json();
        const hits =
          json?.data?.result?.hits?.hits ?? json?.data?.hits?.hits ?? [];
        const hitsArray = Array.isArray(hits) ? hits : [hits];

        const targetSym = symbolQuery.toUpperCase();
        const matchedOppositeHit = hitsArray.find((h: any) => {
          const source = h?._source || h;
          if (!source) return false;
          const hitSegment = String(
            source.ExchangeSegment || ""
          ).toUpperCase();
          const hitMktSegId = Number(
            source.MktSegId ?? source.nMarketSegmentId ?? 0
          );
          const isOppositeExchange =
            hitSegment === oppositeSegment || hitMktSegId === expectedMktSegId;
          if (!isOppositeExchange) return false;

          if (activeOrderInstrument.isin && source.sISINCode) {
            return (
              String(source.sISINCode).trim().toUpperCase() ===
              activeOrderInstrument.isin.trim().toUpperCase()
            );
          }
          const hitSym = String(source.sSymbolnew || source.sSymbol || "")
            .trim()
            .toUpperCase();
          return hitSym === targetSym;
        });

        if (cancelled) return;

        if (matchedOppositeHit) {
          const rawSource = (matchedOppositeHit._source ||
            matchedOppositeHit) as Record<string, unknown>;
          const oppositeInst = normalizeInstrument(rawSource);
          setCashPair([activeOrderInstrument, oppositeInst]);
        } else {
          setCashPair([activeOrderInstrument]);
        }
      } catch {
        if (!cancelled) setCashPair([activeOrderInstrument]);
      }
    };

    void fetchCashPair();

    return () => {
      cancelled = true;
    };
  }, [orderModalOpen, activeOrderInstrument]);

  // ---- Preferences (restored after mount to avoid SSR hydration mismatch) ----
  useEffect(() => {
    const p = loadPrefs();
    if (p.watchlist && watchlists.some((w) => w.id === p.watchlist)) setActiveId(p.watchlist);
    if (p.timeframe && TIMEFRAMES.includes(p.timeframe)) setTimeframe(p.timeframe);
    if (typeof p.risk === "number" && Number.isFinite(p.risk) && p.risk >= 100) {
      setRiskPerTrade(p.risk);
      setRiskInput(String(p.risk));
    }
    if (typeof p.minScore === "number" && MIN_SCORE_OPTIONS.includes(p.minScore)) setMinConfidence(p.minScore);
    if (typeof p.sound === "boolean") setSoundOn(p.sound);
    prefsLoadedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!prefsLoadedRef.current) return;
    try {
      window.localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({ watchlist: activeId, timeframe, risk: riskPerTrade, minScore: minConfidence, sound: soundOn })
      );
    } catch {
      /* storage may be unavailable */
    }
  }, [activeId, timeframe, riskPerTrade, minConfidence, soundOn]);

  const commitRisk = (raw: string) => {
    const v = Number(raw.replace(/,/g, ""));
    if (Number.isFinite(v) && v >= 100) {
      const clamped = Math.min(v, 10_000_000);
      setRiskPerTrade(clamped);
      setRiskInput(String(clamped));
    } else {
      setRiskInput(String(riskPerTrade));
    }
  };

  // Latest-value refs for the timers below (so timers never close over stale props).
  const quotesRef = useRef(quotesByToken);
  const connectedRef = useRef(connected);
  const soundRef = useRef(soundOn);
  const minConfRef = useRef(minConfidence);
  useEffect(() => {
    quotesRef.current = quotesByToken;
    connectedRef.current = connected;
    soundRef.current = soundOn;
    minConfRef.current = minConfidence;
  });

  // ---- History loader: initial load, then incremental refresh while the market is open ----
  useEffect(() => {
    if (!currentInstruments.length || resolving) return;
    const ac = new AbortController();
    const daily = timeframe === "1D";
    const interval: "DAY" | "MIN" = daily ? "DAY" : "MIN";
    const refreshMs = daily ? 5 * 60_000 : 45_000;
    const closedRefreshMs = 30 * 60_000;
    const keyOf = (inst: Instrument) => `${feedToken(inst) || `${inst.exchange}_${inst.token}`}_${interval}`;

    // A new universe/timeframe starts a fresh signal session.
    stickyRef.current = new Map();
    alertedRef.current = new Set();
    baselineUntilRef.current = Infinity;

    const countLoaded = () => currentInstruments.filter((i) => historyRef.current.has(keyOf(i))).length;
    setLoadProgress({ loaded: countLoaded(), total: currentInstruments.length });

    const loadOne = async (inst: Instrument) => {
      const ck = keyOf(inst);
      const existing = historyRef.current.get(ck);
      try {
        // First load pulls the full window; refreshes only pull the tail and merge it in.
        const candles = await fetchHistory(
          inst,
          interval,
          existing ? (daily ? 10 : 3) : daily ? 365 : 15,
          existing ? (daily ? 30 : 1000) : 3000,
          ac.signal
        );
        const merged = existing ? mergeCandles(existing.candles, candles) : candles;
        if (!existing && merged.length < SCANNER_MIN_BARS) {
          throw new Error(`Insufficient candle history (${merged.length} candles)`);
        }
        historyRef.current.set(ck, { candles: merged, fetchedAt: Date.now() });
        historyFailRef.current.delete(ck);
      } catch (error) {
        if (ac.signal.aborted) return;
        const prev = historyFailRef.current.get(ck);
        const attempts = (prev?.attempts ?? 0) + 1;
        const message = error instanceof Error ? error.message : "Historical data unavailable";
        const permanent = message.startsWith("Insufficient");
        historyFailRef.current.set(ck, {
          symbol: symbolOf(inst),
          message,
          attempts,
          nextTry: Date.now() + (permanent ? 10 * 60_000 : Math.min(60_000, 5_000 * 2 ** Math.min(attempts, 4))),
        });
      }
    };

    let running = false;
    let firstCycleDone = false;
    const cycle = async () => {
      if (running || ac.signal.aborted) return;
      running = true;
      try {
        const now = Date.now();
        const due = currentInstruments
          .filter((inst) => {
            const ck = keyOf(inst);
            const fail = historyFailRef.current.get(ck);
            if (fail && now < fail.nextTry) return false;
            const entry = historyRef.current.get(ck);
            if (!entry) return true;
            const open = isMarketOpen(now, classifyInstrument(inst));
            return now - entry.fetchedAt >= (open ? refreshMs : closedRefreshMs);
          })
          .sort(
            (a, b) =>
              (historyRef.current.get(keyOf(a))?.fetchedAt ?? 0) - (historyRef.current.get(keyOf(b))?.fetchedAt ?? 0)
          );
        let cursor = 0;
        const workers = Array.from({ length: Math.min(3, due.length) }, async () => {
          while (!ac.signal.aborted) {
            const i = cursor++;
            if (i >= due.length) return;
            await loadOne(due[i]);
            if (!ac.signal.aborted) setLoadProgress({ loaded: countLoaded(), total: currentInstruments.length });
          }
        });
        await Promise.all(workers);

        // Keep memory bounded when the user browses many watchlists.
        if (historyRef.current.size > 150) {
          const live = new Set(currentInstruments.map(keyOf));
          const stale = [...historyRef.current.entries()]
            .filter(([k]) => !live.has(k))
            .sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);
          for (const [k] of stale.slice(0, historyRef.current.size - 150)) historyRef.current.delete(k);
        }
      } finally {
        running = false;
        if (!firstCycleDone && !ac.signal.aborted) {
          firstCycleDone = true;
          // Signals present when the initial load finishes are the baseline; later arrivals are "NEW".
          baselineUntilRef.current = Date.now() + BASELINE_GRACE_MS;
        }
      }
    };

    void cycle();
    const id = setInterval(() => void cycle(), 10_000);
    return () => {
      ac.abort();
      clearInterval(id);
    };
  }, [currentInstruments, timeframe, resolving]);

  // ---- Scan loop: 1 Hz, independent of tick rate ----
  useEffect(() => {
    if (resolving) return;
    const interval = timeframe === "1D" ? "DAY" : "MIN";

    const run = () => {
      const now = Date.now();
      const quotes = quotesRef.current;
      const isLive = connectedRef.current === true;
      const evals: Record<string, InstrumentEval> = {};
      const fresh: EnrichedSignal[] = [];
      const rejects: Record<string, number> = {};
      const issues: DataIssue[] = [];
      let historyLoaded = 0, noQuote = 0, staleQuote = 0, evaluated = 0, historyAt = 0;

      for (const inst of currentInstruments) {
        const key = feedToken(inst) || `${inst.exchange}_${inst.token}`;
        const ck = `${key}_${interval}`;
        const symbol = symbolOf(inst);
        const entry = historyRef.current.get(ck);
        const fail = historyFailRef.current.get(ck);
        if (entry) {
          historyLoaded++;
          historyAt = Math.max(historyAt, entry.fetchedAt);
        }
        if (fail) issues.push({ symbol, message: entry ? `Refresh failing: ${fail.message}` : fail.message });

        if (!entry) {
          evals[key] = { evaluation: null, note: fail?.message ?? "Historical candles are still loading.", quoteAt: 0 };
          continue;
        }
        const q = quotes[key] as { ltp?: number; receivedAt?: number } | undefined;
        if (!q || !q.ltp || q.ltp <= 0 || !q.receivedAt) {
          noQuote++;
          evals[key] = { evaluation: null, note: "No live exchange tick received for this instrument.", quoteAt: 0 };
          continue;
        }
        const age = now - q.receivedAt;
        if (age > QUOTE_MAX_AGE_MS) {
          staleQuote++;
          evals[key] = {
            evaluation: null,
            note: `Live quote is stale (${Math.round(age / 1000)}s old > ${QUOTE_MAX_AGE_MS / 1000}s limit). Waiting for a fresh tick.`,
            quoteAt: q.receivedAt,
          };
          continue;
        }
        if (!isLive) continue;

        const evaluation = evaluateInstrument(inst, entry.candles, timeframe, riskPerTrade, q.ltp, now);
        evaluated++;
        evals[key] = { evaluation, quoteAt: q.receivedAt };
        if (evaluation.signal) {
          const sector = (inst as Instrument & { sector?: string }).sector || "—";
          fresh.push({ ...evaluation.signal, sector, firstSeen: now, isNew: false });
        } else if (evaluation.reject) {
          rejects[evaluation.reject] = (rejects[evaluation.reject] ?? 0) + 1;
          if (DATA_QUALITY_REJECTS.has(evaluation.reject)) {
            issues.push({
              symbol,
              message: `${REJECT_LABELS[evaluation.reject]}${evaluation.rejectDetail ? `: ${evaluation.rejectDetail}` : ""}`,
            });
          }
        }
      }

      // Hold + confirm: stops a symbol flickering in/out as price wiggles around VWAP / EMA 21.
      const sticky = stickyRef.current;
      const seenNow = new Set<string>();
      for (const s of fresh) {
        seenNow.add(s.id);
        const prev = sticky.get(s.id);
        if (prev) {
          prev.sig = s;
          prev.lastOk = now;
          prev.seen++;
        } else sticky.set(s.id, { sig: s, firstSeen: now, lastOk: now, seen: 1 });
      }
      const rows: EnrichedSignal[] = [];
      const newcomers: EnrichedSignal[] = [];
      for (const [id, st] of [...sticky.entries()]) {
        if (!seenNow.has(id) && (!isLive || now - st.lastOk > SIGNAL_HOLD_MS)) {
          sticky.delete(id);
          continue;
        }
        if (st.seen < SIGNAL_CONFIRM_SCANS) continue;
        const isNew = st.firstSeen > baselineUntilRef.current && now - st.firstSeen < NEW_BADGE_MS;
        const row = { ...st.sig, firstSeen: st.firstSeen, isNew };
        rows.push(row);
        if (isNew && !alertedRef.current.has(id)) {
          alertedRef.current.add(id);
          newcomers.push(row);
        }
      }
      if (soundRef.current && newcomers.some((r) => r.confidence >= minConfRef.current)) beep();

      const marketOpen = currentInstruments.some((i) => isMarketOpen(now, classifyInstrument(i)));
      setScan({
        rows,
        evals,
        stats: {
          universe: currentInstruments.length,
          historyLoaded,
          noQuote,
          staleQuote,
          evaluated,
          signals: rows.length,
          rejects,
          issues,
          marketOpen,
          scannedAt: now,
          historyAt,
        },
      });
    };

    run();
    const id = setInterval(run, SCAN_INTERVAL_MS);
    return () => clearInterval(id);
  }, [currentInstruments, resolving, timeframe, riskPerTrade]);

  useEffect(() => {
    if (
      !popupModalOpen ||
      popupActiveTab !== "CHART" ||
      !popupInstrument ||
      !popupInstrument.token
    ) {
      setCandles([]);
      return;
    }

    let cancelled = false;
    setChartLoading(true);
    setChartMessage(null);

    const loadChartCandles = async () => {
      const segment =
        exchangeSegmentFor(popupInstrument) ||
        popupInstrument.exchange ||
        "NSE_EQ";
      const token = popupInstrument.token;
      const range = CHART_RANGES[chartRangeIdx] ?? CHART_RANGES[2];

      try {
        const params = new URLSearchParams({
          exchangeSegment: String(segment),
          token: String(token),
          interval: "MIN",
          days: String(range.days),
          countBack: "1500",
        });
        const proxyUrl = `/api/broker/chart-history?${params.toString()}`;

        const res = await fetch(proxyUrl, { credentials: "include" });
        const json = await res.json();

        if (cancelled) return;

        if (json && Array.isArray(json.data) && json.data.length > 0) {
          setCandles(json.data);
          setChartMessage(null);
        } else {
          setCandles([]);
          setChartMessage("No history records found for this instrument.");
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Chart history fetch error:", err);
          setChartMessage("Broker chart data gateway connection offline.");
        }
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    };

    void loadChartCandles();

    return () => {
      cancelled = true;
    };
  }, [popupModalOpen, popupActiveTab, popupInstrument, chartRangeIdx]);

  const scannedResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = scan.rows.filter((sig) => {
      if (selectedCategory !== "ALL" && sig.category !== selectedCategory) return false;
      if (sideFilter !== "ALL" && sig.tradePlan.side !== sideFilter) return false;
      if (sig.confidence < minConfidence) return false;
      return !q || symbolOf(sig.instrument).toLowerCase().includes(q) || sig.sector.toLowerCase().includes(q);
    });

    return filtered.sort((a, b) => {
      const symbolA = symbolOf(a.instrument);
      const symbolB = symbolOf(b.instrument);
      const values: Record<SortKey, [number | string, number | string]> = {
        symbol: [symbolA, symbolB],
        ltp: [a.ltp, b.ltp],
        change: [a.features.priceChangePct, b.features.priceChangePct],
        rsi: [a.features.rsi14, b.features.rsi14],
        confidence: [a.confidence, b.confidence],
        rr: [a.tradePlan.riskRewardRatio, b.tradePlan.riskRewardRatio],
        volume: [a.features.volumeRatio, b.features.volumeRatio],
      };
      const [av, bv] = values[sortKey];
      const result = typeof av === "string" ? av.localeCompare(String(bv)) : Number(av) - Number(bv);
      if (result !== 0) return sortOrder === "asc" ? result : -result;
      return symbolA.localeCompare(symbolB); // stable order for ties - rows do not jump around
    });
  }, [scan.rows, selectedCategory, sideFilter, minConfidence, searchQuery, sortKey, sortOrder]);

  const analyzedSymbol = analyzedInstrument ? symbolOf(analyzedInstrument) : "";

  const liveTechnicalReport = useMemo<{
    report: LiveTechnicalReport | null;
    blockReason: string | null;
  }>(() => {
    if (!analyzedInstrument) return { report: null, blockReason: null };
    if (connected !== true) {
      return { report: null, blockReason: "Live market stream disconnected. Analysis and order execution are halted." };
    }
    const key = feedToken(analyzedInstrument) || `${analyzedInstrument.exchange}_${analyzedInstrument.token}`;
    const entry = scan.evals[key];
    if (!entry) return { report: null, blockReason: "Waiting for the first scan of this instrument." };
    if (!entry.evaluation) return { report: null, blockReason: entry.note ?? "No evaluation available." };
    const { evaluation } = entry;
    if (!evaluation.analysis) {
      const label = evaluation.reject ? REJECT_LABELS[evaluation.reject] : "Not evaluated";
      return {
        report: null,
        blockReason: `${label}${evaluation.rejectDetail ? ` - ${evaluation.rejectDetail}` : ""}. Execution is blocked.`,
      };
    }
    const sector = (analyzedInstrument as Instrument & { sector?: string }).sector || "—";
    const live = scan.rows.find((r) => r.id === evaluation.signal?.id);
    const signal: EnrichedSignal | null = evaluation.signal
      ? { ...evaluation.signal, sector, firstSeen: live?.firstSeen ?? scan.stats.scannedAt, isNew: false }
      : null;
    return {
      report: {
        analysis: evaluation.analysis,
        quoteAgeMs: Math.max(0, scan.stats.scannedAt - entry.quoteAt),
        signal,
        noSignalReason: signal
          ? null
          : `${evaluation.reject ? REJECT_LABELS[evaluation.reject] : "No setup"}${evaluation.rejectDetail ? ` (${evaluation.rejectDetail})` : ""}`,
      },
      blockReason: null,
    };
  }, [analyzedInstrument, connected, scan.evals, scan.rows, scan.stats.scannedAt]);

  /** Short-selling cash equity is intraday-only: pre-select MIS so the ticket does not default to CNC. */
  const productHintFor = (inst: Instrument, side: "BUY" | "SELL"): ProductType | undefined =>
    side === "SELL" && (classifyInstrument(inst) === "STOCK" || classifyInstrument(inst) === "OTHER") ? "MIS" : undefined;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
  };

  const handleOpenPopup = (inst: Instrument, tab: "CHART" | "DEPTH") => {
    setPopupInstrument(inst);
    setPopupActiveTab(tab);
    setPopupModalOpen(true);
  };

  const popupInstAny = popupInstrument as Instrument & {
    companyName?: string;
    name?: string;
    instrumentSymbol?: string;
    tradingSymbol?: string;
    symbol?: string;
  };
  const popupDisplaySymbol =
    popupInstAny?.tradingSymbol ||
    popupInstAny?.symbol ||
    popupInstAny?.instrumentSymbol ||
    popupInstAny?.name;

  const activeQuote = popupInstrument
    ? quotesByToken[feedToken(popupInstrument) ?? ""] ||
      quotes[popupDisplaySymbol ?? ""] ||
      quotes[popupInstrument.tradingSymbol ?? ""] ||
      quotes[popupInstrument.symbol]
    : undefined;

  return (
    <div className="flex h-full w-full flex-col gap-2 overflow-hidden p-1 text-sm font-mono text-aveon-text bg-aveon-bg">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-aveon-border bg-aveon-panel px-3 py-2 shadow-sm flex-shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold text-aveon-text tracking-wide">
              Live AI Market Scanner & Screener
            </h1>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/15 text-blue-500 border border-blue-500/30">
              INSTITUTIONAL FEED
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-aveon-muted font-sans">
            Live broker quotes and historical-candle-based technical screening
            with ATR-based trade levels.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded border border-aveon-border bg-aveon-panel2 px-2.5 py-1 text-xs">
            <Activity
              size={13}
              className={
                connected
                  ? "text-emerald-500 animate-pulse"
                  : "text-amber-500"
              }
            />
            <span
              className={
                connected
                  ? "text-emerald-500 font-bold"
                  : "text-amber-500 font-bold"
              }
            >
              {connected ? "STREAM ACTIVE" : "CONNECTING..."}
            </span>
          </div>
          <div
            className={`rounded border px-2.5 py-1 text-xs font-bold ${
              scan.stats.marketOpen
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                : "border-aveon-border bg-aveon-panel2 text-aveon-muted"
            }`}
            title="Based on weekday + exchange hours; exchange holidays are not detected."
          >
            {scan.stats.marketOpen ? "MARKET OPEN" : "MARKET CLOSED"}
          </div>
        </div>
      </div>

      {/* Predefined Watchlist Group Tabs & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded border border-aveon-border bg-aveon-panel p-2 text-xs shadow-sm flex-shrink-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex flex-wrap items-center gap-1 rounded border border-aveon-border bg-aveon-panel2 p-0.5">
            {watchlists.map((group) => (
              <button
                key={group.id}
                onClick={() => setActiveId(group.id)}
                className={`rounded px-2.5 py-1 font-semibold transition ${
                  activeId === group.id
                    ? "bg-aveon-primary text-white"
                    : "text-aveon-muted hover:text-aveon-text"
                }`}
              >
                {group.name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded border border-aveon-border bg-aveon-panel2 p-0.5">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`rounded px-2 py-1 font-semibold transition ${
                  timeframe === tf
                    ? "bg-aveon-primary/20 text-aveon-primary"
                    : "text-aveon-muted hover:text-aveon-text"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded border border-aveon-border bg-aveon-panel2 p-0.5">
            {(["ALL", "BUY", "SELL"] as const).map((side) => (
              <button
                key={side}
                onClick={() => setSideFilter(side)}
                className={`rounded px-2.5 py-1 font-semibold transition ${
                  sideFilter === side
                    ? side === "BUY"
                      ? "bg-emerald-600 text-white"
                      : side === "SELL"
                      ? "bg-rose-600 text-white"
                      : "bg-aveon-primary/20 text-aveon-primary"
                    : "text-aveon-muted hover:text-aveon-text"
                }`}
              >
                {side}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Search symbol or sector..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded border border-aveon-border bg-aveon-panel2 px-2.5 py-1 text-xs text-aveon-text placeholder-aveon-muted focus:border-blue-500 focus:outline-none w-48 font-mono"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-aveon-muted">Min score:</span>
          <select
            value={minConfidence}
            onChange={(e) => setMinConfidence(Number(e.target.value))}
            className="rounded border border-aveon-border bg-aveon-panel2 px-1.5 py-1 text-aveon-text font-mono text-xs"
          >
            {MIN_SCORE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}+
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              setSoundOn((v) => !v);
              if (!soundOn) beep();
            }}
            className={`rounded border px-1.5 py-1 transition ${
              soundOn
                ? "border-blue-500/40 bg-blue-500/15 text-blue-500"
                : "border-aveon-border bg-aveon-panel2 text-aveon-muted hover:text-aveon-text"
            }`}
            title={soundOn ? "Sound alert for NEW signals: on" : "Sound alert for NEW signals: off"}
          >
            {soundOn ? <Bell size={13} /> : <BellOff size={13} />}
          </button>
          <span className="text-aveon-muted">Risk/Trade (₹):</span>
          <input
            type="text"
            inputMode="numeric"
            value={riskInput}
            onChange={(e) => setRiskInput(e.target.value)}
            onBlur={(e) => commitRisk(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRisk((e.target as HTMLInputElement).value);
            }}
            className="w-24 rounded border border-aveon-border bg-aveon-panel2 px-2 py-1 text-right text-aveon-text font-mono text-xs"
          />
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex flex-wrap items-center gap-1.5 flex-shrink-0">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`rounded border px-2.5 py-1 text-xs font-semibold transition ${
              selectedCategory === cat.id
                ? "border-blue-500 bg-blue-500/20 text-blue-500"
                : "border-aveon-border bg-aveon-panel text-aveon-muted hover:text-aveon-text"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Scan health */}
      <div className="flex-shrink-0 rounded border border-aveon-border bg-aveon-panel px-3 py-1.5 text-[11px] font-sans text-aveon-muted">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>
            Universe <b className="text-aveon-text">{scan.stats.universe}</b>
          </span>
          <span>
            History{" "}
            <b className="text-aveon-text">
              {scan.stats.historyLoaded}/{scan.stats.universe}
            </b>
          </span>
          <span>
            Live quotes <b className="text-aveon-text">{scan.stats.evaluated}</b>
            {scan.stats.noQuote + scan.stats.staleQuote > 0 && (
              <span className="text-amber-400"> (+{scan.stats.noQuote + scan.stats.staleQuote} no/stale tick)</span>
            )}
          </span>
          <span>
            Signals <b className="text-aveon-text">{scan.stats.signals}</b>
          </span>
          <span>Scanned {fmtTime(scan.stats.scannedAt)}</span>
          <span>Candles updated {fmtTime(scan.stats.historyAt)}</span>
          <button type="button" onClick={() => setShowHealth((v) => !v)} className="text-aveon-primary underline">
            {showHealth ? "Hide details" : "Details"}
            {scan.stats.issues.length > 0 && (
              <span className="text-amber-400 no-underline"> · {scan.stats.issues.length} data issue(s)</span>
            )}
          </button>
        </div>
        {showHealth && (
          <div className="mt-2 grid gap-3 md:grid-cols-2 border-t border-aveon-border pt-2">
            <div>
              <p className="font-bold text-aveon-text mb-1">Why symbols have no signal</p>
              {Object.keys(scan.stats.rejects).length === 0 ? (
                <p>—</p>
              ) : (
                Object.entries(scan.stats.rejects)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, v]) => (
                    <p key={k}>
                      {REJECT_LABELS[k] ?? k}: <b className="text-aveon-text">{v}</b>
                    </p>
                  ))
              )}
            </div>
            <div>
              <p className="font-bold text-aveon-text mb-1">Data issues</p>
              {scan.stats.issues.length === 0 ? (
                <p className="text-emerald-500">None</p>
              ) : (
                <div className="max-h-32 overflow-y-auto space-y-0.5">
                  {scan.stats.issues.map((i, idx) => (
                    <p key={`${i.symbol}-${idx}`} className="text-amber-400">
                      <b>{i.symbol}</b>: {i.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tabular List View */}
      {connected !== true && !resolving ? (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300">
          Market feed is not confirmed live. Scanner signals and order actions
          are disabled until the feed reconnects.
        </div>
      ) : resolveError ? (
        <div className="rounded border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
          {resolveError}
        </div>
      ) : scan.stats.historyLoaded === 0 && currentInstruments.length > 0 ? (
        <div className="rounded border border-aveon-border bg-aveon-panel p-6 text-center text-xs text-aveon-muted">
          Loading authenticated historical candles… {loadProgress.loaded}/{loadProgress.total}
        </div>
      ) : resolving ? (
        <div className="flex flex-col items-center justify-center p-12 bg-aveon-panel rounded border border-aveon-border shadow-sm flex-1">
          <Loader2 size={28} className="animate-spin text-blue-500 mb-2" />
          <p className="text-xs text-aveon-text font-semibold">
            Resolving Scrip Master Exchange Tokens for{" "}
            {watchlists.find((w) => w.id === activeId)?.name}...
          </p>
        </div>
      ) : scannedResults.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-10 bg-aveon-panel rounded border border-aveon-border text-center shadow-sm flex-1">
          <p className="text-xs font-bold text-aveon-text">
            No signals match your filter criteria.
          </p>
          <p className="text-[11px] text-aveon-muted mt-1 font-sans">
            No validated setup is available. Signals are withheld when live
            quotes or historical candles are missing or stale.
          </p>
          {scan.stats.issues.length > 0 && (
            <p className="text-[10px] text-amber-400 mt-2">
              {scan.stats.issues.length} instrument(s) have data issues - open Details above. No substitute values
              are generated.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded border border-aveon-border bg-aveon-panel overflow-hidden shadow-sm flex-1 flex flex-col min-h-0">
          <div className="overflow-x-auto overflow-y-auto scrollbar-thin flex-1 w-full">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-20 border-b border-aveon-border bg-aveon-panel text-aveon-muted uppercase tracking-wider text-xs font-bold shadow-sm">
                <tr>
                  <th
                    className="px-3.5 py-2.5 text-left cursor-pointer hover:text-aveon-text"
                    onClick={() => toggleSort("symbol")}
                  >
                    Symbol / Sector{" "}
                    <ArrowUpDown size={11} className="inline ml-1" />
                  </th>
                  <th
                    className="px-3.5 py-2.5 text-right cursor-pointer hover:text-aveon-text"
                    onClick={() => toggleSort("ltp")}
                  >
                    LTP (₹) <ArrowUpDown size={11} className="inline ml-1" />
                  </th>
                  <th
                    className="px-3.5 py-2.5 text-right cursor-pointer hover:text-aveon-text"
                    onClick={() => toggleSort("change")}
                  >
                    Bar Change (%){" "}
                    <ArrowUpDown size={11} className="inline ml-1" />
                  </th>
                  <th className="px-3.5 py-2.5 text-center">Setup Trigger</th>
                  <th
                    className="px-3.5 py-2.5 text-right cursor-pointer hover:text-aveon-text"
                    onClick={() => toggleSort("rsi")}
                  >
                    RSI (14) <ArrowUpDown size={11} className="inline ml-1" />
                  </th>
                  <th
                    className="px-3.5 py-2.5 text-right cursor-pointer hover:text-aveon-text"
                    onClick={() => toggleSort("volume")}
                  >
                    Volume / Avg{" "}
                    <ArrowUpDown size={11} className="inline ml-1" />
                  </th>
                  <th className="px-3.5 py-2.5 text-left">Trade Plan</th>
                  <th
                    className="px-3.5 py-2.5 text-right cursor-pointer hover:text-aveon-text"
                    onClick={() => toggleSort("rr")}
                  >
                    R : R <ArrowUpDown size={11} className="inline ml-1" />
                  </th>
                  <th
                    className="px-3.5 py-2.5 text-right cursor-pointer hover:text-aveon-text"
                    onClick={() => toggleSort("confidence")}
                  >
                    Setup Score{" "}
                    <ArrowUpDown size={11} className="inline ml-1" />
                  </th>
                  <th className="px-3.5 py-2.5 text-center">Quick Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-aveon-border/40 font-mono">
                {scannedResults.map((sig) => {
                  const isBuy = sig.tradePlan.side === "BUY";
                  const isPositive = sig.features.priceChangePct >= 0;
                  const instAny = sig.instrument as Instrument & {
                    name?: string;
                    instrumentSymbol?: string;
                    tradingSymbol?: string;
                    symbol?: string;
                  };
                  const displaySymbol =
                    instAny.tradingSymbol ||
                    instAny.symbol ||
                    instAny.instrumentSymbol ||
                    instAny.name ||
                    sig.instrument.symbol;

                  return (
                    <tr
                      key={sig.id}
                      className="transition-colors hover:bg-aveon-panel2/60"
                    >
                      <td className="px-3.5 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-aveon-text text-sm tracking-wide">
                            {displaySymbol}
                          </span>
                          <span
                            className={`px-1 py-0.2 text-[9px] font-bold rounded uppercase ${
                              isBuy
                                ? "bg-emerald-500/20 text-emerald-500"
                                : "bg-rose-500/20 text-rose-500"
                            }`}
                          >
                            {sig.tradePlan.side}
                          </span>
                        </div>
                        <div className="text-[11px] text-aveon-muted font-sans truncate max-w-[150px]">
                          {sig.sector}
                        </div>
                      </td>

                      <td
                        className={`px-3.5 py-2 text-right font-bold text-sm ${
                          isPositive ? "text-emerald-500" : "text-rose-500"
                        }`}
                      >
                        ₹
                        {sig.ltp.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                        })}
                      </td>

                      <td
                        className={`px-3.5 py-2 text-right font-bold text-sm ${
                          isPositive ? "text-emerald-500" : "text-rose-500"
                        }`}
                      >
                        {isPositive ? "+" : ""}
                        {sig.features.priceChangePct.toFixed(2)}%
                      </td>

                      <td className="px-3.5 py-2 text-center">
                        <span className="rounded bg-aveon-panel2 px-2 py-0.5 text-xs text-aveon-text border border-aveon-border font-sans">
                          {sig.categoryLabel}
                        </span>
                        {sig.isNew && (
                          <span className="ml-1 rounded bg-blue-500/20 px-1 py-0.5 text-[9px] font-bold text-blue-400">
                            NEW
                          </span>
                        )}
                        <div className="mt-0.5 text-[10px] text-aveon-muted font-sans">since {fmtTime(sig.firstSeen)}</div>
                      </td>

                      <td className="px-3.5 py-2 text-right text-aveon-text font-bold">
                        {sig.features.rsi14.toFixed(2)}
                      </td>

                      <td className="px-3.5 py-2 text-right text-aveon-muted">
                        {sig.features.volumeRatio > 0
                          ? `${sig.features.volumeRatio.toFixed(2)}x`
                          : "N/A"}
                      </td>

                      <td className="px-3.5 py-2 text-left text-aveon-muted whitespace-nowrap">
                        <div className="text-aveon-text">
                          <span className="text-rose-400">SL {sig.tradePlan.stopLoss.toFixed(2)}</span>
                          {" · "}
                          <span className="text-emerald-400">T1 {sig.tradePlan.target1.toFixed(2)}</span>
                        </div>
                        <div className="text-[11px]">
                          Qty {sig.tradePlan.suggestedQty} · Risk {fmtInr(sig.tradePlan.riskAmount)} ·{" "}
                          {fmtInr(sig.tradePlan.positionValue)}
                        </div>
                      </td>

                      <td className="px-3.5 py-2 text-right text-emerald-500 font-bold">
                        1:{Number(sig.tradePlan.riskRewardRatio).toFixed(2)}
                      </td>

                      <td className="px-3.5 py-2 text-right">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold ${
                            sig.confidence >= 80
                              ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                              : sig.confidence >= 65
                              ? "bg-blue-500/15 text-blue-500 border border-blue-500/30"
                              : "bg-amber-500/15 text-amber-500 border border-amber-500/30"
                          }`}
                        >
                          {sig.confidence}%
                        </span>
                        {sig.riskFlags.length > 0 && (
                          <span
                            className="ml-1 inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1 py-0.5 text-[10px] font-bold text-amber-400"
                            title={sig.riskFlags.join("\n")}
                          >
                            <AlertTriangle size={10} />
                            {sig.riskFlags.length}
                          </span>
                        )}
                      </td>

                      <td
                        className="px-3.5 py-2 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <button
                            disabled={sig.tradePlan.suggestedQty <= 0}
                            onClick={() => {
                              if (sig.tradePlan.suggestedQty <= 0) return;
                              if (isIndexInstrument(sig.instrument)) {
                                window.alert(
                                  "Indices Instruments are non-tradable"
                                );
                                return;
                              }
                              setActiveOrderInstrument(sig.instrument);
                              setDepthOrder({
                                side: sig.tradePlan.side,
                                price: sig.ltp,
                                quantity: sig.tradePlan.suggestedQty,
                                productType: productHintFor(sig.instrument, sig.tradePlan.side),
                              });
                              setOrderModalOpen(true);
                            }}
                            className={`h-5 w-5 rounded text-xs font-bold text-white transition flex items-center justify-center disabled:opacity-40 ${
                              isBuy
                                ? "bg-emerald-600 hover:bg-emerald-500"
                                : "bg-rose-600 hover:bg-rose-500"
                            }`}
                            title={
                              sig.tradePlan.suggestedQty <= 0
                                ? `Risk of one lot/share (${fmtInr(sig.tradePlan.oneLotRisk)}) exceeds your risk per trade`
                                : `Place ${sig.tradePlan.side} Order`
                            }
                          >
                            {sig.tradePlan.side === "BUY" ? "B" : "S"}
                          </button>
                          <button
                            onClick={() =>
                              setAnalyzedInstrument(sig.instrument)
                            }
                            className="px-2 py-0.5 rounded border border-sky-500/40 bg-sky-500/10 text-xs text-sky-400 hover:bg-sky-500/20 transition flex items-center gap-1 font-semibold"
                            title="Inspect Live Technical Breakdown & Trade Plan"
                          >
                            <Sparkles size={11} /> Analyze
                          </button>
                          <button
                            onClick={() =>
                              handleOpenPopup(sig.instrument, "CHART")
                            }
                            className="px-2 py-0.5 rounded border border-aveon-border bg-aveon-panel2 text-xs text-aveon-muted hover:text-aveon-text transition flex items-center gap-1"
                            title="Open Price Chart Modal"
                          >
                            <BarChart3 size={12} /> Chart
                          </button>
                          <button
                            onClick={() =>
                              handleOpenPopup(sig.instrument, "DEPTH")
                            }
                            className="px-2 py-0.5 rounded border border-aveon-border bg-aveon-panel2 text-xs text-aveon-muted hover:text-aveon-text transition flex items-center gap-1"
                            title="Open Market Depth Modal"
                          >
                            <Layers size={12} /> Depth
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Live Verified Technical Breakdown Modal */}
      {analyzedInstrument && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded border border-aveon-border bg-aveon-panel text-aveon-text shadow-2xl overflow-hidden font-mono">
            <div className="flex items-center justify-between border-b border-aveon-border bg-aveon-panel2 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Sparkles size={15} className="text-sky-400" />
                <span className="text-sm font-bold">Live Technical Analysis — {analyzedSymbol}</span>
                <span className="rounded bg-aveon-panel px-1.5 py-0.5 text-[10px] text-aveon-muted border border-aveon-border">
                  {exchangeSegmentFor(analyzedInstrument)} • {timeframe}
                </span>
              </div>
              <button onClick={() => setAnalyzedInstrument(null)} className="rounded p-1 text-aveon-muted hover:text-aveon-text">
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs overflow-y-auto">
              {liveTechnicalReport.blockReason || !liveTechnicalReport.report ? (
                <div className="flex items-start gap-2.5 rounded border border-rose-500/40 bg-rose-500/10 p-3 text-rose-300">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Live Validation Gate Blocked Analysis</p>
                    <p className="mt-1 text-[11px] font-sans">{liveTechnicalReport.blockReason}</p>
                  </div>
                </div>
              ) : (
                (() => {
                  const rpt = liveTechnicalReport.report;
                  const a = rpt.analysis;
                  const sig = rpt.signal;
                  const biasColor = (b: string) =>
                    b === "BULLISH" ? "text-emerald-400" : b === "BEARISH" ? "text-rose-400" : b === "NEUTRAL" ? "text-amber-400" : "text-aveon-muted";
                  return (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px]">
                        <span className="text-emerald-400 font-bold">
                          VERIFIED LIVE FEED • Quote Age: {(rpt.quoteAgeMs / 1000).toFixed(1)}s
                        </span>
                        <span className="text-aveon-muted">
                          Last bar: {fmtTime(Date.parse(a.lastBarTime))} IST ({a.barCount} {a.timeframe} bars)
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="rounded border border-aveon-border bg-aveon-panel2 p-2.5">
                          <p className="text-[10px] uppercase text-aveon-muted">Short-Term Bias ({timeframe} EMA 20/50 + RSI)</p>
                          <p className={`mt-1 text-sm font-bold ${biasColor(a.shortTermBias)}`}>{a.shortTermBias}</p>
                        </div>
                        <div className="rounded border border-aveon-border bg-aveon-panel2 p-2.5">
                          <p className="text-[10px] uppercase text-aveon-muted">Positional Trend (EMA 50/200)</p>
                          <p className={`mt-1 text-sm font-bold ${biasColor(a.positionalBias)}`}>
                            {a.positionalBias === "INSUFFICIENT_200_BARS" ? "Requires >= 200 Bars" : a.positionalBias}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 rounded border border-aveon-border bg-aveon-panel2 p-3">
                        <div>
                          <span className="text-[10px] text-aveon-muted block">Live LTP</span>
                          <span className="font-bold text-aveon-text">₹{a.ltp.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-aveon-muted block">EMA 20 / EMA 50</span>
                          <span className="font-bold text-aveon-text">₹{a.ema20.toFixed(2)} / ₹{a.ema50.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-aveon-muted block">EMA 200</span>
                          <span className="font-bold text-aveon-text">
                            {a.ema200 !== null ? `₹${a.ema200.toFixed(2)}` : "N/A (<200 bars)"}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-aveon-muted block">RSI (14) / ATR (14)</span>
                          <span className="font-bold text-aveon-text">{a.rsi14.toFixed(2)} / ₹{a.atr14.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-aveon-muted block">Prior 20-Bar Low / High</span>
                          <span className="font-bold text-aveon-text">₹{a.support20.toFixed(2)} / ₹{a.resistance20.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-aveon-muted block">Volume vs 20-Bar Avg</span>
                          <span className="font-bold text-aveon-text">
                            {a.volumeRatio.toFixed(2)}x ({Math.round(a.latestVolume).toLocaleString("en-IN")})
                          </span>
                        </div>
                      </div>

                      {sig ? (
                        <div className="rounded border border-aveon-border bg-aveon-panel2 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase text-aveon-muted">Validated {sig.categoryLabel} Plan</span>
                            <span className="text-xs font-bold text-sky-400">
                              Score: {sig.confidence}% • R:R 1:{Number(sig.tradePlan.riskRewardRatio).toFixed(2)}
                            </span>
                          </div>
                          <div className="grid grid-cols-5 gap-2 text-center">
                            {[
                              { l: "Side", v: sig.tradePlan.side, c: sig.tradePlan.side === "BUY" ? "text-emerald-400" : "text-rose-400" },
                              { l: "Entry (Live)", v: `₹${a.ltp.toFixed(2)}`, c: "text-aveon-text" },
                              { l: "Stop Loss", v: `₹${sig.tradePlan.stopLoss.toFixed(2)}`, c: "text-rose-400" },
                              { l: "Target 1 (2R)", v: `₹${sig.tradePlan.target1.toFixed(2)}`, c: "text-emerald-400" },
                              { l: "Target 2 (3R)", v: `₹${sig.tradePlan.target2.toFixed(2)}`, c: "text-emerald-400" },
                            ].map((x) => (
                              <div key={x.l} className="rounded border border-aveon-border bg-aveon-panel p-2">
                                <span className="text-[10px] text-aveon-muted block">{x.l}</span>
                                <span className={`font-bold ${x.c}`}>{x.v}</span>
                              </div>
                            ))}
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="rounded border border-aveon-border bg-aveon-panel p-2">
                              <span className="text-[10px] text-aveon-muted block">Qty (risk-sized)</span>
                              <span className="font-bold text-aveon-text">{sig.tradePlan.suggestedQty}</span>
                            </div>
                            <div className="rounded border border-aveon-border bg-aveon-panel p-2">
                              <span className="text-[10px] text-aveon-muted block">Capital at risk</span>
                              <span className="font-bold text-rose-400">{fmtInr(sig.tradePlan.riskAmount)}</span>
                            </div>
                            <div className="rounded border border-aveon-border bg-aveon-panel p-2">
                              <span className="text-[10px] text-aveon-muted block">Position value</span>
                              <span className="font-bold text-aveon-text">{fmtInr(sig.tradePlan.positionValue)}</span>
                            </div>
                          </div>
                          <p className="text-[10px] text-aveon-muted font-sans">{sig.tradePlan.invalidationReason}</p>
                          <ul className="list-disc pl-4 text-[11px] font-sans text-aveon-muted space-y-0.5">
                            {sig.score.confluenceFactors.map((f) => (
                              <li key={f}>{f}</li>
                            ))}
                          </ul>
                          {sig.riskFlags.length > 0 && (
                            <div className="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] font-sans text-amber-300 space-y-0.5">
                              {sig.riskFlags.map((f) => (
                                <p key={f} className="flex items-start gap-1.5">
                                  <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {f}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="rounded border border-aveon-border bg-aveon-panel2 p-3 text-[11px] font-sans text-aveon-muted">
                          No actionable setup right now: {rpt.noSignalReason}.
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            const inst = analyzedInstrument;
                            setAnalyzedInstrument(null);
                            handleOpenPopup(inst, "CHART");
                          }}
                          className="rounded border border-aveon-border bg-aveon-panel2 px-3 py-1.5 text-xs font-semibold text-aveon-text hover:bg-aveon-panel"
                        >
                          Inspect Chart
                        </button>
                        <button
                          type="button"
                          disabled={!sig || isIndexInstrument(analyzedInstrument) || sig.tradePlan.suggestedQty <= 0}
                          onClick={() => {
                            if (!sig || sig.tradePlan.suggestedQty <= 0) return;
                            if (isIndexInstrument(analyzedInstrument)) {
                              window.alert("Indices Instruments are non-tradable");
                              return;
                            }
                            setActiveOrderInstrument(analyzedInstrument);
                            setDepthOrder({
                              side: sig.tradePlan.side,
                              price: a.ltp,
                              quantity: sig.tradePlan.suggestedQty,
                              productType: productHintFor(analyzedInstrument, sig.tradePlan.side),
                            });
                            setAnalyzedInstrument(null);
                            setOrderModalOpen(true);
                          }}
                          className={`rounded px-4 py-1.5 text-xs font-bold text-white transition disabled:opacity-40 ${
                            sig?.tradePlan.side === "SELL" ? "bg-rose-600 hover:bg-rose-500" : "bg-emerald-600 hover:bg-emerald-500"
                          }`}
                        >
                          {sig ? `Open ${sig.tradePlan.side} Ticket (Qty: ${sig.tradePlan.suggestedQty})` : "No setup"}
                        </button>
                      </div>
                    </>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {/* Interactive Popup Modal */}
      {popupModalOpen && popupInstrument && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className="flex flex-col w-full max-w-6xl h-[680px] rounded border border-aveon-border bg-aveon-panel text-aveon-text shadow-2xl overflow-hidden font-mono">
            <div className="flex items-center justify-between border-b border-aveon-border px-4 py-2.5 bg-aveon-panel2">
              <div className="flex items-center gap-3">
                <span className="text-base font-bold text-aveon-text">
                  {popupDisplaySymbol}
                </span>
                <span className="text-xs text-aveon-muted">
                  {popupInstrument.exchange} •{" "}
                  {popupInstAny.companyName || popupDisplaySymbol}
                </span>
              </div>

              <div className="flex items-center gap-1 bg-aveon-panel p-0.5 rounded border border-aveon-border">
                <button
                  onClick={() => setPopupActiveTab("CHART")}
                  className={`px-3 py-1 rounded text-xs font-semibold transition ${
                    popupActiveTab === "CHART"
                      ? "bg-aveon-primary text-white"
                      : "text-aveon-muted hover:text-aveon-text"
                  }`}
                >
                  ChartViewPanel
                </button>
                <button
                  onClick={() => setPopupActiveTab("DEPTH")}
                  className={`px-3.5 py-1 rounded text-xs font-semibold transition ${
                    popupActiveTab === "DEPTH"
                      ? "bg-aveon-primary text-white"
                      : "text-aveon-muted hover:text-aveon-text"
                  }`}
                >
                  Market Depth
                </button>
              </div>

              <button
                onClick={() => setPopupModalOpen(false)}
                className="text-aveon-muted hover:text-aveon-text p-1 rounded transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-hidden p-3 bg-aveon-bg flex min-h-0">
              {popupActiveTab === "CHART" ? (
                <div className="h-full w-full">
                  <ChartViewPanel
                    selected={popupInstrument}
                    quotes={quotes}
                    ranges={CHART_RANGES}
                    rangeIdx={chartRangeIdx}
                    setRangeIdx={setChartRangeIdx}
                    selectedQuote={activeQuote}
                    timeframes={CHART_TIMEFRAMES}
                    timeframe={chartTimeframe}
                    setTimeframe={setChartTimeframe}
                    candles={candles}
                    chartLoading={chartLoading}
                    chartMessage={chartMessage}
                  />
                </div>
              ) : (
                <div className="h-full w-full overflow-y-auto [&>div]:w-full [&>div]:max-w-none">
                  <MarketDepth
                    instrument={popupInstrument}
                    connected={Boolean(connected)}
                    quote={activeQuote}
                    onTrade={(request) => {
                      if (isIndexInstrument(popupInstrument)) {
                        window.alert("Indices Instruments are non-tradable");
                        return;
                      }
                      setActiveOrderInstrument(popupInstrument);
                      setDepthOrder(
                        request
                          ? {
                              side: request.side,
                              price: request.price,
                              quantity: request.quantity,
                              productType: request.productType,
                              orderKind: request.orderKind,
                            }
                          : null
                      );
                      setOrderModalOpen(true);
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* OrderTicketModal */}
      <OrderTicketModal
        open={orderModalOpen}
        instrument={activeOrderInstrument}
        cashOptions={activeCashPair}
        quotes={quotes}
        onClose={() => {
          setOrderModalOpen(false);
          setDepthOrder(null);
        }}
        initialSide={depthOrder?.side ?? "BUY"}
        initialProductType={depthOrder?.productType}
        initialQuantity={depthOrder?.quantity}
        initialPrice={depthOrder?.price}
        initialOrderKind={depthOrder?.orderKind}
      />
    </div>
  );
}