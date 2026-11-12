"use client";

import { useEffect, useRef, useState } from "react";
import { feedToken, type Instrument, type WatchlistQuote } from "@/types/trading";
import { saveLastMarketQuote } from "@/lib/marketQuoteCache";

function normalizeTick(raw: Record<string, any>): { token: string; ltp: number; closePrice: number; change: number; changePercent: number } | null {
  const mktSegId = raw?.["1"] !== undefined ? Number(raw["1"]) : Number(raw?.mktSegId);
  const token = raw?.["7"] !== undefined ? String(raw["7"]) : (raw?.token !== undefined ? String(raw.token) : undefined);
  
  if (!token || !Number.isFinite(mktSegId)) return null;

  const decimalLocator = raw?.["399"] !== undefined ? Number(raw["399"]) : 100;
  const divisor = decimalLocator > 0 ? decimalLocator : 100;

  const usesProtocolTags = raw?.["8"] !== undefined;
  const rawLtp = usesProtocolTags ? Number(raw["8"]) : Number(raw?.ltp);
  const rawClose = raw?.["250"] !== undefined ? Number(raw["250"]) : (raw?.["76"] !== undefined ? Number(raw["76"]) : Number(raw?.closePrice));

  if ((!Number.isFinite(rawLtp) || rawLtp === 0) && !raw?.depth && raw?.bidPrice === undefined && raw?.bid_price === undefined && raw?.askPrice === undefined && raw?.ask_price === undefined && raw?.bid === undefined && raw?.ask === undefined && raw?.["1"] === undefined && raw?.["4"] === undefined) return null;

  const ltp = Number.isFinite(rawLtp) && rawLtp !== 0 ? (usesProtocolTags ? rawLtp / divisor : rawLtp) : Number(raw?.ltp) || 0;
  const closePrice = Number.isFinite(rawClose) && rawClose > 0 ? (usesProtocolTags || raw?.["250"] !== undefined || raw?.["76"] !== undefined ? rawClose / divisor : rawClose) : ltp;

  const change = Number(raw?.change) || 0;
  const changePercent = Number(raw?.changePercent ?? raw?.netChange) || 0;

  return {
    token: `${mktSegId}_${token}`,
    ltp,
    closePrice,
    change,
    changePercent
  };
}

const FLUSH_MS = 100;
const MAX_BUFFERED_TICKS = 20_000;

type StreamState = {
  // REMOVED flat symbols map. All quotes are strictly stored by composite segment keys.
  byToken: Record<string, WatchlistQuote>;
};

type BufferedTick = {
  raw: Record<string, any>;
  tick: NonNullable<ReturnType<typeof normalizeTick>>;
  symbol: string;
};

const EMPTY_STATE: StreamState = { byToken: {} };

function buildQuote(raw: Record<string, any>, tick: NonNullable<ReturnType<typeof normalizeTick>>, symbol: string, prevSymbolData: any): any {
  return {
    exchange: prevSymbolData?.exchange ?? "",
    trading_symbol: symbol,
    ltp: tick.ltp || prevSymbolData?.ltp || 0,
    receivedAt: Date.now(),
    change: tick.change,
    change_percent: tick.changePercent,
    open: raw?.open ?? (raw?.["75"] ? (Number(raw["75"]) / (Number(raw["399"]) || 100)) : (prevSymbolData?.open ?? 0)),
    high: raw?.high ?? (raw?.["77"] ? (Number(raw["77"]) / (Number(raw["399"]) || 100)) : (prevSymbolData?.high ?? 0)),
    low: raw?.low ?? (raw?.["78"] ? (Number(raw["78"]) / (Number(raw["399"]) || 100)) : (prevSymbolData?.low ?? 0)),
    close: tick.closePrice || prevSymbolData?.close || 0,
    volume: raw?.volume ?? (raw?.["79"] ? Number(raw["79"]) : prevSymbolData?.volume),
    ltq: Number(raw?.ltq ?? raw?.["9"] ?? prevSymbolData?.ltq ?? 0),
    bid_price: Number(raw?.bidPrice ?? raw?.bid_price ?? raw?.bid ?? prevSymbolData?.bid_price ?? 0),
    bid_qty: Number(raw?.bidQty ?? raw?.bid_qty ?? prevSymbolData?.bid_qty ?? 0),
    ask_price: Number(raw?.askPrice ?? raw?.ask_price ?? raw?.ask ?? prevSymbolData?.ask_price ?? 0),
    ask_qty: Number(raw?.askQty ?? raw?.ask_qty ?? prevSymbolData?.ask_qty ?? 0),
    open_interest: Number(raw?.openInterest ?? raw?.open_interest ?? prevSymbolData?.open_interest ?? 0),
    depth: raw?.depth ?? prevSymbolData?.depth,
    buy_qty: Number(raw?.buyQty ?? raw?.buy_qty ?? raw?.["2"] ?? prevSymbolData?.buy_qty ?? 0),
    sell_qty: Number(raw?.sellQty ?? raw?.sell_qty ?? raw?.["5"] ?? prevSymbolData?.sell_qty ?? 0),
    last_trade_time: String(raw?.lastTradeTime ?? raw?.last_trade_time ?? raw?.["73"] ?? prevSymbolData?.last_trade_time ?? ""),
    last_update_time: String(raw?.lastUpdateTime ?? raw?.last_update_time ?? raw?.["74"] ?? prevSymbolData?.last_update_time ?? ""),
    net_change: tick.change,
    average_traded_price: Number(raw?.avgTradedPrice ?? raw?.average_traded_price ?? (raw?.["80"] !== undefined ? Number(raw["80"]) / (Number(raw?.["399"]) || 100) : prevSymbolData?.average_traded_price ?? 0)),
    lifetime_high: Number(raw?.lifetimeHigh ?? raw?.lifetime_high ?? (raw?.["93"] !== undefined ? Number(raw["93"]) / (Number(raw?.["399"]) || 100) : prevSymbolData?.lifetime_high ?? 0)),
    lifetime_low: Number(raw?.lifetimeLow ?? raw?.lifetime_low ?? (raw?.["94"] !== undefined ? Number(raw["94"]) / (Number(raw?.["399"]) || 100) : prevSymbolData?.lifetime_low ?? 0)),
    market_type: String(raw?.marketType ?? raw?.market_type ?? raw?.["38"] ?? prevSymbolData?.market_type ?? ""),
    open_interest_percentage: Number(raw?.openInterestPercentage ?? raw?.open_interest_percentage ?? raw?.["465"] ?? prevSymbolData?.open_interest_percentage ?? 0),
    high_open_interest: Number(raw?.highOpenInterest ?? raw?.high_open_interest ?? raw?.["466"] ?? prevSymbolData?.high_open_interest ?? 0),
    low_open_interest: Number(raw?.lowOpenInterest ?? raw?.low_open_interest ?? raw?.["467"] ?? prevSymbolData?.low_open_interest ?? 0),
    daily_price_range: String(raw?.dailyPriceRange ?? raw?.daily_price_range ?? raw?.["380"] ?? prevSymbolData?.daily_price_range ?? ""),
    trade_execution_range: String(raw?.tradeExecutionRange ?? raw?.trade_execution_range ?? raw?.["499"] ?? prevSymbolData?.trade_execution_range ?? ""),
    cas_reference_price: Number(raw?.casReferencePrice ?? raw?.cas_reference_price ?? (raw?.["417"] !== undefined ? Number(raw["417"]) / (Number(raw?.["399"]) || 100) : prevSymbolData?.cas_reference_price ?? 0)),
    indicative_close_price: Number(raw?.indicativeClosePrice ?? raw?.indicative_close_price ?? (raw?.["418"] !== undefined ? Number(raw["418"]) / (Number(raw?.["399"]) || 100) : prevSymbolData?.indicative_close_price ?? 0)),
    imbalance_qty_equi_price: Number(raw?.imbalanceQtyEquiPrice ?? raw?.imbalance_qty_equi_price ?? (raw?.["419"] !== undefined ? Number(raw["419"]) / (Number(raw?.["399"]) || 100) : prevSymbolData?.imbalance_qty_equi_price ?? 0)),
    imbalance_qty_market_order_equi_price: Number(raw?.imbalanceQtyMarketOrderEquiPrice ?? raw?.imbalance_qty_market_order_equi_price ?? (raw?.["420"] !== undefined ? Number(raw["420"]) / (Number(raw?.["399"]) || 100) : prevSymbolData?.imbalance_qty_market_order_equi_price ?? 0)),
    decimal_locator: Number(raw?.decimalLocator ?? raw?.decimal_locator ?? raw?.["399"] ?? prevSymbolData?.decimal_locator ?? 100),
    last_trade_quantity: Number(raw?.ltq ?? raw?.last_trade_quantity ?? raw?.["9"] ?? prevSymbolData?.last_trade_quantity ?? 0),
  };
}

function applyTicks(prev: StreamState, batch: BufferedTick[]): StreamState {
  let byToken = prev.byToken;
  let byTokenCopied = false;
  
  const writableByToken = () => {
    if (!byTokenCopied) { byToken = { ...byToken }; byTokenCopied = true; }
    return byToken;
  };

  for (const { raw, tick, symbol } of batch) {
    const prevTokenQuote = byToken[tick.token];

    if (raw?.depth && !(Number.isFinite(tick.ltp) && tick.ltp > 0)) {
      if (!prevTokenQuote) continue;
      writableByToken()[tick.token] = { ...prevTokenQuote, depth: raw.depth };
      continue;
    }

    const quote = buildQuote(raw, tick, symbol, prevTokenQuote);
    // Enforce strictly segment-qualified storage by composite token key (MktSegId_Token)
    writableByToken()[tick.token] = quote;
  }

  return byTokenCopied ? { byToken } : prev;
}

export function useMarketStream(
  instruments: Instrument[],
  depthInstrument?: Instrument | null,
  cashPair?: Instrument | Instrument[] | null,
  traceName?: string,
) {
  const [state, setState] = useState<StreamState>(EMPTY_STATE);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const tokenToSymbol = useRef<Record<string, string>>({});
  const bufferRef = useRef<BufferedTick[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cashPairInstruments = Array.isArray(cashPair) ? cashPair : (cashPair ? [cashPair] : []);
  const feedInstruments = cashPairInstruments.length > 0 ? [...instruments, ...cashPairInstruments] : instruments;

  const tokenKeys = feedInstruments
    .map((i) => ({ token: feedToken(i), symbol: i.tradingSymbol || i.symbol }))
    .filter((x): x is { token: string; symbol: string } => !!x.token);

  useEffect(() => () => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = null;
    bufferRef.current = [];
  }, []);

  useEffect(() => {
    if (tokenKeys.length === 0) {
      setConnected(null);
      setLastError(null);
      return;
    }

    tokenToSymbol.current = Object.fromEntries(tokenKeys.map((t) => [t.token, t.symbol]));

    const params = new URLSearchParams({ tokens: tokenKeys.map((t) => t.token).join(",") });
    const depthToken = depthInstrument ? feedToken(depthInstrument) : null;
    if (depthToken) params.set("depthToken", depthToken);
    if (traceName) params.set("trace", traceName);
    const source = new EventSource(`/api/broker/market-feed?${params.toString()}`, { withCredentials: true });
    sourceRef.current = source;

    const flush = () => {
      flushTimerRef.current = null;
      const batch = bufferRef.current;
      if (batch.length === 0) return;
      bufferRef.current = [];
      for (const { tick, symbol } of batch) {
        if (tick.ltp > 0) saveLastMarketQuote(tick.token, { ltp: tick.ltp, receivedAt: Date.now(), tradingSymbol: symbol });
      }
      setState((prev) => applyTicks(prev, batch));
    };

    source.addEventListener("subscribed", () => {
      setConnected(true);
      setLastError(null);
    });

    source.addEventListener("error", (event) => {
      setConnected(false);
      try {
        const data = JSON.parse((event as MessageEvent).data ?? "{}");
        if (data.message) setLastError(String(data.message));
      } catch { /* standard browser event fallback */ }
    });

    source.onerror = () => {
      setConnected(false);
      setLastError((prev) => prev ?? "Connection to the market feed dropped. Retrying…");
    };

    source.addEventListener("tick", (event) => {
      try {
        const raw = JSON.parse((event as MessageEvent).data);
        const tick = normalizeTick(raw);
        if (!tick) return;

        const symbol = tokenToSymbol.current[tick.token];
        if (!symbol) return;

        const buffer = bufferRef.current;
        if (buffer.length >= MAX_BUFFERED_TICKS) buffer.splice(0, buffer.length - MAX_BUFFERED_TICKS + 1);
        buffer.push({ raw, tick, symbol });
        if (!flushTimerRef.current) flushTimerRef.current = setTimeout(flush, FLUSH_MS);
      } catch { /* ignore malformed ticks */ }
    });

    source.addEventListener("closed", (event) => {
      setConnected(false);
      try {
        const data = JSON.parse((event as MessageEvent).data ?? "{}");
        setLastError(`Feed closed (code ${data.code ?? "?"}): ${data.reason || "no reason given"}`);
      } catch {
        setLastError("Feed connection closed.");
      }
    });

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, [tokenKeys.map((t) => t.token).join(","), depthInstrument ? feedToken(depthInstrument) : "", cashPairInstruments.map((i) => feedToken(i)).join(","), traceName]);

  // Expose quotes strictly via quotesByToken to enforce composite segment lookup across components
  return { quotes: state.byToken, quotesByToken: state.byToken, connected, lastError };
}