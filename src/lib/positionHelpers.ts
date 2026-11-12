import type { Instrument, PositionModel } from "@/types/trading";

/** Turns a raw broker position row into a PositionModel with numeric fields. */
export function normalizePositionRow(raw: Record<string, any>): PositionModel {
  const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const s = (v: any) => (v == null ? "" : String(v));
  return {
    exchange: s(raw.exchange),
    preferred_exchange: s(raw.preferred_exchange) || undefined,
    scrip_token: raw.scrip_token,
    preferred_scrip_token: raw.preferred_scrip_token,
    symbol: s(raw.symbol),
    series: s(raw.series) || undefined,
    product_type: s(raw.product_type),
    instrument: s(raw.instrument) || undefined,
    expiry_date: s(raw.expiry_date) || undefined,
    strike_price: s(raw.strike_price) || undefined,
    option_type: s(raw.option_type) || undefined,
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
    daily_or_expiry: s(raw.daily_or_expiry) || undefined,
  };
}

/** Instrument descriptor used to subscribe a position to the live feed.
 * Segment resolution is centralized in feedToken() via the instrument metadata helpers.
 */
export function positionToInstrument(p: PositionModel): Instrument | null {
  const exchange = (p.preferred_exchange || p.exchange || "").toUpperCase();
  const token = String(p.preferred_scrip_token ?? p.scrip_token ?? "");
  if (!exchange || !token || token === "0") return null;
  return {
    exchange,
    exchangeSegment: exchange,
    token,
    symbol: p.symbol,
    tradingSymbol: p.symbol,
    companyName: p.symbol,
    series: p.series,
    instrumentName: p.instrument,
    optionType: p.option_type,
    expiryDateText: p.expiry_date,
    strikePrice: p.strike_price,
    regularLot: p.market_lot,
  };
}

/**
 * MTM gain/loss for one position row.
 *  - Open position: the same live formula the Positions page shows as "Live P&L",
 *    so both screens agree. Returns null until a live price has arrived.
 *  - Flat position: the booked profit/loss from the bought and sold quantity.
 */
export function positionMtm(p: PositionModel, ltp: number): number | null {
  const multiplier = p.multiplier || 1;
  if (p.net_quantity === 0) {
    const closedQty = Math.min(p.buy_quantity, p.sell_quantity);
    return closedQty > 0 ? closedQty * (p.avg_sell_price - p.avg_buy_price) * multiplier : 0;
  }
  if (!(ltp > 0)) return null;
  const entry = p.net_price || (p.net_quantity >= 0 ? p.avg_buy_price : p.avg_sell_price);
  return (ltp - entry) * p.net_quantity * multiplier;
}
