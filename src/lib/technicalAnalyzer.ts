export interface TechnicalSummary {
  trend: "Bullish" | "Bearish" | "Neutral";
  rsi: number;
  sma20: number;
  sma50: number;
  support: number;
  resistance: number;
  volumeStatus: string;
}

export function computeTechnicals(candles: Array<{ O: number; H: number; L: number; C: number; V: number }>): TechnicalSummary {
  if (!candles || candles.length === 0) {
    return { trend: "Neutral", rsi: 50, sma20: 0, sma50: 0, support: 0, resistance: 0, volumeStatus: "Normal" };
  }

  const closes = candles.map((c) => c.C);
  const latestClose = closes[closes.length - 1] ?? 0;

  // Simple Moving Averages
  const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, closes.length);
  const sma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / Math.min(50, closes.length);

  // Simplified RSI (14)
  let gains = 0;
  let losses = 0;
  const period = Math.min(14, closes.length - 1);
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period || 1;
  const rs = avgGain / avgLoss;
  const rsi = Number((100 - (100 / (1 + rs))).toFixed(1));

  // Support & Resistance (Recent 30-candle High/Low)
  const recentSlice = candles.slice(-30);
  const support = Math.min(...recentSlice.map((c) => c.L));
  const resistance = Math.max(...recentSlice.map((c) => c.H));

  // Trend determination
  const trend = latestClose > sma20 && sma20 > sma50 ? "Bullish" : latestClose < sma20 && sma20 < sma50 ? "Bearish" : "Neutral";
  const volumeStatus = candles[candles.length - 1].V > (candles.slice(-20).reduce((a, b) => a + b.V, 0) / 20) * 1.5 ? "High Volume Spike" : "Normal Volume";

  return { trend, rsi, sma20: Number(sma20.toFixed(2)), sma50: Number(sma50.toFixed(2)), support, resistance, volumeStatus };
}