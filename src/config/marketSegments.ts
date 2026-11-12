/**
 * Segment identifiers from different broker interfaces are separate domains.
 * Never pass a trading/API segment ID directly to the market-data feed.
 */

export const BROADCAST_MARKET_SEGMENT_IDS = {
  NSE_CASH: 1,
  NSE_DERIVATIVES: 2,
  BSE_CASH: 3,
  BSE_DERIVATIVES: 4,
  MCX_FUTURES: 5,
  MCX_SPOT: 6,
  NCDEX_FUTURES: 7,
  NCDEX_SPOT: 8,
  NSEL_SPOTCOM: 9,
  NSEL_COM: 10,
  MSE_CURRENCY_FUTURES: 11,
  MSE_CURRENCY_SPOT: 12,
  NSECDS_FUTURES: 13,
  NSECDS_SPOT: 14,
  MSE_CASH: 15,
  MSE_DERIVATIVES: 16,
  BSE_COMM: 18,
  NSE_COMM: 19,
  NSE_EGR: 21,
  BSE_OFS: 25,
  NSE_OFS: 33,
} as const;

export const TRADING_EXCHANGE_SEGMENTS = {
  NSE_EQ: 1,
  NSE_FO: 2,
  BSE_EQ: 8,
  BSE_FO: 4,
  MCX_FO: 16,
  NSE_EGR: 21,
  NCDEX_FO: 64,
  NSE_CUR: 2048,
  NSE_COMM: 32768,
  BSE_CUR: 268435456,
  BSE_COMM: 16384,
  MSE_CUR: 1024,
  NSE_OTS: 536870912,
} as const;

/** nMarketSegmentId returned by getIndexDetails -> broadcast feed segment. */
export const INDEX_API_TO_BROADCAST_SEGMENT = {
  1: BROADCAST_MARKET_SEGMENT_IDS.NSE_CASH,
  8: BROADCAST_MARKET_SEGMENT_IDS.BSE_CASH,
  32: BROADCAST_MARKET_SEGMENT_IDS.MCX_SPOT,
  128: BROADCAST_MARKET_SEGMENT_IDS.NCDEX_SPOT,
} as const;

export type BroadcastMarketSegmentId =
  (typeof BROADCAST_MARKET_SEGMENT_IDS)[keyof typeof BROADCAST_MARKET_SEGMENT_IDS];
export type TradingExchangeSegmentId =
  (typeof TRADING_EXCHANGE_SEGMENTS)[keyof typeof TRADING_EXCHANGE_SEGMENTS];
export type IndexApiMarketSegmentId = keyof typeof INDEX_API_TO_BROADCAST_SEGMENT;

export function indexApiBroadcastSegmentId(
  apiMarketSegmentId: number,
): BroadcastMarketSegmentId | undefined {
  if (!Object.prototype.hasOwnProperty.call(INDEX_API_TO_BROADCAST_SEGMENT, apiMarketSegmentId)) {
    return undefined;
  }
  return INDEX_API_TO_BROADCAST_SEGMENT[
    apiMarketSegmentId as IndexApiMarketSegmentId
  ];
}

export function isBroadcastMarketSegmentId(
  value: number,
): value is BroadcastMarketSegmentId {
  return Object.values(BROADCAST_MARKET_SEGMENT_IDS).some((id) => id === value);
}

export function isTradingExchangeSegmentId(
  value: number,
): value is TradingExchangeSegmentId {
  return Object.values(TRADING_EXCHANGE_SEGMENTS).some((id) => id === value);
}
