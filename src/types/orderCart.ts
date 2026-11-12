import { isDerivativeMarketSegment } from "@/types/trading";
import type { Instrument, ProductType, OrderType, TransactionType, Validity } from "@/types/trading";

export interface OrderCartOrder {
  raw: Record<string, any>;
  symbol: string;
  exchange: string;
  series: string;
  side: TransactionType | string;
  productType: string;
  orderType: string;
  price: string;
  validity: string;
  quantity: number;
  marketLot: number;
  token: number;
  exchangeSegment: string;
  isMarketOrder: boolean;
  expiryDate: string;
  optionType: string;
  strikePrice: string;
}

export interface OrderCart {
  id: string;
  name: string;
  modifiedAt: string;
  orders: OrderCartOrder[];
  raw: Record<string, any>;
}

export interface OrderCartPlacementItem {
  success: boolean;
  code: string;
  message: string;
  orderId: string;
}

export interface OrderCartPlacementResult {
  success: boolean;
  message: string;
  items: OrderCartPlacementItem[];
}

const str = (value: unknown) => value == null ? "" : String(value);
const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const bool = (value: unknown) => value === true || value === "true" || value === 1 || value === "1";
const map = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};

function first(obj: Record<string, any>, keys: string[]) {
  for (const key of keys) if (obj[key] != null && str(obj[key]).trim() !== "") return obj[key];
  return undefined;
}

function decodeOrders(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  return [];
}

function segmentFromId(id: number, exchange: string, series: string, instrumentName: string) {
  const byId: Record<number, string> = { 1: "NSE_EQ", 2: "NSE_FO", 3: "BSE_EQ", 4: "BSE_FO", 5: "MCX_FO", 7: "NCDEX_FO", 13: "NSE_CDS", 18: "BSE_COMM", 19: "NSE_COMM" };
  if (byId[id]) return byId[id];
  const ex = exchange.toUpperCase();
  if (ex.includes("_")) return ex;
  if (["EQ", "BE", "BZ", "A"].includes(series.toUpperCase())) return `${ex}_EQ`;
  if (instrumentName.toUpperCase().startsWith("FUT") || instrumentName.toUpperCase().startsWith("OPT")) return `${ex}_FO`;
  return ex;
}

export function orderCartOrderFromRaw(raw: Record<string, any>): OrderCartOrder {
  const detail = map(first(raw, ["scripDetail", "scrip_detail"]));
  const scrip = map(first(raw, ["scrip_info", "scripInfo"]));
  const det = Object.keys(map(raw.scripDet)).length ? map(raw.scripDet) : map(detail.scripDet);
  const symbol = str(first(raw, ["symbol", "Symbol"]) ?? first(detail, ["symbol", "Symbol"]));
  const exchange = str(first(raw, ["exchange", "_ExchangeName"]) ?? first(detail, ["_ExchangeName", "exchange"]));
  const series = str(first(raw, ["series", "_Series"]) ?? first(detail, ["_Series", "series"]));
  const instrumentName = str(first(raw, ["_InstrumentName"]) ?? first(detail, ["_InstrumentName"]));
  const token = num(first(scrip, ["scrip_token", "token", "Token"]) ?? first(det, ["scrip_token", "token", "Token"]));
  const segmentId = num(first(det, ["_MktSegId", "_MapMktSegId", "MktSegId"]));
  const exchangeSegment = str(first(scrip, ["exchange"]) ?? segmentFromId(segmentId, exchange, series, instrumentName));
  const orderType = str(first(raw, ["order_type", "OrderType"]) ?? "RL");
  const price = str(first(raw, ["price", "Price"]) ?? "0.00");
  return {
    raw,
    symbol,
    exchange,
    series,
    side: str(first(raw, ["transaction_type", "TransactionType"]) ?? "BUY"),
    productType: str(first(raw, ["product_type", "ProductType"]) ?? "DELIVERY"),
    orderType,
    price,
    validity: str(first(raw, ["validity"]) ?? "DAY"),
    quantity: num(first(raw, ["quantity", "Quantity"])),
    marketLot: Math.max(1, num(first(raw, ["MarketLot"]) ?? first(detail, ["MarketLot"]))),
    token,
    exchangeSegment,
    isMarketOrder: orderType.toUpperCase().includes("MKT"),
    expiryDate: str(first(raw, ["_ExpiryDate"]) ?? first(detail, ["_ExpiryDate"]) ?? first(scrip, ["expiry_date", "expiryDate"])),
    optionType: str(first(raw, ["_OptionType"]) ?? first(detail, ["_OptionType"]) ?? first(scrip, ["option_type", "optionType"])),
    strikePrice: str(first(raw, ["_StrikePrice"]) ?? first(detail, ["_StrikePrice"]) ?? first(scrip, ["strike_price", "strikePrice"])),
  };
}

export function orderCartFromJson(json: Record<string, any>): OrderCart {
  return {
    id: str(first(json, ["ordercartId", "orderCartId", "id"])),
    name: str(first(json, ["ordercartName", "orderCartName", "name"])),
    modifiedAt: str(first(json, ["modifiedAt", "updatedAt", "createdAt"])),
    orders: decodeOrders(json.orders).filter((x) => x && typeof x === "object").map((x) => orderCartOrderFromRaw(x as Record<string, any>)),
    raw: json,
  };
}

export function makeCartOrder(instrument: Instrument, ltp = 0): OrderCartOrder {
  const segment = (instrument.exchangeSegment ?? "").trim().toUpperCase() || segmentFromId(instrument.marketSegmentId ?? instrument.tradingMarketSegmentId ?? 0, instrument.exchange, instrument.series ?? "", instrument.instrumentName ?? "");
  const lot = Math.max(1, instrument.regularLot ?? 1);
  const defaultPrice = ltp > 0 ? ltp : 0;
  const exchange = instrument.exchange.trim().toUpperCase() || segment.split("_")[0];
  const raw = {
    symbol: instrument.symbol || instrument.tradingSymbol,
    _Series: instrument.series || (segment.endsWith("_EQ") ? "EQ" : ""),
    _InstrumentName: instrument.instrumentName || "",
    _ExchangeName: exchange,
    _ExpiryDate: instrument.expiryDateText || "NA",
    _OptionType: instrument.optionType || "NA",
    _StrikePrice: instrument.strikePrice || "NA",
    MarketLot: lot,
    PriceTick: instrument.priceTick ?? 0,
    SecurityDesc: instrument.tradingSymbol || instrument.companyName || instrument.symbol,
    DecimalLocator: 100,
    ISIN: instrument.isin || "",
    TransactionType: "BUY",
    OrderType: "RL-MKT",
    Quantity: lot,
    Price: "0.00",
    DefaultPrice: defaultPrice > 0 ? defaultPrice.toFixed(2) : "0.00",
    ProductType: segment.includes("_EQ") ? "DELIVERY" : "CARRYFORWARD",
    TriggerPrice: "0",
    is_amo: false,
    disclosed_quantity: 0,
    validity: "DAY",
    scripDet: {
      token: Number(instrument.token) || 0,
      _MktSegId: instrument.marketSegmentId ?? instrument.tradingMarketSegmentId ?? 0,
      _MapMktSegId: instrument.marketSegmentId ?? instrument.tradingMarketSegmentId ?? 0,
    },
  };
  return orderCartOrderFromRaw(raw);
}

export function orderCartToCreatePayload(cart: OrderCart, userId: string) {
  return {
    ordercartName: cart.name,
    orders: JSON.stringify(cart.orders.map((order) => orderToCreatePayload(order))),
    version: "1",
    createdBy: userId || "WEB",
    modifiedBy: userId || "WEB",
    executedNoTime: num(cart.raw.executedNoTime ?? cart.raw.executed_no_time),
  };
}

function orderToCreatePayload(order: OrderCartOrder) {
  const raw = order.raw;
  const detail = map(raw.scripDetail ?? raw.scrip_detail);
  const directDet = map(raw.scripDet);
  return {
    scripDetail: {
      symbol: order.symbol,
      _Series: order.series,
      _InstrumentName: str(raw._InstrumentName ?? detail._InstrumentName),
      _ExchangeName: order.exchange,
      _ExpiryDate: str(raw._ExpiryDate ?? detail._ExpiryDate) || "NA",
      _OptionType: str(raw._OptionType ?? detail._OptionType) || "NA",
      _StrikePrice: str(raw._StrikePrice ?? detail._StrikePrice) || "NA",
      MarketLot: num(raw.MarketLot ?? detail.MarketLot),
      PriceTick: num(raw.PriceTick ?? detail.PriceTick),
      SecurityDesc: str(raw.SecurityDesc ?? detail.SecurityDesc),
      DecimalLocator: num(raw.DecimalLocator ?? detail.DecimalLocator),
      ISIN: str(raw.ISIN ?? detail.ISIN),
      scripDet: Object.keys(directDet).length ? directDet : { token: order.token },
    },
    TransactionType: order.side,
    OrderType: order.orderType,
    Quantity: order.quantity,
    Price: order.isMarketOrder ? "0.00" : (order.price || "0.00"),
    ProductType: order.productType,
    TriggerPrice: str(raw.TriggerPrice ?? "0"),
    is_amo: bool(raw.is_amo ?? raw.isAmo),
    disclosed_quantity: num(raw.disclosed_quantity ?? raw.disclosedQuantity),
    validity: order.validity || "DAY",
  };
}

export function orderCartToPlacePayload(cart: OrderCart) {
  return {
    ordercartId: cart.id,
    ordercartName: cart.name,
    orders: cart.orders.map((order) => {
      const raw = order.raw;
      const detail = map(raw.scripDetail ?? raw.scrip_detail);
      const scrip = map(raw.scrip_info ?? raw.scripInfo);
      const det = map(raw.scripDet) || map(detail.scripDet);
      return {
        scrip_info: {
          exchange: order.exchangeSegment,
          scrip_token: num(scrip.scrip_token ?? scrip.token ?? scrip.Token ?? det.token ?? order.token),
          symbol: str(scrip.symbol) || order.symbol,
          series: str(scrip.series) || order.series,
          expiry_date: str(scrip.expiry_date ?? scrip.expiryDate) || order.expiryDate,
          strike_price: str(scrip.strike_price ?? scrip.strikePrice) || order.strikePrice,
          option_type: str(scrip.option_type ?? scrip.optionType) || order.optionType,
        },
        transaction_type: order.side,
        // Carry Forward is an AveonTrade display label for derivatives.
        // The broker order-placement API expects Delivery internally.
        product_type: isDerivativeMarketSegment(order.exchangeSegment) &&
          ["CARRYFORWARD", "NRML", "DELIVERY", "CNC"].includes(String(order.productType).toUpperCase())
          ? "DELIVERY"
          : order.productType,
        order_type: order.orderType,
        quantity: order.quantity,
        price: order.isMarketOrder ? "0.00" : (order.price || "0.00"),
        trigger_price: str(raw.trigger_price ?? raw.TriggerPrice) || "0.00",
        disclosed_quantity: num(raw.disclosed_quantity ?? raw.disclosedQuantity),
        validity: order.validity || "DAY",
        is_amo: bool(raw.is_amo ?? raw.isAmo),
        order_identifier: cart.id,
      };
    }),
  };
}

export function orderCartDisplayProduct(value: string) {
  const v = value.toUpperCase();
  return v === "DELIVERY" || v === "CNC" ? "Delivery" : v === "INTRADAY" || v === "MIS" ? "Intraday" : v === "CARRYFORWARD" || v === "NRML" ? "Carry Forward" : v === "COVER" || v === "CO" ? "Cover" : v === "BRACKET" || v === "BO" ? "Bracket" : value;
}
