import { Instrument, InstrumentKind, classifyInstrument } from "@/types/trading";
import {
  AnalysisSnapshot,
  ScanEvaluation,
  ScannedSignal,
  ScannerCategory,
  ScannerSignalType,
  ScannerTimeframe,
  TechnicalFeatures,
  TechnicalScore,
  TradePlan,
} from "@/types/aiScanner";

/** Candle values must come from the authenticated chart-history API. No quote-derived substitutes. */
export interface ScannerCandle { O: number; H: number; L: number; C: number; V: number; DT: string; }

/* ------------------------------------------------------------------ */
/* Constants & time helpers                                            */
/* ------------------------------------------------------------------ */

export const SCANNER_MIN_BARS = 55;

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const TF_MINUTES: Record<ScannerTimeframe, number> = { "5m": 5, "15m": 15, "1h": 60, "1D": 1440 };
/** NSE/BSE sessions start at 09:15, so hourly bars are 09:15-10:15, 10:15-11:15 ... */
const HOURLY_ALIGN_MS = 15 * 60_000;
/** Block a signal when the live price is this far from the last historical close (bad tick / unadjusted history). */
const MAX_LTP_DEVIATION: Record<"INTRADAY" | "DAILY", number> = { INTRADAY: 0.07, DAILY: 0.2 };

function parseTime(value: string): number {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const zoned = /(?:Z|[+-]\d\d:\d\d)$/.test(normalized) ? normalized : `${normalized}+05:30`;
  const parsed = Date.parse(zoned);
  return Number.isFinite(parsed) ? parsed : 0;
}

const istDay = (ms: number) => Math.floor((ms + IST_OFFSET_MS) / DAY_MS);

function sessionBounds(now: number, kind: InstrumentKind) {
  const [open, close] =
    kind === "COMM" ? [9 * 60, 23 * 60 + 30] : kind === "CUR" ? [9 * 60, 17 * 60] : [9 * 60 + 15, 15 * 60 + 30];
  const dayStart = istDay(now) * DAY_MS - IST_OFFSET_MS;
  return { openMs: dayStart + open * 60_000, closeMs: dayStart + close * 60_000 };
}

/** Weekday + exchange hours (IST). Exchange holidays are not known here; the quote-freshness gate covers them. */
export function isMarketOpen(now: number = Date.now(), kind: InstrumentKind = "STOCK"): boolean {
  const dow = new Date(now + IST_OFFSET_MS).getUTCDay();
  if (dow === 0 || dow === 6) return false;
  const { openMs, closeMs } = sessionBounds(now, kind);
  return now >= openMs && now < closeMs;
}

/* ------------------------------------------------------------------ */
/* Bars: sanitise + resample ONCE per history load (cached by array)   */
/* ------------------------------------------------------------------ */

interface Bar { t: number; O: number; H: number; L: number; C: number; V: number; }
export interface PreparedSeries { timeframe: ScannerTimeframe; bars: Bar[]; }

const seriesCache = new WeakMap<ScannerCandle[], Partial<Record<ScannerTimeframe, PreparedSeries>>>();

function bucketStart(t: number, tf: ScannerTimeframe): number {
  const ms = TF_MINUTES[tf] * 60_000;
  const offset = tf === "1h" ? HOURLY_ALIGN_MS : 0;
  return Math.floor((t + IST_OFFSET_MS - offset) / ms) * ms - IST_OFFSET_MS + offset;
}

function buildSeries(candles: ScannerCandle[], tf: ScannerTimeframe): PreparedSeries {
  const cutoff = Date.now() - 400 * DAY_MS;
  const clean: Bar[] = [];
  for (const c of candles) {
    const t = parseTime(c.DT);
    if (!t || t < cutoff) continue;
    if (![c.O, c.H, c.L, c.C, c.V].every(Number.isFinite)) continue;
    if (c.O <= 0 || c.H <= 0 || c.L <= 0 || c.C <= 0 || c.H < c.L) continue;
    clean.push({ t, O: c.O, H: c.H, L: c.L, C: c.C, V: c.V < 0 ? 0 : c.V });
  }
  clean.sort((a, b) => a.t - b.t);
  // De-duplicate identical timestamps (overlapping server windows) - keep the latest copy.
  const unique: Bar[] = [];
  for (const b of clean) {
    if (unique.length && unique[unique.length - 1].t === b.t) unique[unique.length - 1] = b;
    else unique.push(b);
  }
  if (tf === "1D") return { timeframe: tf, bars: unique };

  const out: Bar[] = [];
  for (const b of unique) {
    const key = bucketStart(b.t, tf);
    const last = out[out.length - 1];
    if (last && last.t === key) {
      last.H = Math.max(last.H, b.H);
      last.L = Math.min(last.L, b.L);
      last.C = b.C;
      last.V += b.V;
    } else out.push({ t: key, O: b.O, H: b.H, L: b.L, C: b.C, V: b.V });
  }
  return { timeframe: tf, bars: out };
}

export function prepareSeries(candles: ScannerCandle[], tf: ScannerTimeframe): PreparedSeries {
  let perTf = seriesCache.get(candles);
  if (!perTf) { perTf = {}; seriesCache.set(candles, perTf); }
  return (perTf[tf] ??= buildSeries(candles, tf));
}

/* ------------------------------------------------------------------ */
/* Indicators (Wilder RSI/ATR - same maths as broker/TradingView charts) */
/* ------------------------------------------------------------------ */

function emaSeries(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length < period) return out;
  const alpha = 2 / (period + 1);
  let v = 0;
  for (let i = 0; i < period; i++) v += values[i];
  v /= period;
  out[period - 1] = v;
  for (let i = period; i < values.length; i++) { v = values[i] * alpha + v * (1 - alpha); out[i] = v; }
  return out;
}

function rsiSeries(closes: number[], period = 14): number[] {
  const out = new Array<number>(closes.length).fill(NaN);
  if (closes.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period; loss /= period;
  const toRsi = () => (loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss));
  out[period] = toRsi();
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + (d > 0 ? d : 0)) / period;
    loss = (loss * (period - 1) + (d < 0 ? -d : 0)) / period;
    out[i] = toRsi();
  }
  return out;
}

function lastAtr(bars: Bar[], period = 14): number {
  if (bars.length <= period) return 0;
  const tr = (i: number) => Math.max(bars[i].H - bars[i].L, Math.abs(bars[i].H - bars[i - 1].C), Math.abs(bars[i].L - bars[i - 1].C));
  let atr = 0;
  for (let i = 1; i <= period; i++) atr += tr(i);
  atr /= period;
  for (let i = period + 1; i < bars.length; i++) atr = (atr * (period - 1) + tr(i)) / period;
  return atr;
}

/* ------------------------------------------------------------------ */
/* Live bar overlay: the forming bar follows the live price            */
/* ------------------------------------------------------------------ */

interface Working {
  bars: Bar[];
  /** The last bar is still forming (market open) and carries the live price. */
  forming: boolean;
  /** Share of the forming bar already elapsed (0-1). */
  elapsed: number;
}

function buildWorking(series: PreparedSeries, ltp: number, now: number, kind: InstrumentKind, open: boolean): Working {
  const { bars, timeframe: tf } = series;
  if (!open) return { bars, forming: false, elapsed: 1 };
  const last = bars[bars.length - 1];
  const { openMs, closeMs } = sessionBounds(now, kind);
  const live = (b: Bar): Bar => ({ ...b, C: ltp, H: Math.max(b.H, ltp), L: Math.min(b.L, ltp) });
  const fresh = (t: number): Bar => ({ t, O: ltp, H: ltp, L: ltp, C: ltp, V: 0 });

  if (tf === "1D") {
    const elapsed = Math.min(1, Math.max(0.01, (now - openMs) / (closeMs - openMs)));
    const today = istDay(now), lastDay = istDay(last.t);
    if (lastDay === today) return { bars: [...bars.slice(0, -1), live(last)], forming: true, elapsed };
    if (lastDay < today) return { bars: [...bars, fresh(openMs)], forming: true, elapsed };
    return { bars, forming: false, elapsed: 1 };
  }
  const cur = bucketStart(now, tf);
  const end = Math.min(cur + TF_MINUTES[tf] * 60_000, closeMs);
  const elapsed = Math.min(1, Math.max(0.01, (now - cur) / Math.max(1, end - cur)));
  if (last.t === cur) return { bars: [...bars.slice(0, -1), live(last)], forming: true, elapsed };
  if (last.t < cur) return { bars: [...bars, fresh(cur)], forming: true, elapsed };
  return { bars, forming: false, elapsed: 1 };
}

/* ------------------------------------------------------------------ */
/* Freshness gate (session aware)                                      */
/* ------------------------------------------------------------------ */

export function getScannerCandleFreshness(
  candles: ScannerCandle[],
  timeframe: ScannerTimeframe,
  now: number = Date.now(),
  kind: InstrumentKind = "STOCK"
): { fresh: boolean; reason?: string; lastBarTime?: number } {
  const bars = prepareSeries(candles, timeframe).bars;
  if (!bars.length) return { fresh: false, reason: "No valid historical candles" };
  const lastT = bars[bars.length - 1].t;
  if (lastT > now + 5 * 60_000) return { fresh: false, reason: "Latest candle is timestamped in the future", lastBarTime: lastT };
  const tfMs = TF_MINUTES[timeframe] * 60_000;
  const age = now - lastT;
  if (isMarketOpen(now, kind)) {
    if (timeframe === "1D") {
      if (age > 5 * DAY_MS) return { fresh: false, reason: "Daily history is more than 5 days old", lastBarTime: lastT };
    } else {
      const allowed = Math.max(3 * tfMs, 15 * 60_000);
      if (age > allowed) {
        return { fresh: false, reason: `Latest ${timeframe} bar is ${Math.round(age / 60_000)} min old - waiting for new bars`, lastBarTime: lastT };
      }
    }
  } else if (age > 5 * DAY_MS) {
    return { fresh: false, reason: "History is older than the last trading session", lastBarTime: lastT };
  }
  return { fresh: true, lastBarTime: lastT };
}

/* ------------------------------------------------------------------ */
/* Scoring                                                              */
/* ------------------------------------------------------------------ */

export function scoreTechnicalSetup(f: TechnicalFeatures, dir: 1 | -1, ltp: number): TechnicalScore {
  const factors: string[] = [];
  const word = dir === 1 ? "bullish" : "bearish";
  let trend = 0, momentum = 0, volume = 0, structure = 0;

  trend += 20; factors.push(`EMA 9/21/50 ${word} alignment`);
  if ((ltp - f.ema9) * dir > 0) { trend += 5; factors.push(`Price ${dir === 1 ? "above" : "below"} EMA 9`); }
  if ((f.ema21 - f.ema50) * dir > 0.5 * f.atr14) { trend += 5; factors.push("EMA 21/50 separated by > 0.5 ATR"); }
  if ((dir === 1 && f.emaCross === "BULLISH") || (dir === -1 && f.emaCross === "BEARISH")) { trend += 5; factors.push(`Fresh ${f.emaCross} EMA 9/21 crossover`); }

  const rsiDir = dir === 1 ? f.rsi14 : 100 - f.rsi14; // mirror so one rule serves both sides
  if (rsiDir >= 55 && rsiDir < 68) { momentum += 15; factors.push(`RSI ${f.rsi14.toFixed(0)} in momentum zone`); }
  else if (rsiDir >= 50 && rsiDir < 55) { momentum += 8; factors.push("RSI on the right side of 50"); }
  else if (rsiDir >= 68 && rsiDir < 75) momentum += 8;
  if ((dir === 1 && f.rsiTurn === "BULLISH") || (dir === -1 && f.rsiTurn === "BEARISH")) { momentum += 10; factors.push("RSI pullback has turned back with the trend"); }

  if (f.volumeRatio >= 2) { volume = 20; factors.push(`Volume ${f.volumeRatio.toFixed(1)}x average`); }
  else if (f.volumeRatio >= 1.5) { volume = 15; factors.push(`Volume ${f.volumeRatio.toFixed(1)}x average`); }
  else if (f.volumeRatio >= 1.2) { volume = 8; factors.push("Volume above average"); }

  if ((dir === 1 && f.isBreakout) || (dir === -1 && f.isBreakdown)) { structure = 20; factors.push(dir === 1 ? "Price above prior 20-bar high" : "Price below prior 20-bar low"); }

  let total = trend + momentum + volume + structure;
  if (f.extensionAtr * dir > 2.5) { total -= 10; factors.push("Penalty: price extended > 2.5 ATR from EMA 21"); }
  return {
    totalScore: Math.max(0, Math.min(100, total)),
    trendScore: trend,
    momentumScore: momentum,
    volumeScore: volume,
    volatilityScore: structure,
    confluenceFactors: factors,
  };
}

/* ------------------------------------------------------------------ */
/* Trade plan                                                           */
/* ------------------------------------------------------------------ */

export interface PlanContext {
  tick: number;
  swingLow: number;
  swingHigh: number;
  resistance: number;
  support: number;
  maxQty?: number;
}

export function buildTradePlan(
  ltp: number,
  f: TechnicalFeatures,
  side: "BUY" | "SELL",
  riskCapital: number,
  lotSize: number,
  ctx: PlanContext
): { plan: TradePlan; flags: string[] } {
  const flags: string[] = [];
  const tick = ctx.tick > 0 ? ctx.tick : 0.05;
  const round = (p: number, mode: "nearest" | "down" | "up") => {
    const q = p / tick;
    const r = mode === "down" ? Math.floor(q + 1e-9) : mode === "up" ? Math.ceil(q - 1e-9) : Math.round(q);
    return Number((r * tick).toFixed(4));
  };
  const buy = side === "BUY";
  const atr = f.atr14;
  const entry = round(ltp, "nearest");

  // Stop: at least 1.5 ATR, pushed out to the 5-bar swing (+0.25 ATR buffer), never more than 2.5 ATR away.
  const structDist = buy ? entry - (ctx.swingLow - 0.25 * atr) : ctx.swingHigh + 0.25 * atr - entry;
  const dist = Math.min(Math.max(1.5 * atr, structDist), 2.5 * atr);
  const stopLoss = buy ? round(entry - dist, "down") : round(entry + dist, "up");
  const unitRisk = Math.max(Math.abs(entry - stopLoss), tick);
  const target1 = buy ? round(entry + 2 * unitRisk, "down") : round(entry - 2 * unitRisk, "up");
  const target2 = buy ? round(entry + 3 * unitRisk, "down") : round(entry - 3 * unitRisk, "up");

  const lot = Number.isFinite(lotSize) && lotSize > 0 ? Math.floor(lotSize) : 1;
  let lots = unitRisk > 0 ? Math.floor(Math.floor(riskCapital / unitRisk) / lot) : 0;
  if (ctx.maxQty && ctx.maxQty > 0) lots = Math.min(lots, Math.floor(ctx.maxQty / lot));
  const suggestedQty = Math.max(0, lots) * lot;

  // R:R = room to the nearest opposing level, capped at Target 1's 2R. Breakouts have no level in the way.
  let rr = 2;
  const room = buy ? ctx.resistance - entry : entry - ctx.support;
  if (room > 0) rr = Math.min(2, room / unitRisk);
  rr = Math.round(rr * 100) / 100;
  if (rr < 1) flags.push(`Only ${rr}R of room to the nearest ${buy ? "resistance" : "support"}`);
  else if (rr < 2) flags.push(`Target 1 (2R) is beyond the nearest ${buy ? "resistance" : "support"}`);

  const stopPct = (unitRisk / entry) * 100;
  if (stopPct > 3 && lot === 1) flags.push(`Wide stop (${stopPct.toFixed(1)}% of price)`);
  if (suggestedQty === 0) flags.push(`Risk of 1 lot/share (₹${(unitRisk * lot).toFixed(0)}) exceeds your risk per trade`);

  const band = round(0.1 * atr, "nearest");
  return {
    plan: {
      side,
      entryZoneMin: round(entry - band, "nearest"),
      entryZoneMax: round(entry + band, "nearest"),
      stopLoss,
      target1,
      target2,
      riskRewardRatio: rr,
      suggestedQty,
      riskAmount: Math.round(suggestedQty * unitRisk * 100) / 100,
      positionValue: Math.round(suggestedQty * entry * 100) / 100,
      oneLotRisk: Math.round(unitRisk * lot * 100) / 100,
      invalidationReason: buy ? `Setup invalid below ₹${stopLoss.toFixed(2)}` : `Setup invalid above ₹${stopLoss.toFixed(2)}`,
    },
    flags,
  };
}

/* ------------------------------------------------------------------ */
/* Main entry point                                                     */
/* ------------------------------------------------------------------ */

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function evaluateInstrument(
  instrument: Instrument,
  candles: ScannerCandle[],
  timeframe: ScannerTimeframe,
  riskCapital: number,
  liveLtp: number,
  now: number = Date.now()
): ScanEvaluation {
  const kind = classifyInstrument(instrument);
  if (!candles?.length) return { signal: null, analysis: null, reject: "NO_HISTORY" };
  const series = prepareSeries(candles, timeframe);
  if (series.bars.length < SCANNER_MIN_BARS) {
    return { signal: null, analysis: null, reject: "TOO_FEW_BARS", rejectDetail: `${series.bars.length}/${SCANNER_MIN_BARS} ${timeframe} bars` };
  }
  if (!Number.isFinite(liveLtp) || liveLtp <= 0) return { signal: null, analysis: null, reject: "BAD_LTP" };

  const freshness = getScannerCandleFreshness(candles, timeframe, now, kind);
  if (!freshness.fresh) return { signal: null, analysis: null, reject: "STALE_HISTORY", rejectDetail: freshness.reason };

  const lastClose = series.bars[series.bars.length - 1].C;
  const maxDev = MAX_LTP_DEVIATION[timeframe === "1D" ? "DAILY" : "INTRADAY"];
  if (Math.abs(liveLtp - lastClose) / lastClose > maxDev) {
    return {
      signal: null, analysis: null, reject: "LTP_DEVIATION",
      rejectDetail: `Live ${liveLtp} vs last close ${lastClose} differs by more than ${maxDev * 100}% (bad tick or unadjusted history)`,
    };
  }

  const marketOpen = isMarketOpen(now, kind);
  const w = buildWorking(series, liveLtp, now, kind, marketOpen);
  const bars = w.bars;
  const n = bars.length;
  const cur = bars[n - 1];
  const prev = bars[n - 2];
  const completed = w.forming ? bars.slice(0, -1) : bars;

  const closes = bars.map((b) => b.C);
  const e9 = emaSeries(closes, 9), e21 = emaSeries(closes, 21), e50 = emaSeries(closes, 50);
  const e20 = emaSeries(closes, 20);
  const e200 = n >= 200 ? emaSeries(closes, 200) : null;
  const rsi = rsiSeries(closes, 14);
  const atr14 = lastAtr(completed, 14);
  const ema9 = e9[n - 1], ema21 = e21[n - 1], ema50 = e50[n - 1], rsi14 = rsi[n - 1];
  if (![ema9, ema21, ema50, rsi14].every(Number.isFinite) || atr14 <= 0) return { signal: null, analysis: null, reject: "TOO_FEW_BARS", rejectDetail: "Indicators not warmed up" };

  // Structure & volume are measured against the previous 20 COMPLETED bars.
  const prior = bars.slice(-21, -1);
  const priorHigh = Math.max(...prior.map((b) => b.H));
  const priorLow = Math.min(...prior.map((b) => b.L));
  const avgVol = mean(prior.map((b) => b.V));
  let volumeRatio = 0;
  if (avgVol > 0) {
    if (w.forming && cur.V === 0) {
      const base = mean(bars.slice(-22, -2).map((b) => b.V));
      volumeRatio = base > 0 ? prev.V / base : 0; // forming bar has no volume yet: use the last completed bar
    } else if (w.forming) volumeRatio = cur.V / Math.max(0.25, w.elapsed) / avgVol; // project to a full bar
    else volumeRatio = cur.V / avgVol;
  }

  let vwap = 0;
  if (timeframe !== "1D") {
    const day = istDay(cur.t);
    let pv = 0, vol = 0;
    for (let i = n - 1; i >= 0 && istDay(bars[i].t) === day; i--) {
      pv += ((bars[i].H + bars[i].L + bars[i].C) / 3) * bars[i].V;
      vol += bars[i].V;
    }
    if (vol > 0) vwap = pv / vol;
  }

  let emaCross: TechnicalFeatures["emaCross"] = "NONE";
  for (let i = Math.max(1, n - 3); i < n; i++) {
    if (e9[i - 1] <= e21[i - 1] && e9[i] > e21[i] && ema9 > ema21) emaCross = "BULLISH";
    else if (e9[i - 1] >= e21[i - 1] && e9[i] < e21[i] && ema9 < ema21) emaCross = "BEARISH";
  }

  let rsiTurn: TechnicalFeatures["rsiTurn"] = "NONE";
  const recentRsi = rsi.slice(n - 7, n - 1).filter(Number.isFinite);
  if (recentRsi.length) {
    if (rsi14 >= 50 && Math.min(...recentRsi) <= 45 && rsi14 > rsi[n - 2]) rsiTurn = "BULLISH";
    else if (rsi14 <= 50 && Math.max(...recentRsi) >= 55 && rsi14 < rsi[n - 2]) rsiTurn = "BEARISH";
  }

  const f: TechnicalFeatures = {
    rsi14, ema9, ema21, ema50, vwap, atr14, volumeRatio,
    priceChangePct: prev.C > 0 ? ((liveLtp - prev.C) / prev.C) * 100 : 0,
    isBreakout: liveLtp > priorHigh,
    isBreakdown: liveLtp < priorLow,
    emaCross, rsiTurn,
    extensionAtr: (liveLtp - ema21) / atr14,
  };

  const ema20v = e20[n - 1], ema200v = e200 ? e200[n - 1] : null;
  const analysis: AnalysisSnapshot = {
    timeframe,
    barCount: n,
    lastBarTime: new Date(cur.t).toISOString(),
    ltp: liveLtp,
    ema20: ema20v, ema50, ema200: ema200v,
    rsi14, atr14,
    support20: priorLow, resistance20: priorHigh,
    volumeRatio, latestVolume: cur.V,
    shortTermBias: liveLtp > ema20v && ema20v > ema50 && rsi14 >= 52 ? "BULLISH" : liveLtp < ema20v && ema20v < ema50 && rsi14 <= 48 ? "BEARISH" : "NEUTRAL",
    positionalBias: ema200v === null ? "INSUFFICIENT_200_BARS" : liveLtp > ema50 && ema50 > ema200v ? "BULLISH" : liveLtp < ema50 && ema50 < ema200v ? "BEARISH" : "NEUTRAL",
  };

  // Direction gate: full EMA stack, price on the right side of EMA 21 / session VWAP, RSI on the right side of 50.
  if (timeframe !== "1D" && vwap <= 0) return { signal: null, analysis, reject: "NO_VWAP", rejectDetail: "No volume-weighted session data yet" };
  const vwapOkBull = timeframe === "1D" || liveLtp > vwap;
  const vwapOkBear = timeframe === "1D" || liveLtp < vwap;
  const bullish = ema9 > ema21 && ema21 > ema50 && liveLtp > ema21 && vwapOkBull && rsi14 >= 50;
  const bearish = ema9 < ema21 && ema21 < ema50 && liveLtp < ema21 && vwapOkBear && rsi14 <= 50;
  if (!bullish && !bearish) return { signal: null, analysis, reject: "NO_TREND_ALIGNMENT" };

  const dir: 1 | -1 = bullish ? 1 : -1;
  const side = bullish ? "BUY" : "SELL";
  const score = scoreTechnicalSetup(f, dir, liveLtp);
  if (score.totalScore < 50) return { signal: null, analysis, reject: "LOW_SCORE", rejectDetail: `Score ${score.totalScore}` };

  const category: ScannerCategory =
    dir === 1
      ? f.isBreakout ? "BULLISH_BREAKOUT" : f.volumeRatio >= 1.5 ? "VOLUME_SPIKE" : f.emaCross === "BULLISH" ? "EMA_CROSSOVER" : f.rsiTurn === "BULLISH" ? "RSI_REVERSAL" : "TREND_CONTINUATION"
      : f.isBreakdown ? "BEARISH_BREAKDOWN" : f.volumeRatio >= 1.5 ? "VOLUME_SPIKE" : f.emaCross === "BEARISH" ? "EMA_CROSSOVER" : f.rsiTurn === "BEARISH" ? "RSI_REVERSAL" : "TREND_CONTINUATION";
  const label: Record<ScannerCategory, string> = {
    ALL: "All", BULLISH_BREAKOUT: "BULLISH BREAKOUT", BEARISH_BREAKDOWN: "BEARISH BREAKDOWN", VOLUME_SPIKE: "VOLUME SPIKE",
    EMA_CROSSOVER: "EMA CROSSOVER", RSI_REVERSAL: "RSI PULLBACK TURN", TREND_CONTINUATION: "TREND CONTINUATION",
  };
  const signalType: ScannerSignalType = score.totalScore >= 75 ? (bullish ? "STRONG_BUY" : "STRONG_SELL") : bullish ? "BUY" : "SELL";

  const isDerivative = kind === "FUT" || kind === "OPT" || kind === "COMM" || kind === "CUR";
  const lotSize = isDerivative ? Number(instrument.regularLot) : 1;
  if (isDerivative && !(lotSize > 0)) return { signal: null, analysis, reject: "NO_LOT_SIZE", rejectDetail: "Derivative instrument has no lot size - quantity cannot be sized safely" };

  const rawTick = instrument.priceTick && instrument.priceTick > 0 ? instrument.priceTick : 0.05;
  const swing = completed.slice(-5);
  const { plan, flags } = buildTradePlan(liveLtp, f, side, riskCapital, lotSize, {
    tick: rawTick >= 1 ? rawTick / 100 : rawTick, // broker sends tick in paise for some segments
    swingLow: Math.min(...swing.map((b) => b.L)),
    swingHigh: Math.max(...swing.map((b) => b.H)),
    resistance: priorHigh,
    support: priorLow,
    maxQty: instrument.maxSingleTransactionQty,
  });

  const riskFlags = [...flags];
  if (f.extensionAtr * dir > 2.5) riskFlags.push(`Extended ${Math.abs(f.extensionAtr).toFixed(1)} ATR from EMA 21 - chasing risk`);
  if (dir === 1 && rsi14 > 75) riskFlags.push(`RSI ${rsi14.toFixed(0)} overbought`);
  if (dir === -1 && rsi14 < 25) riskFlags.push(`RSI ${rsi14.toFixed(0)} oversold`);
  if (volumeRatio < 0.8) riskFlags.push("Below-average volume");
  if (w.forming && w.elapsed < 0.2) riskFlags.push("Bar just started - signal may change");
  if (!marketOpen) riskFlags.push("Market closed - based on last session");
  if (side === "SELL" && (kind === "STOCK" || kind === "OTHER")) riskFlags.push("Short sell: intraday (MIS) only for cash equity");
  if (kind === "OPT") riskFlags.push("Option premium: ATR-based levels are approximate");

  const signal: ScannedSignal = {
    id: `${instrument.exchange}_${instrument.token}_${timeframe}`,
    instrument, ltp: liveLtp, timeframe, signalType, category,
    categoryLabel: label[category],
    confidence: score.totalScore,
    features: f, score, tradePlan: plan, riskFlags,
    scannedAt: now,
  };
  return { signal, analysis };
}

/** Backwards-compatible wrapper. */
export function evaluateInstrumentSignal(
  instrument: Instrument,
  candles: ScannerCandle[],
  timeframe: ScannerTimeframe,
  riskCapital: number,
  liveLtp: number
): ScannedSignal | null {
  return evaluateInstrument(instrument, candles, timeframe, riskCapital, liveLtp).signal;
}
