import { Instrument } from "@/types/trading";

export type ScannerSignalType =
  | "STRONG_BUY"
  | "BUY"
  | "NEUTRAL"
  | "SELL"
  | "STRONG_SELL";

export type ScannerTimeframe = "5m" | "15m" | "1h" | "1D";

export type ScannerCategory =
  | "ALL"
  | "BULLISH_BREAKOUT"
  | "BEARISH_BREAKDOWN"
  | "VOLUME_SPIKE"
  | "EMA_CROSSOVER"
  | "RSI_REVERSAL"
  | "TREND_CONTINUATION";

export interface TechnicalFeatures {
  rsi14: number;
  ema9: number;
  ema21: number;
  ema50: number;
  vwap: number;
  atr14: number;
  /** Volume of the forming bar, projected to a full bar, vs the previous 20 completed bars. */
  volumeRatio: number;
  /** % move of the live price vs the previous completed bar's close. */
  priceChangePct: number;
  isBreakout: boolean;
  isBreakdown: boolean;
  /** Fresh EMA 9/21 cross within the last 3 bars. */
  emaCross: "BULLISH" | "BEARISH" | "NONE";
  /** RSI dipped/spiked against the trend and has turned back (pullback resume). */
  rsiTurn: "BULLISH" | "BEARISH" | "NONE";
  /** (price - EMA21) / ATR. Large absolute values mean the move is extended. */
  extensionAtr: number;
}

export interface TechnicalScore {
  totalScore: number; // 0 to 100
  trendScore: number;
  momentumScore: number;
  volumeScore: number;
  volatilityScore: number;
  confluenceFactors: string[];
}

export interface TradePlan {
  side: "BUY" | "SELL";
  entryZoneMin: number;
  entryZoneMax: number;
  stopLoss: number;
  target1: number;
  target2: number;
  riskRewardRatio: number;
  suggestedQty: number;
  riskAmount: number;
  /** suggestedQty x entry. What you actually need to deploy. */
  positionValue: number;
  /** Risk of ONE tradable unit (1 share / 1 lot). Shown when suggestedQty is 0. */
  oneLotRisk: number;
  invalidationReason: string;
}

export interface ScannedSignal {
  id: string;
  instrument: Instrument;
  ltp: number;
  timeframe: ScannerTimeframe;
  signalType: ScannerSignalType;
  category: ScannerCategory;
  categoryLabel: string;
  confidence: number; // 0 to 100
  features: TechnicalFeatures;
  score: TechnicalScore;
  tradePlan: TradePlan;
  /** Non-blocking cautions (extended move, tight/wide stop, resistance nearby ...). */
  riskFlags: string[];
  scannedAt: number;
}

/** Everything the Analyze dialog needs; computed on the SAME resampled bars as the scan. */
export interface AnalysisSnapshot {
  timeframe: ScannerTimeframe;
  barCount: number;
  lastBarTime: string;
  ltp: number;
  ema20: number;
  ema50: number;
  ema200: number | null;
  rsi14: number;
  atr14: number;
  support20: number;
  resistance20: number;
  volumeRatio: number;
  latestVolume: number;
  shortTermBias: "BULLISH" | "BEARISH" | "NEUTRAL";
  positionalBias: "BULLISH" | "BEARISH" | "NEUTRAL" | "INSUFFICIENT_200_BARS";
}

export type ScanRejectReason =
  | "NO_HISTORY"
  | "STALE_HISTORY"
  | "TOO_FEW_BARS"
  | "BAD_LTP"
  | "LTP_DEVIATION"
  | "NO_VWAP"
  | "NO_TREND_ALIGNMENT"
  | "LOW_SCORE"
  | "NO_LOT_SIZE";

export interface ScanEvaluation {
  signal: ScannedSignal | null;
  analysis: AnalysisSnapshot | null;
  reject?: ScanRejectReason;
  rejectDetail?: string;
}
