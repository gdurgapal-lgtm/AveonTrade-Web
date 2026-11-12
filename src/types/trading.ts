// Ported from lib/features/orders/models/order_model.dart,
// lib/features/positions/models/position_model.dart, and related files.
// Field names use the broker's snake_case shape since data comes straight
// through the proxy from the REST API.

export type OrderStatus = string;

export type TransactionType = "BUY" | "SELL";
export type ProductType = "CNC" | "MIS" | "NRML" | "CO" | "BO";
export type OrderType = "MARKET" | "LIMIT" | "SL" | "SL-M";
export type Validity = "DAY" | "IOC" | "GTD" | "EOS";

/**
 * BSE uses its own validity codes. The UI keeps the familiar labels and the
 * API value is swapped at the edge:  DAY <-> EOTODY,  EOS <-> EOSESS.
 * IOC and GTD are identical on every exchange.
 */
export function validityToApi(validity: string, segmentLike?: string): string {
  const value = String(validity ?? "DAY").trim().toUpperCase();
  const isBse = String(segmentLike ?? "").toUpperCase().includes("BSE");
  if (isBse) {
    if (value === "DAY") return "EOTODY";
    if (value === "EOS") return "EOSESS";
    return value;
  }
  return value === "EOS" ? "DAY" : value; // EOS only exists on BSE
}

/** Order-book values coming back from the API -> the labels shown in the UI. */
export function validityFromApi(validity: string): string {
  const value = String(validity ?? "DAY").trim().toUpperCase();
  if (value === "EOTODY") return "DAY";
  if (value === "EOSESS") return "EOS";
  return value;
}

export interface OrderModel {
  order_id: string;
  exchange: string;
  /** Internal OMS order id, assigned when the order is placed (REST `order_id`, socket `UniqueCode`). */
  internal_order_id?: string;
  exchange_order_no?: string;
  scrip_token?: number;
  trading_symbol: string;
  series?: string;
  transaction_type: TransactionType;
  product_type: ProductType | string;
  order_type: OrderType | string;
  quantity: number;
  filled_quantity?: number;
  pending_quantity?: number;
  disclosed_quantity?: number;
  price: number;
  trigger_price?: number;
  average_price?: number;
  status: OrderStatus;
  validity: Validity | string;
  validity_days?: number;
  order_timestamp?: string;
  error_reason?: string;
  message?: string;
  is_amo?: boolean;
  order_identifier?: string;
  gateway_order_no?: string;
  raw?: Record<string, any>;
}

export interface TradeModel {
  trade_id: string;
  order_id: string;
  exchange: string;
  /** Internal OMS order id, assigned when the order is placed (REST `order_id`, socket `UniqueCode`). */
  internal_order_id?: string;
  exchange_order_no?: string;
  scrip_token?: number;
  trading_symbol: string;
  series?: string;
  transaction_type: TransactionType;
  product_type?: string;
  order_type?: string;
  quantity: number;
  price: number;
  trade_timestamp?: string;
  order_identifier?: string;
  raw?: Record<string, any>;
}

export interface PositionModel {
  exchange: string;
  preferred_exchange?: string;
  scrip_token?: string | number;
  preferred_scrip_token?: string | number;
  symbol: string;
  series?: string;
  product_type: ProductType | string;
  instrument?: string;
  expiry_date?: string;
  strike_price?: string;
  option_type?: string;
  market_lot?: number;
  buy_quantity: number;
  avg_buy_price: number;
  buy_value: number;
  sell_quantity: number;
  avg_sell_price: number;
  sell_value: number;
  net_quantity: number;
  net_price: number;
  net_value: number;
  cf_buy_value?: number;
  cf_sell_value?: number;
  cf_net_price?: number;
  reference_rate?: number;
  gen_num?: number;
  gen_den?: number;
  price_num?: number;
  price_den?: number;
  unsettled_quantity?: number;
  multiplier?: number;
  daily_or_expiry?: string;
}


export interface HoldingSecurity { exchange: string; scrip_token: number; symbol: string; }

export interface HoldingModel {
  isin: string;
  security_info: HoldingSecurity[];
  exchange: string;
  scrip_token: number;
  trading_symbol: string;
  quantity: number;
  dp_free: number;
  pool_free: number;
  t1_quantity: number;
  avg_price: number;
  ltp: number;
  close_price: number;
  current_value: number;
  invested_value: number;
  pnl: number;
  pnl_percent: number;
  day_pnl: number;
  day_pnl_percent: number;
  product?: string;
  collateral_quantity?: number;
  collateral_value?: number;
  dp_pledge_collateral_qty?: number;
  pool_pledge_collateral_qty?: number;
}

export interface RawHoldingModel {
  isin?: string; ISIN?: string;
  security_info?: { exchange: string; scrip_token: string | number; symbol: string }[];
  total_free?: number | string; dp_free?: number | string; pool_free?: number | string; t1_quantity?: number | string;
  average_price?: number | string; last_price?: number | string; pnl?: number | string; current_value?: number | string; inv_value?: number | string;
  product?: string; collateral_quantity?: number | string; collateral_value?: number | string; close_price?: number | string;
  dppledge_collateral_qty?: number | string; poolpledge_collateral_qty?: number | string;
}

export interface FundsSummary {
  available_margin: number;
  used_margin: number;
  total_balance: number;
  payin?: number;
  payout?: number;
  collateral?: number;
  lines?: { label: string; value: number }[];
}

export interface WatchlistQuote {
  exchange: string;
  trading_symbol: string;
  token?: string;
  ltp: number;
  receivedAt?: number;
  change: number;
  change_percent: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  bid_price?: number;
  bid_qty?: number;
  ask_price?: number;
  ask_qty?: number;
  open_interest?: number;
  buy_qty?: number;
  sell_qty?: number;
  last_trade_time?: string;
  last_update_time?: string;
  net_change?: number;
  average_traded_price?: number;
  lifetime_high?: number;
  lifetime_low?: number;
  market_type?: string;
  open_interest_percentage?: number;
  high_open_interest?: number;
  low_open_interest?: number;
  daily_price_range?: string;
  trade_execution_range?: string;
  cas_reference_price?: number;
  indicative_close_price?: number;
  imbalance_qty_equi_price?: number;
  imbalance_qty_market_order_equi_price?: number;
  decimal_locator?: number;
  last_trade_quantity?: number;
  depth?: { bids?: { price: number; quantity: number; orders?: number }[]; asks?: { price: number; quantity: number; orders?: number }[]; totalBuyQty?: number; totalSellQty?: number; avgTradedPrice?: number; week52High?: number; week52Low?: number; circuitRange?: string };
}

export interface RegularOrderRequest {
  exchange: string;
  trading_symbol: string;
  transaction_type: TransactionType;
  product_type: ProductType;
  order_type: OrderType;
  quantity: number;
  price?: number;
  trigger_price?: number;
  validity: Validity;
  disclosed_quantity?: number;
  is_amo?: boolean;
}

export function normalizePosition(raw: Record<string, any>): PositionModel {
  const n = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const text = (value: unknown) => (value === undefined || value === null ? "" : String(value));
  return {
    exchange: text(raw.exchange),
    preferred_exchange: text(raw.preferred_exchange) || undefined,
    scrip_token: raw.scrip_token,
    preferred_scrip_token: raw.preferred_scrip_token,
    symbol: text(raw.symbol),
    series: text(raw.series) || undefined,
    product_type: text(raw.product_type),
    instrument: text(raw.instrument) || undefined,
    expiry_date: text(raw.expiry_date) || undefined,
    strike_price: text(raw.strike_price) || undefined,
    option_type: text(raw.option_type) || undefined,
    market_lot: n(raw.market_lot) || undefined,
    buy_quantity: n(raw.buy_quantity),
    avg_buy_price: n(raw.avg_buy_price),
    buy_value: n(raw.buy_value),
    sell_quantity: n(raw.sell_quantity),
    avg_sell_price: n(raw.avg_sell_price),
    sell_value: n(raw.sell_value),
    net_quantity: n(raw.net_quantity),
    net_price: n(raw.net_price),
    net_value: n(raw.net_value),
    cf_buy_value: n(raw.cf_buy_value),
    cf_sell_value: n(raw.cf_sell_value),
    cf_net_price: n(raw.cf_net_price),
    reference_rate: n(raw.reference_rate),
    gen_num: n(raw.gen_num),
    gen_den: n(raw.gen_den),
    price_num: n(raw.price_num),
    price_den: n(raw.price_den),
    unsettled_quantity: n(raw.unsettled_quantity),
    multiplier: n(raw.multiplier),
    daily_or_expiry: text(raw.daily_or_expiry) || undefined,
  };
}

export function normalizeHolding(raw: RawHoldingModel): HoldingModel {
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const security_info = (raw.security_info ?? []).map((x) => ({ exchange: String(x.exchange ?? ""), scrip_token: num(x.scrip_token), symbol: String(x.symbol ?? "") }));
  const preferred = security_info.find((x) => x.exchange === "NSE_EQ") ?? security_info.find((x) => !!x.exchange) ?? security_info[0];
  const isin = String(raw.isin ?? raw.ISIN ?? ""); const quantity = num(raw.total_free); const avg = num(raw.average_price);
  const ltp = num(raw.last_price); const close = num(raw.close_price); const invested = num(raw.inv_value) || avg * quantity;
  const current = num(raw.current_value) || ltp * quantity; const pnl = num(raw.pnl) || current - invested;
  const dayPnl = close > 0 && ltp > 0 ? (ltp - close) * quantity : 0;
  return { isin, security_info, exchange: preferred?.exchange ?? "", scrip_token: preferred?.scrip_token ?? 0, trading_symbol: preferred?.symbol || isin || "--", quantity, dp_free: num(raw.dp_free), pool_free: num(raw.pool_free), t1_quantity: num(raw.t1_quantity), avg_price: avg, ltp, close_price: close, current_value: current, invested_value: invested, pnl, pnl_percent: invested ? (pnl / invested) * 100 : 0, day_pnl: dayPnl, day_pnl_percent: close ? ((ltp - close) / close) * 100 : 0, product: raw.product, collateral_quantity: num(raw.collateral_quantity), collateral_value: num(raw.collateral_value), dp_pledge_collateral_qty: num(raw.dppledge_collateral_qty), pool_pledge_collateral_qty: num(raw.poolpledge_collateral_qty) };
}

export interface Instrument {
  exchange: string;
  token: string;
  symbol: string;
  tradingSymbol: string;
  canonicalTradingSymbol?: string;
  companyName: string;
  series?: string;
  isin?: string;
  exchangeSegment?: string;
  marketSegmentId?: number;
  tradingMarketSegmentId?: number;
  instrumentName?: string;
  optionType?: string;
  expiryDateText?: string;
  strikePrice?: string;
  derivativeDesc?: string;
  displayName?: string;
  isIndex?: boolean;
  regularLot?: number;
  priceTick?: number;
  maxSingleTransactionQty?: number;
  securityStatus?: string;
  securityRemarks?: string;
  qtyUnit?: string;
  deliveryUnit?: string;
  expiryDate?: number;
}

export type InstrumentKind = "STOCK" | "INDEX" | "FUT" | "OPT" | "COMM" | "CUR" | "OTHER";

export function classifyInstrument(i: Instrument): InstrumentKind {
  const name = String(i.instrumentName ?? "").trim().toUpperCase();
  const segment = exchangeSegmentFor(i).toUpperCase();
  const exchange = String(i.exchange ?? "").toUpperCase();
  const optionType = String(i.optionType ?? "").trim().toUpperCase();

  // Broker master flags are authoritative: nIsIndex=1 means Index.
  if (i.isIndex === true) return "INDEX";

  // Instrument-name prefixes are the broker's primary contract taxonomy.
  if (name.startsWith("OPT") || optionType === "CE" || optionType === "PE") return "OPT";
  if (name.startsWith("FUT")) return "FUT";
  if (name.startsWith("EQU")) return "STOCK";

  // Retain useful commodity/currency grouping for non-FUT/OPT instruments.
  if (
    segment.includes("COMM") || segment.includes("MCX") || segment.includes("NCDEX") ||
    exchange === "MCX" || exchange === "NCDEX"
  ) return "COMM";
  if (segment.includes("CUR") || segment.includes("CDS") || name.includes("CUR")) return "CUR";

  return "OTHER";
}

const SEGMENT_ID_TO_EXCHANGE: Record<number, string> = {
  1: "NSE_EQ", 2: "NSE_FO", 3: "BSE_EQ", 4: "BSE_FO", 5: "MCX_FO",
  7: "NCDEX_FO", 6: "MCX_SPOT", 8: "NCDEX_SPOT", 9: "NSEL_SPOT",
  10: "NSEL_COM", 11: "MSE_CDS", 12: "MSE_CDS_SPOT", 13: "NSE_CDS",
  14: "NSE_CDS_SPOT", 15: "MSE_EQ", 16: "MSE_FO", 18: "BSE_COMM",
  19: "NSE_COMM", 25: "BSE_OFS", 33: "NSE_OFS",
};

export function normalizeExchangeSegment(value: unknown): string {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return "";
  if (/^\d+$/.test(raw)) return SEGMENT_ID_TO_EXCHANGE[Number(raw)] ?? raw;
  return raw;
}

export function exchangeSegmentFor(instrument: Instrument): string {
  if (instrument.exchangeSegment) return normalizeExchangeSegment(instrument.exchangeSegment);
  if (instrument.marketSegmentId) return SEGMENT_ID_TO_EXCHANGE[instrument.marketSegmentId] ?? "";
  return "";
}

export function isDerivativeMarketSegment(segmentLike?: string): boolean {
  const value = String(segmentLike ?? "").trim().toUpperCase();
  if (!value) return false;
  const compact = value.replace(/[^A-Z0-9]/g, "");
  return (
    compact.includes("_FO") ||
    compact.endsWith("FO") ||
    compact.includes("CDS") ||
    compact.endsWith("CD") ||
    compact.includes("COMM") ||
    compact.endsWith("COM") ||
    compact === "MCX" ||
    compact === "NCDEX"
  );
}

export function displayProductType(productType: string, segmentLike?: string, instrumentHint?: string): string {
  const product = String(productType ?? "").trim().toUpperCase();
  const hint = String(instrumentHint ?? "").trim().toUpperCase();
  const derivative = isDerivativeMarketSegment(segmentLike) || /(?:FUT|OPT)/.test(hint);

  // Socket order payloads use compact product codes. Resolve D according
  // to the instrument segment; M represents Intraday in this broker setup.
  if (derivative && ["DELIVERY", "CNC", "CARRYFORWARD", "NRML", "D"].includes(product)) return "Carry Forward";
  if (["DELIVERY", "CNC", "D"].includes(product)) return "Delivery";
  if (product === "M") return "Intraday";
  if (["INTRADAY", "MIS"].includes(product)) return "Intraday";
  if (["CARRYFORWARD", "NRML"].includes(product)) return "Carry Forward";
  if (["COVER", "CO"].includes(product)) return "Cover";
  if (["BRACKET", "BO"].includes(product)) return "Bracket";
  return String(productType ?? "");
}

export function instrumentIdentityKey(instrument: Instrument): string {
  const segmentId = instrument.marketSegmentId ?? Object.entries(SEGMENT_ID_TO_EXCHANGE).find(
    ([, value]) => value === (instrument.exchangeSegment ?? "").toUpperCase()
  )?.[0];
  const segment = segmentId ? String(segmentId) : (exchangeSegmentFor(instrument) || instrument.exchange || "").toUpperCase();
  if (instrument.token) return `${segment}:${instrument.token}`;
  return `${segment}:${(instrument.tradingSymbol || instrument.symbol || "").toUpperCase()}`;
}

function cleanDerivativeSymbol(sym: string): string {
  if (!sym) return "";
  return sym.replace(/20(\d{2})/g, "$1");
}

export function normalizeInstrument(json: Record<string, any>): Instrument {
  const source = json?._source ?? json;
  const first = (...values: unknown[]) => values.find((v) => v !== undefined && v !== null && v !== "") ?? "";

  const rawSecurityDesc = String(first(source.sSecurityDesc, source.security_desc, source.securityDescription));
  const rawSymbol = String(first(source.sSymbol, source.sSymbolnew, source.symbol, source.trading_symbol, source.tradingsymbol));
  
  const cleanedDesc = cleanDerivativeSymbol(rawSecurityDesc || rawSymbol);

  return {
    exchange: String(first(source.exchange, source.sExchange, String(first(source.exchange_segment, source.ExchangeSegment, source.sExchangeSegment)).split("_")[0])),
    token: String(first(source.token, source.instrument_token, source.nToken, source.id)),
    symbol: cleanDerivativeSymbol(String(first(source.symbol, source.sSymbol, source.sSymbolnew))),
    canonicalTradingSymbol: cleanedDesc || undefined,
    tradingSymbol: cleanedDesc || String(
      first(
        source.sSecurityDesc,
        source.security_desc,
        source.securityDescription,
        source.trading_symbol,
        source.tradingsymbol,
        source.sSymbolnew,
        source.sSymbol,
        source.symbol
      )
    ),
    companyName: String(first(source.company_name, source.name, source.sSecurityDesc)),
    displayName: String(first(source.display_name, source.sSymbolnew, source.sSymbol, source.symbol)) || undefined,
    series: String(first(source.series, source.sSeries)) || undefined,
    isin: String(first(source.isin, source.sISINCode)) || undefined,
    exchangeSegment: String(first(source.exchange_segment, source.ExchangeSegment, source.sExchangeSegment)) || undefined,
    marketSegmentId: Number(first(source.market_segment_id, source.MktSegId, source.nMarketSegmentId)) || undefined,
    tradingMarketSegmentId: Number(first(source.trading_market_segment_id, source.TradingMarketSegmentId, source.nTradingMarketSegmentId)) || undefined,
    instrumentName: String(first(source.instrument, source.instrument_name, source.instrumentName, source.sInstrumentName)) || undefined,
    optionType: String(first(source.option_type, source.optionType, source.sOptionType)) || undefined,
    expiryDateText: String(first(source.expiry_date_text, source.sExpiryDate, source.ExpiryDate, source.expiryDateText, source.nExpiryDate1)) || undefined,
    expiryDate: Number(first(source.expiry_date, source.nExpiryDate, source.nExpiryDate1)) || undefined,
    strikePrice: String(first(source.strike_price, source.sStrikePrice, source.nStrikePrice, source.StrikePrice, source.strikePrice)) || undefined,
    derivativeDesc: String(first(source.derivative_desc, source.sDerivitiveDesc)) || undefined,
    isIndex: ["TRUE", "1", "Y", "YES"].includes(String(first(source.is_index, source.isIndex, source.IsIndex, source.isindex, source.nIsIndex)).toUpperCase()),
    regularLot: Number(first(source.regular_lot, source.nRegularLot)) || undefined,
    priceTick: Number(first(source.price_tick, source.nPriceTick, source.tick_size, source.tickSize)) || undefined,
    maxSingleTransactionQty: Number(first(source.max_single_transaction_qty, source.nMaxSingleTransactionQty, source.maxSingleTransactionQty)) || undefined,
    securityStatus: String(first(source.security_status, source.sSecurityStatus, source.securityStatus)) || undefined,
    securityRemarks: String(first(source.security_remarks, source.sSecurityRemarks, source.securityRemarks)) || undefined,
    qtyUnit: String(first(source.qty_unit, source.sQtyUnit)) || undefined,
    deliveryUnit: String(first(source.delivery_unit, source.sDeliveryUnit)) || undefined,
  };
}

export type RawOrderModel = Record<string, any>;
export type RawTradeModel = Record<string, any>;

function firstString(raw: Record<string, any>, keys: string[]): string {
  for (const k of keys) {
    const v = raw?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return "";
}

function firstNumber(raw: Record<string, any>, keys: string[]): number {
  for (const k of keys) {
    const v = raw?.[k];
    if (v !== undefined && v !== null && v !== "") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

export function orderStatusTone(status: string): "buy" | "sell" | "warn" | "neutral" {
  const s = status.toUpperCase();
  if (s.includes("COMPLETE") || s.includes("EXECUTED") || s.includes("FILLED")) return "buy";
  if (s.includes("REJECT") || s.includes("ERROR")) return "sell";
  if (s.includes("CANCEL")) return "neutral";
  return "warn";
}

function rawContractDisplaySymbol(raw: RawOrderModel): string {
  const canonical = firstString(raw, [
    "sSecurityDesc",
    "security_desc",
    "securityDescription",
    "TradingSymbol",
    "trading_symbol",
    "tradingSymbol"
  ]);
  if (/(?:CE|PE|FUT)$/i.test(canonical)) {
    return cleanDerivativeSymbol(canonical);
  }

  const exchange = firstString(raw, ["exchange","exchange_segment","exchangeSegment","segment"]);
  const instrument = firstString(raw, ["instrument","instrument_name","instrumentName","_InstrumentName","sInstrumentName"]);
  
  // RULE: NO HARDCODING. Fallback to empty string if symbol is missing rather than hardcoding a default ticker.
  const symbol = firstString(raw, ["Symbol", "symbol", "sSymbol", "sSymbolnew", "sSymbolNew", "trading_symbol", "tradingSymbol"]) || "";
  const segment = String(exchange).toUpperCase();
  const derivative = isDerivativeMarketSegment(segment) || /(?:FUT|OPT)/i.test(instrument);
  if (!derivative) return symbol;

  const rawExpiry = firstString(raw, ["expiry_date","expiryDate","expiry","ExpiryDate","nExpiryDate1"]);
  const option = firstString(raw, ["option_type","optionType","OptionType"]).toUpperCase();
  const strike = firstString(raw, ["strike_price","strikePrice","StrikePrice"]);
  const isFuture = instrument.includes("FUT") || !option || option === "   " || option === "";

  let formattedExpiry = "";
  if (rawExpiry) {
    const d = new Date(rawExpiry);
    if (!isNaN(d.getTime())) {
      const yy = String(d.getFullYear()).slice(-2);
      const mNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
      const mLetter = mNames[d.getMonth()];
      const dd = String(d.getDate()).padStart(2, "0");
      
      if (isFuture) {
        formattedExpiry = `${dd}${mLetter}${yy}`;
      } else {
        const shortLetter = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"][d.getMonth()];
        formattedExpiry = `${yy}${shortLetter}${dd}`;
      }
    } else {
      formattedExpiry = rawExpiry.replace(/20(\d{2})/, "$1").replace(/[^A-Z0-9]/g, "");
    }
  }

  if (symbol && formattedExpiry) {
    if (!isFuture && (option === "CE" || option === "PE")) {
      const strikeClean = strike.split(".")[0].replace(/,/g, "");
      if (strikeClean) return cleanDerivativeSymbol(`${symbol}${formattedExpiry}${strikeClean}${option}`);
    }
    return cleanDerivativeSymbol(`${symbol}${formattedExpiry}FUT`);
  }

  return cleanDerivativeSymbol(symbol);
}

function compactDerivativeExpiry(value: string): string {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw || raw === "-") return "";
  let m = raw.match(/^(\d{1,2})[-\/ ]([A-Z]{3})[-\/ ](?:20)?\d{2}$/);
  if (m) return `${m[1].padStart(2, "0")}${m[2]}`;
  m = raw.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m) return `${m[3].padStart(2, "0")}${({1:"JAN",2:"FEB",3:"MAR",4:"APR",5:"MAY",6:"JUN",7:"JUL",8:"AUG",9:"SEP",10:"OCT",11:"NOV",12:"DEC"} as Record<string,string>)[String(Number(m[2]))] ?? ""}`;
  m = raw.match(/^(\d{1,2})([A-Z]{3})(?:20)?\d{2}$/);
  if (m) return `${m[1].padStart(2, "0")}${m[2]}`;
  m = raw.match(/^([A-Z]{3})(\d{1,2})(?:20)?\d{2}$/);
  if (m) return `${m[2].padStart(2, "0")}${m[1]}`;
  return cleanDerivativeSymbol(raw.replace(/[^A-Z0-9]/g, ""));
}

export function normalizeOrderType(value: unknown, miscValue?: unknown): string {
  const raw = String(value ?? "").trim().toUpperCase();
  const misc = String(miscValue ?? "").trim().toUpperCase();
  // Prefer the broker's descriptive order marker when supplied by the stream.
  if (misc.includes("SL-MKT") || misc.includes("SL_MKT")) return "SL-MKT";
  if (misc.includes("SL-LMT") || misc.includes("SL-LIMIT") || misc.includes("PO-SL")) return "SL";
  if (misc.includes("MKT") || misc.includes("MARKET")) return "RL-MKT";
  if (misc.includes("LMT") || misc.includes("LIMIT")) return "RL";
  if (["RL", "RL-MKT", "SL", "SL-MKT"].includes(raw)) return raw;
  if (["LIMIT", "LMT"].includes(raw)) return "RL";
  if (["MARKET", "MKT"].includes(raw)) return "RL-MKT";
  if (["STOP LIMIT", "STOP-LIMIT", "SL-LIMIT"].includes(raw)) return "SL";
  if (["STOP MARKET", "STOP-MARKET", "SL-MARKET"].includes(raw)) return "SL-MKT";
  // Broker ORD_NRML numeric code 1 represents a regular limit order.
  if (raw === "1") return "RL";
  if (raw === "2") return "SL";
  if (raw === "3") return "RL-MKT";
  if (raw === "4") return "SL-MKT";
  return raw;
}

/** Convert broker socket price fields from integer minor units (paisa) to rupees.
 * The marker is attached only to WebSocket messages, so REST values that
 * are already expressed in rupees are left unchanged. */
function normalizeSocketPrice(raw: Record<string, any>, value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  const divisor = Number(raw.__socketPriceDivisor);
  return divisor > 0 ? amount / divisor : amount;
}

/** Order references arrive as "0" or blank until the exchange confirms the order. */
function cleanOrderRef(value: unknown): string {
  const text = String(value ?? "").trim();
  return text && text !== "0" ? text : "";
}

export function normalizeOrder(raw: RawOrderModel): OrderModel {
  const buySell = String(raw.Buy_Sell ?? raw.buy_sell ?? "").trim();
  const side = buySell === "1" || buySell.toUpperCase() === "BUY" ? "BUY" : buySell === "2" || buySell.toUpperCase() === "SELL" ? "SELL" : undefined;
  
  const rawPrice = raw.order_price ?? raw.OrderPrice ?? raw.price ?? raw.traded_price ?? raw.tradedPrice;
  const price = normalizeSocketPrice(raw, rawPrice);

  const rawStatus = firstString(raw, ["status", "order_status", "orderStatus", "OrderStatus", "OMSOrderStatus"]);
  const adminStatus = String(raw.OMSOrderStatus ?? raw.OrderStatus ?? "").trim();

  let status = rawStatus ? rawStatus.toUpperCase() : "PENDING";
  if (["8", "15"].includes(adminStatus) || ["8", "15", "REJECTED", "OMSREJECT", "ORDERERROR", "ADMINREJECT"].includes(status)) {
    status = "REJECTED";
  } else if (["11", "19"].includes(adminStatus) || ["11", "19", "CANCELLED", "WITHDRAWN", "AMOWITHDRAWN"].includes(status)) {
    status = "CANCELLED";
  } else if (["4", "5", "7", "COMPLETE", "FILLED", "EXECUTED"].includes(status)) {
    status = "EXECUTED";
  } else if (["3", "PENDING"].includes(status)) {
    status = "OMSXMITTED";
  } else if (["18"].includes(status)) {
    status = "AMOACCEPTED";
  }

  const exchangeRaw = firstString(raw, ["exchange", "exchange_segment", "exchangeSegment", "segment", "Exchange", "nMarketSegmentId", "marketSegmentId"]);
  const exchange = normalizeExchangeSegment(exchangeRaw);
  const exchangeOrderNumber = firstString(raw, ["exchange_order_no", "exchangeOrderNo", "exchange_order_number", "OrderNumber"]);
  const uniqueCode = firstString(raw, ["UniqueCode", "uniqueCode", "unique_code", "order_identifier", "orderIdentifier"]);
  const usableOrderNumber = exchangeOrderNumber && exchangeOrderNumber !== "0" ? exchangeOrderNumber : "";
  const internalOrderId = cleanOrderRef(firstString(raw, ["order_id", "orderId", "UniqueCode", "uniqueCode", "unique_code"]));
  const orderTime = firstString(raw, ["OrderTimeStamp", "order_timestamp", "order_modified_timestamp", "LastModifiedTimeStamp", "OrderEntryTime", "LastModifiedTime", "order_time", "orderTime", "exchange_time", "created_at", "time"]);

  return {
    order_id: firstString(raw, ["order_id", "orderId", "exchange_order_no", "exchangeOrderNo", "exchange_order_number"]) || uniqueCode || usableOrderNumber,
    exchange,
    internal_order_id: internalOrderId || undefined,
    exchange_order_no: usableOrderNumber || undefined,
    scrip_token: firstNumber(raw, ["scrip_token", "scripToken", "token", "Token", "ScripCode"]) || undefined,
    trading_symbol: rawContractDisplaySymbol(raw),
    series: firstString(raw, ["series", "Series", "scrip_series"]) || undefined,
    transaction_type: (side || firstString(raw, ["transaction_type", "transactionType", "side"]) || "BUY").toUpperCase() as TransactionType,
    product_type: firstString(raw, ["product_type", "productType", "product", "Product"]),
    order_type: normalizeOrderType(firstString(raw, ["order_type", "orderType", "OrderType"]), firstString(raw, ["Misc", "misc", "order_description", "orderDescription"])),
    quantity: firstNumber(raw, ["total_quantity", "totalQuantity", "quantity", "qty", "OrderOriginalQty", "order_original_qty", "original_quantity", "originalQuantity"]),
    filled_quantity: firstNumber(raw, ["traded_quantity", "tradedQuantity", "filled_quantity", "filledQty", "TradedQTY", "tradedQty", "TradeQty"]),
    pending_quantity: firstNumber(raw, ["pending_quantity", "pendingQuantity", "open_quantity", "openQuantity", "PendingQty"]),
    disclosed_quantity: firstNumber(raw, ["disclosed_quantity", "disclosedQuantity", "disclosed_qty", "DQ"]),
    price,
    trigger_price: normalizeSocketPrice(raw, raw.trigger_price ?? raw.triggerPrice ?? raw.TriggerPrice ?? 0),
    average_price: normalizeSocketPrice(raw, raw.average_price ?? raw.avg_price ?? raw.averagePrice ?? raw.traded_price ?? raw.TradedPrice ?? 0),
    status,
    validity: firstString(raw, ["validity", "OrderValidity"]) || "DAY",
    validity_days: firstNumber(raw, ["validity_days", "validityDays", "gtd_days", "gtdDays", "Days"]),
    order_timestamp: orderTime,
    error_reason: firstString(raw, ["error_reason", "errorReason", "Reason"]),
    message: firstString(raw, ["error_reason", "errorReason", "message", "Reason"]),
    is_amo: [true, "true", "Y", "1", 1].includes(raw?.is_amo) || [true, "true", "Y", "1", 1].includes(raw?.isAmo),
    order_identifier: firstString(raw, ["order_identifier", "orderIdentifier", "UniqueCode", "uniqueCode", "unique_code", "client_order_identifier", "clientOrderIdentifier"]),
    gateway_order_no: firstString(raw, ["gateway_order_no", "gatewayOrderNo", "gateway_order_number", "gatewayOrderNumber"]),
    raw,
  };
}

export function extractList<T = Record<string, any>>(value: unknown, keys: string[] = []): T[] {
  if (Array.isArray(value)) return value as T[];
  if (!value || typeof value !== "object") return [];
  const source = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = source[key];
    if (Array.isArray(candidate)) return candidate as T[];
  }
  for (const key of ["data", "result", "response"]) {
    const nested = source[key];
    if (nested && nested !== value) {
      const rows = extractList<T>(nested, keys);
      if (rows.length) return rows;
    }
  }
  return [];
}

export function isOpenOrder(order: OrderModel): boolean {
  const status = String(order.status ?? "").trim().toUpperCase().replace(/[ _-]+/g, "");

  if ([
    "4", "5", "7", "8", "11", "15", "19",
    "CANCELLED", "WITHDRAWN", "REJECTED", "OMSREJECT", "ORDERERROR", "ADMINREJECT",
    "COMPLETE", "FILLED", "EXECUTED", "CLOSED"
  ].includes(status)) {
    return false;
  }

  const remQty = order.pending_quantity ?? Math.max(0, order.quantity - (order.filled_quantity ?? 0));
  if (order.quantity > 0 && remQty === 0) {
    return false;
  }

  return ["PENDING", "OMSXMITTED", "EXXMITTED", "AMOACCEPTED", "3", "18"].includes(status);
}

export function normalizeTrade(raw: RawTradeModel): TradeModel {
  const buySell = String(raw.Buy_Sell ?? raw.buy_sell ?? "").trim();
  const side = buySell === "1" || buySell.toUpperCase() === "BUY" ? "BUY" : buySell === "2" || buySell.toUpperCase() === "SELL" ? "SELL" : undefined;

  const rawPrice = raw.TradedPrice ?? raw.trade_price ?? raw.tradePrice ?? raw.price;
  // REST TradedPrice keeps its existing /100 conversion. Socket messages use
  // the broker-provided DecimalLocator divisor instead.
  const price = raw.__socketPriceDivisor
    ? normalizeSocketPrice(raw, rawPrice)
    : raw.TradedPrice !== undefined && rawPrice != null
      ? (Number(rawPrice) || 0) / 100
      : normalizeSocketPrice(raw, rawPrice);

  // Exchange order id: "0"/blank until the exchange confirms the order.
  // Socket TRD_MSG carries it as OrderNumber; REST uses exchange_order_no.
  const exchangeOrderNo = cleanOrderRef(firstString(raw, ["exchange_order_no", "exchangeOrderNo", "exchange_order_number", "OrderNumber"]));
  // Internal OMS order id: assigned at placement and never changes.
  // Socket TRD_MSG carries it as UniqueCode; REST uses order_id.
  const rawInternal = cleanOrderRef(firstString(raw, ["UniqueCode", "uniqueCode", "unique_code", "internal_order_id", "order_id", "orderId", "oms_order_id"]));
  const internalOrderId = rawInternal && rawInternal !== exchangeOrderNo ? rawInternal : "";

  return {
    trade_id: firstString(raw, ["trade_no", "tradeNo", "trade_number", "TradeNumber", "trade_id", "exchange_trade_no", "exchangeTradeNo"]),
    order_id: exchangeOrderNo || internalOrderId,
    exchange: normalizeExchangeSegment(firstString(raw, ["exchange", "exchange_segment", "exchangeSegment", "segment", "Exchange"])),
    internal_order_id: internalOrderId || undefined,
    exchange_order_no: exchangeOrderNo || undefined,
    scrip_token: firstNumber(raw, ["scrip_token", "scripToken", "token", "Token", "ScripCode"]) || undefined,
    trading_symbol: rawContractDisplaySymbol(raw),
    series: firstString(raw, ["series", "Series", "scrip_series"]) || undefined,
    transaction_type: (side || firstString(raw, ["transaction_type", "transactionType", "side"]) || "BUY").toUpperCase() as TransactionType,
    product_type: firstString(raw, ["product_type", "productType", "product", "Product"]) || undefined,
    order_type: normalizeOrderType(firstString(raw, ["order_type", "orderType", "OrderType"]), firstString(raw, ["Misc", "misc"])) || undefined,
    quantity: firstNumber(raw, ["trade_quantity", "tradeQuantity", "TradeQty", "quantity", "qty"]),
    price,
    trade_timestamp: firstString(raw, ["trade_timestamp", "tradeTimestamp", "trade_time", "TradeTimeStamp", "TradeTime", "timestamp", "time"]),
    // Client-side identifier only (e.g. "1963    1D"); not an order id.
    order_identifier: firstString(raw, ["order_identifier", "orderIdentifier", "client_order_identifier", "clientOrderIdentifier"]) || undefined,
    raw,
  };
}

/** Exchange order id for a trade. Falls back to the matching order's exchange
 * id (matched on internal id) when the trade itself does not carry one yet.
 * Returns "" while the exchange has not confirmed the order. */
export function tradeOrderDisplayId(trade: TradeModel, orders: OrderModel[] = []): string {
  if (trade.exchange_order_no) return trade.exchange_order_no;
  if (trade.internal_order_id) {
    const match = orders.find((order) => order.internal_order_id === trade.internal_order_id && order.exchange_order_no);
    if (match?.exchange_order_no) return match.exchange_order_no;
  }
  return "";
}

export function isIndexInstrument(i: Partial<Instrument> | null | undefined): boolean {
  if (!i) return false;
  if (typeof i.isIndex === "boolean") return i.isIndex;
  return classifyInstrument(i as Instrument) === "INDEX";
}

export function instrumentDisplayName(i: Partial<Instrument>): string {
  const canonical = i.canonicalTradingSymbol?.trim();
  const kind = classifyInstrument(i as Instrument);

  if (
    canonical &&
    (kind === "OPT" || kind === "FUT" || kind === "COMM") &&
    /(?:CE|PE|FUT)$/i.test(canonical)
  ) {
    return cleanDerivativeSymbol(canonical);
  }

  const symbol = i.symbol?.trim().toUpperCase() ?? "";
  const candidates = [i.tradingSymbol, i.companyName, i.displayName];
  const option = (i.optionType ?? "").trim().toUpperCase();
  const expiry = compactExpiry(i.expiryDateText, i.expiryDate);
  const strike = compactStrike(i.strikePrice);
  const looksLikeContract = (value: string) =>
    option === "CE" || option === "PE" ? /(?:CE|PE)$/.test(value.toUpperCase()) : /FUT|\d{2}[A-Z]{3}/.test(value.toUpperCase());

  if (symbol && expiry && kind === "OPT" && option && strike) {
    return cleanDerivativeSymbol(`${symbol}${expiry}${strike}${option}`);
  }
  if (symbol && expiry && (kind === "FUT" || kind === "COMM")) {
    return cleanDerivativeSymbol(`${symbol}${expiry}FUT`);
  }

  if (isIndexInstrument(i)) {
    const raw = (i.symbol || i.displayName || i.tradingSymbol || i.companyName || "").trim();
    return raw.replace(/\s+EQ$/i, "").trim() || "INDEX";
  }

  if (kind === "COMM") {
    for (const candidate of candidates) {
      const compact = (candidate ?? "").trim().toUpperCase().replace(/\s/g, "");
      const future = compact.match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})FUT$/);
      if (future) return cleanDerivativeSymbol(`${future[1]}${future[2]}${monthCode(future[3])}FUT`);
      if (compact && looksLikeContract(compact)) return cleanDerivativeSymbol(compact);
    }
    const expiry = compactExpiry(i.expiryDateText, i.expiryDate);
    if (symbol && expiry) {
      if (option && compactStrike(i.strikePrice)) return cleanDerivativeSymbol(`${symbol}${expiry}${compactStrike(i.strikePrice)}${option}`);
      return cleanDerivativeSymbol(`${symbol}${expiry}FUT`);
    }
  }
  if (kind === "FUT" || kind === "OPT") {
    for (const candidate of candidates) {
      const value = (candidate ?? "").trim();
      if (value && value.toUpperCase() !== symbol && looksLikeContract(value)) return cleanDerivativeSymbol(value);
    }
    for (const part of (i.derivativeDesc ?? "").split("--")) {
      if (looksLikeContract(part.trim())) return cleanDerivativeSymbol(part.trim());
    }
  }
  if (i.symbol?.trim()) {
    return i.series?.trim() ? `${i.symbol.trim()} ${i.series.trim()}` : i.symbol.trim();
  }
  if (i.tradingSymbol?.trim()) return cleanDerivativeSymbol(i.tradingSymbol.trim());
  return "";
}

function monthCode(value: string): string {
  return ({ "01": "JAN", "02": "FEB", "03": "MAR", "04": "APR", "05": "MAY", "06": "JUN", "07": "JUL", "08": "AUG", "09": "SEP", "10": "OCT", "11": "NOV", "12": "DEC" } as Record<string, string>)[value] ?? "";
}

function compactExpiry(value: string | undefined, expiryDate?: number): string {
  const date = Number(expiryDate);
  if (Number.isInteger(date) && date >= 19000101 && date <= 21001231) {
    const year = Math.floor(date / 10000);
    const month = Math.floor((date % 10000) / 100);
    const day = date % 100;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const monthNames = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
      const expiryWeekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
      let lastTuesday = new Date(Date.UTC(year, month, 0));
      while (lastTuesday.getUTCDay() !== expiryWeekday) lastTuesday.setUTCDate(lastTuesday.getUTCDate() - 1);
      const isMonthEndExpiry = day === lastTuesday.getUTCDate() && expiryWeekday === 2;
      return isMonthEndExpiry
        ? `${String(year).slice(-2)}${monthNames[month - 1]}`
        : `${String(day).padStart(2, "0")}${monthNames[month - 1]}`;
    }
  }
  const raw = (value ?? "").trim().toUpperCase();
  const full = raw.match(/(\d{1,2})[\s-]?([A-Z]{3})[\s-]?(\d{4})/);
  if (full) return `${full[3].slice(2)}${full[2]}`;
  const short = raw.match(/([A-Z]{3})(\d{2})/);
  if (short) return `${short[2]}${short[1]}`;
  const numeric = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (numeric) return compactExpiry(undefined, Number(raw));
  return cleanDerivativeSymbol(raw.replace(/[^A-Z0-9]/g, ""));
}

function compactStrike(value: string | undefined): string {
  const number = Number((value ?? "").replace(/,/g, ""));
  if (!Number.isFinite(number) || number <= 0) return "";
  const normalized = number / 100;
  return Number.isInteger(normalized) ? String(normalized) : String(normalized).replace(/\.0+$/, "");
}

export function instrumentSearchSubtitle(i: Instrument): string {
  if (isIndexInstrument(i)) return i.exchangeSegment || i.exchange || "INDEX";
  const kind = classifyInstrument(i);
  const isMcx = (i.exchangeSegment ?? i.exchange).toUpperCase().includes("MCX");
  const parts = [i.exchange];
  if (isMcx && (kind === "FUT" || kind === "OPT" || kind === "COMM")) {
    if (i.expiryDateText) parts.push(`Expiry: ${i.expiryDateText}`);
    if (kind === "OPT" && i.strikePrice) parts.push(`${compactStrike(i.strikePrice) || i.strikePrice} ${(i.optionType ?? "").toUpperCase()}`.trim());
  } else {
    if (i.series) parts.push(i.series);
    if (i.companyName && i.companyName !== i.tradingSymbol) parts.push(i.companyName);
  }
  if (!i.isIndex && (i.regularLot ?? 0) > 1) parts.push(`Lot ${i.regularLot}`);
  return parts.filter(Boolean).join(" · ");
}

export function searchFilters(results: Instrument[]): string[] {
  const kindOrder: InstrumentKind[] = ["STOCK", "INDEX", "FUT", "OPT", "COMM", "CUR"];
  const availableKinds = new Set(results.map(classifyInstrument));
  const segments = Array.from(new Set(results.map(exchangeSegmentFor).filter(Boolean))).sort();
  // Every filter except ALL is derived from the actual lookup response.
  return ["ALL", ...kindOrder.filter((kind) => availableKinds.has(kind)), ...segments.map((segment) => `EXCHANGE:${segment}`)];
}

export function searchFilterLabel(filter: string): string {
  if (filter.startsWith("EXCHANGE:")) return filter.slice("EXCHANGE:".length);
  const labels: Record<string, string> = { STOCK: "Stock", INDEX: "Index", FUT: "Futures", OPT: "Options", COMM: "Commodity", CUR: "Currency" };
  return labels[filter] ?? filter;
}

export function matchesSearchFilter(instrument: Instrument, filter: string): boolean {
  if (filter === "ALL") return true;
  if (filter.startsWith("EXCHANGE:")) {
    return exchangeSegmentFor(instrument).toUpperCase() === filter.slice("EXCHANGE:".length).toUpperCase();
  }
  return classifyInstrument(instrument) === filter;
}

export function sortSearchInstruments(results: Instrument[], query: string, filter: InstrumentKind | "ALL" | string): Instrument[] {
  const text = query.trim().toUpperCase();
  const filtered = results.filter((i) => matchesSearchFilter(i, filter));
  const score = (i: Instrument) => {
    const values = [i.symbol, i.tradingSymbol, i.displayName, instrumentDisplayName(i), i.companyName].map((v) => (v ?? "").toUpperCase());
    if (values.slice(0, 3).some((v) => v === text)) return 0;
    if (values[0].startsWith(text)) return 10;
    if (values.slice(1, 3).some((v) => v.startsWith(text))) return 14;
    if (values.slice(0, 3).some((v) => v.includes(text))) return 30;
    return values[4].includes(text) ? 42 : 70;
  };
  const family = (i: Instrument) => ({ INDEX: 0, STOCK: 1, FUT: 2, OPT: 3, COMM: 4, CUR: 5, OTHER: 6 })[classifyInstrument(i)];
  const seen = new Set<string>();
  return [...filtered]
    .sort((a, b) => score(a) - score(b) || family(a) - family(b) || (a.expiryDate ?? Number.MAX_SAFE_INTEGER) - (b.expiryDate ?? Number.MAX_SAFE_INTEGER) || instrumentDisplayName(a).localeCompare(instrumentDisplayName(b)))
    .filter((i) => {
      const key = `${i.exchangeSegment ?? i.exchange}|${i.token}|${instrumentDisplayName(i)}|${i.expiryDate ?? ""}|${i.strikePrice ?? ""}|${i.optionType ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function positionDisplaySymbol(p: { symbol?: string; exchange?: string; preferred_exchange?: string; instrument?: string; expiry_date?: string; strike_price?: string; option_type?: string }): string {
  const segment = String(p.preferred_exchange || p.exchange || '').toUpperCase();
  const instrument = String(p.instrument || '').toUpperCase();
  const derivative = isDerivativeMarketSegment(segment) || /(?:FUT|OPT)/.test(instrument);
  const base = String(p.symbol || '').trim();
  if (!derivative) return base || '—';
  const rawExpiry = String(p.expiry_date || '').trim().toUpperCase();
  let expiry = compactDerivativeExpiry(rawExpiry);
  const option = String(p.option_type || '').trim().toUpperCase();
  const strike = String(p.strike_price || '').replace(/,/g, '');
  if (base && expiry) {
    if ((option === 'CE' || option === 'PE') && strike) return cleanDerivativeSymbol(`${base}${expiry}${strike}${option}`);
    return cleanDerivativeSymbol(`${base}${expiry}FUT`);
  }
  return base || '—';
}

export function orderDisplaySymbol(o: { trading_symbol: string; series?: string; exchange: string }): string {
  const symbol = String(o.trading_symbol ?? "").trim();
  const exchange = String(o.exchange ?? "").trim().toUpperCase();
  const derivative = isDerivativeMarketSegment(exchange) || /(?:FUT|CE|PE)$/.test(symbol.toUpperCase());

  if (derivative) return cleanDerivativeSymbol(symbol) || "—";

  return (
    instrumentDisplayName({
      symbol,
      series: o.series,
      tradingSymbol: symbol,
      exchangeSegment: exchange,
    }) || symbol || "—"
  );
}

export type OrderKind = "LIMIT" | "MARKET" | "SL_LIMIT" | "SL_MARKET";

const ORDER_KIND_CODE: Record<OrderKind, string> = {
  LIMIT: "RL",
  MARKET: "RL-MKT",
  SL_LIMIT: "SL",
  SL_MARKET: "SL-MKT",
};

export function orderKindRequiresLimitPrice(kind: OrderKind): boolean {
  return kind === "LIMIT" || kind === "SL_LIMIT";
}
export function orderKindRequiresTriggerPrice(kind: OrderKind): boolean {
  return kind === "SL_LIMIT" || kind === "SL_MARKET";
}

export interface BuildOrderParams {
  instrument: Instrument;
  side: TransactionType;
  productType: ProductType;
  orderKind: OrderKind;
  quantity: number;
  price: number;
  triggerPrice?: number;
  disclosedQuantity?: number;
  validity?: Validity;
  validityDays?: number;
  isAmo?: boolean;
}

export function buildOrderPayload(p: BuildOrderParams) {
  const segment = exchangeSegmentFor(p.instrument);
  const instrumentName = (p.instrument.instrumentName ?? "").toUpperCase();
  const isDerivative =
    segment.includes("FO") ||
    segment.includes("COMM") ||
    segment.includes("CUR") ||
    instrumentName.includes("FUT") ||
    instrumentName.includes("OPT") ||
    Boolean((p.instrument.optionType ?? "").trim()) ||
    Boolean((p.instrument.expiryDateText ?? "").trim());
  const symbol = isDerivative
    ? cleanDerivativeSymbol(
        p.instrument.canonicalTradingSymbol ||
        p.instrument.tradingSymbol ||
        p.instrument.symbol ||
        instrumentDisplayName(p.instrument)
      )
    : (
        p.instrument.symbol ||
        p.instrument.tradingSymbol ||
        instrumentDisplayName(p.instrument)
      );
  return {
    scrip_info: {
      exchange: exchangeSegmentFor(p.instrument) || p.instrument.exchange,
      scrip_token: Number(p.instrument.token) || 0,
      symbol,
      series: p.instrument.series ?? "",
      expiry_date: p.instrument.expiryDateText ?? "",
      strike_price: p.instrument.strikePrice ?? "",
      option_type: p.instrument.optionType ?? "",
    },
    transaction_type: p.side,
    product_type: ({
      CNC: "DELIVERY",
      MIS: "INTRADAY",
      NRML: isDerivativeMarketSegment(segment) ? "DELIVERY" : "CARRYFORWARD",
      CO: "COVER",
      BO: "BRACKET",
    } as const)[p.productType],
    order_type: ORDER_KIND_CODE[p.orderKind],
    quantity: p.quantity,
    price: orderKindRequiresLimitPrice(p.orderKind) ? p.price : 0,
    trigger_price: p.triggerPrice ?? 0,
    disclosed_quantity: p.disclosedQuantity ?? 0,
    validity: validityToApi(p.validity ?? "DAY", segment),
    validity_days: p.validityDays ?? 0,
    is_amo: p.isAmo ?? false,
    order_identifier: "",
    part_code: "",
    algo_id: "",
    strategy_id: "",
    vender_code: "",
  };
}

export function feedToken(i: Instrument): string | null {
  const segmentId = i.marketSegmentId ?? Object.entries(SEGMENT_ID_TO_EXCHANGE).find(
    ([, seg]) => seg === (i.exchangeSegment ?? "").toUpperCase()
  )?.[0];
  if (!segmentId || !i.token) return null;
  return `${segmentId}_${i.token}`;
}

export interface BrokerMessageModel {
  MsgSrNo: number;
  SendMsgTime: string;
  Subject: string;
  Message: string;
  MsgType: string;
}

export interface OrderMessageModel {
  time: string;
  date: string;
  cliOrdNo: string;
  msg: string;
  mktSegId: number;
}

export interface ExchangeMessageModel {
  SegmentId: number;
  Time: string;
  Messages: string;
}

export interface RecommendationModel {
  sRecoTag: string;
  sRecoId: string;
  sScripDesc: string;
  nMarketSegmentId: number;
  nToken: number;
  nRecoType: number;
  sRecoDetails: string;
  sSecurityDesc: string;
  sSource: number;
  ID: string;
  LastModify: string;
  nTotalNoRecords: number;
  nExpiryDate: string;
}

/** Merge REST trade history with WebSocket updates. REST rows are loaded first;
 * a matching live row replaces the REST version so the newest socket fields win.
 * The returned array is always strongly typed for table rendering.
 */

/** Sort order-book rows newest first using broker REST or socket timestamps. */
export function sortOrdersNewestFirst(rows: OrderModel[]): OrderModel[] {
  const timestamp = (value?: string): number => {
    if (!value) return 0;
    const raw = String(value).trim();
    // Broker socket formats: 05-Nov-2026 18.55.20 or 05-Nov-2026 18:55:20.
    const broker = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})[ T](\d{1,2})[.:](\d{2})[.:](\d{2})$/);
    if (broker) {
      const months: Record<string, number> = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
      const month = months[broker[2].toUpperCase()];
      if (month !== undefined) return new Date(Number(broker[3]), month, Number(broker[1]), Number(broker[4]), Number(broker[5]), Number(broker[6])).getTime();
    }
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return rows.map((row, index) => ({ row, index, time: timestamp(row.order_timestamp) }))
    .sort((a, b) => b.time - a.time || a.index - b.index)
    .map(({ row }) => row);
}

/** Combine two versions of the same trade (REST snapshot + socket update).
 * Newer non-empty values win, but a blank/"0" id or a zero price never erases
 * a value we already know. */
function mergeTrade(prev: TradeModel, next: TradeModel): TradeModel {
  const exchangeOrderNo = next.exchange_order_no || prev.exchange_order_no;
  const internalOrderId = next.internal_order_id || prev.internal_order_id;
  return {
    ...prev,
    ...next,
    exchange: next.exchange || prev.exchange,
    exchange_order_no: exchangeOrderNo,
    internal_order_id: internalOrderId,
    order_id: exchangeOrderNo || internalOrderId || next.order_id || prev.order_id,
    order_identifier: next.order_identifier || prev.order_identifier,
    product_type: next.product_type || prev.product_type,
    order_type: next.order_type || prev.order_type,
    trade_timestamp: next.trade_timestamp || prev.trade_timestamp,
    price: next.price > 0 ? next.price : prev.price,
    raw: { ...(prev.raw ?? {}), ...(next.raw ?? {}) },
  };
}

export function mergeTradeRows(restRows: TradeModel[], liveRows: TradeModel[]): TradeModel[] {
  const rows: TradeModel[] = [];
  const byTradeId = new Map<string, number[]>();
  const byFallback = new Map<string, number>();

  const upsert = (trade: TradeModel, index: number, source: string) => {
    const tradeId = String(trade.trade_id ?? "").trim();
    const exchange = normalizeExchangeSegment(trade.exchange);

    if (tradeId) {
      // A blank exchange on either side still counts as the same trade.
      const candidates = byTradeId.get(tradeId) ?? [];
      const hit = candidates.find((i) => {
        const other = normalizeExchangeSegment(rows[i].exchange);
        return !other || !exchange || other === exchange;
      });
      if (hit !== undefined) {
        rows[hit] = mergeTrade(rows[hit], trade);
        return;
      }
      byTradeId.set(tradeId, [...candidates, rows.length]);
      rows.push(trade);
      return;
    }

    const token = String(trade.scrip_token ?? "").trim();
    const orderRef = String(trade.internal_order_id || trade.order_id || trade.order_identifier || "").trim();
    const timestamp = String(trade.trade_timestamp ?? "").trim();
    const quantity = Number(trade.quantity) || 0;
    const price = Number(trade.price) || 0;
    const parts = [exchange, token, orderRef, timestamp, quantity, price];
    const key = parts.join("|").replace(/\|/g, "").trim() ? `fallback:${parts.join("|")}` : `${source}:unidentified:${index}`;
    const hit = byFallback.get(key);
    if (hit !== undefined) {
      rows[hit] = mergeTrade(rows[hit], trade);
      return;
    }
    byFallback.set(key, rows.length);
    rows.push(trade);
  };

  restRows.forEach((trade, index) => upsert(trade, index, "rest"));
  liveRows.forEach((trade, index) => upsert(trade, index, "live"));
  return rows;
}
