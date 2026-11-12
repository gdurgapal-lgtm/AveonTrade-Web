import type { Candle } from "@/components/market/PriceChart";

function getClose(candle: Candle | undefined): number {
  if (!candle) return 0;
  return Number(candle.close ?? candle.C ?? 0);
}

// Simple Moving Average (SMA)
export function calculateSMA(candles: Candle[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += getClose(candles[i - j]);
    }
    result.push(sum / period);
  }
  return result;
}

// Exponential Moving Average (EMA)
export function calculateEMA(candles: Candle[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const multiplier = 2 / (period + 1);
  let prevEMA: number | null = null;

  for (let i = 0; i < candles.length; i++) {
    const close = getClose(candles[i]);
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j <= i; j++) sum += getClose(candles[j]);
      prevEMA = sum / period;
      result.push(prevEMA);
      continue;
    }
    prevEMA = (close - prevEMA!) * multiplier + prevEMA!;
    result.push(prevEMA);
  }
  return result;
}

// Bollinger Bands (20, 2)
export function calculateBollingerBands(candles: Candle[], period = 20, stdDevMultiplier = 2) {
  const sma = calculateSMA(candles, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];

  for (let i = 0; i < candles.length; i++) {
    const mean = sma[i];
    if (mean === null || i < period - 1) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    let varianceSum = 0;
    for (let j = 0; j < period; j++) {
      const diff = getClose(candles[i - j]) - mean;
      varianceSum += diff * diff;
    }
    const stdDev = Math.sqrt(varianceSum / period);
    upper.push(mean + stdDev * stdDevMultiplier);
    lower.push(mean - stdDev * stdDevMultiplier);
  }
  return { upper, middle: sma, lower };
}

// Relative Strength Index (RSI 14)
export function calculateRSI(candles: Candle[], period = 14): (number | null)[] {
  const result: (number | null)[] = [];
  let gains = 0;
  let losses = 0;

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      result.push(null);
      continue;
    }
    const change = getClose(candles[i]) - getClose(candles[i - 1]);
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    if (i < period) {
      gains += gain;
      losses += loss;
      result.push(null);
      continue;
    }
    if (i === period) {
      gains += gain;
      losses += loss;
      const avgGain = gains / period;
      const avgLoss = losses / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      result.push(100 - 100 / (1 + rs));
      continue;
    }
    gains = (gains * (period - 1) + gain) / period;
    losses = (losses * (period - 1) + loss) / period;
    const rs = losses === 0 ? 100 : gains / losses;
    result.push(100 - 100 / (1 + rs));
  }
  return result;
}