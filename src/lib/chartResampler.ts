import type { KLineData } from 'klinecharts';

export type TimeframeCode =
  | '1m' | '2m' | '3m' | '5m' | '10m' | '15m' | '30m' | '45m'
  | '1h' | '2h' | '4h'
  | '1D' | '1W' | '1M';

export interface TimeframeConfig {
  code: TimeframeCode;
  label: string;
  span: number;
  type: 'minute' | 'hour' | 'day' | 'week' | 'month';
  baseResolution: '1m' | '1D' | '1W' | '1M';
  bucketMs: number;
}

export const TIMEFRAMES: Record<TimeframeCode, TimeframeConfig> = {
  '1m':  { code: '1m',  label: '1m',  span: 1,  type: 'minute', baseResolution: '1m', bucketMs: 60_000 },
  '2m':  { code: '2m',  label: '2m',  span: 2,  type: 'minute', baseResolution: '1m', bucketMs: 120_000 },
  '3m':  { code: '3m',  label: '3m',  span: 3,  type: 'minute', baseResolution: '1m', bucketMs: 180_000 },
  '5m':  { code: '5m',  label: '5m',  span: 5,  type: 'minute', baseResolution: '1m', bucketMs: 300_000 },
  '10m': { code: '10m', label: '10m', span: 10, type: 'minute', baseResolution: '1m', bucketMs: 600_000 },
  '15m': { code: '15m', label: '15m', span: 15, type: 'minute', baseResolution: '1m', bucketMs: 900_000 },
  '30m': { code: '30m', label: '30m', span: 30, type: 'minute', baseResolution: '1m', bucketMs: 1_800_000 },
  '45m': { code: '45m', label: '45m', span: 45, type: 'minute', baseResolution: '1m', bucketMs: 2_700_000 },
  '1h':  { code: '1h',  label: '1H',  span: 1,  type: 'hour',   baseResolution: '1m', bucketMs: 3_600_000 },
  '2h':  { code: '2h',  label: '2H',  span: 2,  type: 'hour',   baseResolution: '1m', bucketMs: 7_200_000 },
  '4h':  { code: '4h',  label: '4H',  span: 4,  type: 'hour',   baseResolution: '1m', bucketMs: 14_400_000 },
  '1D':  { code: '1D',  label: '1D',  span: 1,  type: 'day',    baseResolution: '1D', bucketMs: 86_400_000 },
  '1W':  { code: '1W',  label: '1W',  span: 1,  type: 'week',   baseResolution: '1W', bucketMs: 604_800_000 },
  '1M':  { code: '1M',  label: '1M',  span: 1,  type: 'month',  baseResolution: '1M', bucketMs: 2_592_000_000 },
};

// IST offset (+05:30 = 330 minutes) and NSE 09:15 AM session anchor
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const SESSION_OPEN_MINUTES = 9 * 60 + 15; // 09:15 IST

/**
 * Aligns any timestamp (ms) to its exact candle open bucket.
 * For intraday timeframes, buckets are anchored to 09:15 IST of that trading day
 * (e.g., 1H candles open at 09:15, 10:15, 11:15... 15:15).
 */
export function getCandleBucketTimestamp(
  timestampMs: number,
  tf: TimeframeCode,
  anchorSessionOpen = true
): number {
  const cfg = TIMEFRAMES[tf];

  if (cfg.baseResolution !== '1m') {
    // Daily / Weekly / Monthly: align to start of day in IST
    const istMs = timestampMs + IST_OFFSET_MS;
    const dayStartIst = Math.floor(istMs / 86_400_000) * 86_400_000;
    return dayStartIst - IST_OFFSET_MS;
  }

  if (!anchorSessionOpen) {
    return Math.floor(timestampMs / cfg.bucketMs) * cfg.bucketMs;
  }

  // Calculate 09:15 IST anchor for the given timestamp's day
  const istMs = timestampMs + IST_OFFSET_MS;
  const midnightIstMs = Math.floor(istMs / 86_400_000) * 86_400_000;
  const sessionAnchorUtcMs =
    midnightIstMs - IST_OFFSET_MS + SESSION_OPEN_MINUTES * 60_000;

  if (timestampMs < sessionAnchorUtcMs) {
    return Math.floor(timestampMs / cfg.bucketMs) * cfg.bucketMs;
  }

  const elapsedSinceOpen = timestampMs - sessionAnchorUtcMs;
  const bucketIndex = Math.floor(elapsedSinceOpen / cfg.bucketMs);
  return sessionAnchorUtcMs + bucketIndex * cfg.bucketMs;
}

/**
 * Resamples sorted 1m KLineData[] into any custom intraday timeframe (2m, 3m, 5m, 15m, 1h, etc.)
 */
export function resampleCandles(
  baseCandles: KLineData[],
  targetTf: TimeframeCode
): KLineData[] {
  if (!baseCandles.length) return [];
  const cfg = TIMEFRAMES[targetTf];
  if (targetTf === '1m' || cfg.baseResolution !== '1m') {
    return baseCandles;
  }

  const aggregated: KLineData[] = [];
  let currentBar: KLineData | null = null;

  for (const bar of baseCandles) {
    const bucketTs = getCandleBucketTimestamp(bar.timestamp, targetTf);

    if (!currentBar || currentBar.timestamp !== bucketTs) {
      if (currentBar) aggregated.push(currentBar);
      currentBar = {
        timestamp: bucketTs,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume ?? 0,
        turnover: bar.turnover ?? 0,
      };
    } else {
      currentBar.high = Math.max(currentBar.high, bar.high);
      currentBar.low = Math.min(currentBar.low, bar.low);
      currentBar.close = bar.close;
      currentBar.volume = (currentBar.volume ?? 0) + (bar.volume ?? 0);
      currentBar.turnover = (currentBar.turnover ?? 0) + (bar.turnover ?? 0);
    }
  }

  if (currentBar) aggregated.push(currentBar);
  return aggregated;
}

/**
 * Updates or creates the latest KLineData bar from a live WebSocket tick
 */
export function mergeLiveTickIntoBar(
  lastBar: KLineData | null,
  tick: { ltp: number; volume?: number; timestamp?: number },
  tf: TimeframeCode
): KLineData {
  const nowMs = tick.timestamp ? Number(tick.timestamp) : Date.now();
  const bucketTs = getCandleBucketTimestamp(nowMs, tf);
  const price = Number(tick.ltp);

  if (!lastBar || bucketTs > lastBar.timestamp) {
    // New candle period started
    return {
      timestamp: bucketTs,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: tick.volume ?? 0,
    };
  }

  // Update active candle
  return {
    ...lastBar,
    high: Math.max(lastBar.high, price),
    low: Math.min(lastBar.low, price),
    close: price,
    volume: tick.volume !== undefined ? tick.volume : (lastBar.volume ?? 0),
  };
}