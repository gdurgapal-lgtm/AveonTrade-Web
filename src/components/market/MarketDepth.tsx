"use client";

import { useEffect, useRef, useState } from "react";
import { BarChart3, ChevronsLeft, ChevronsRight, Maximize2, Minimize2, Mouse } from "lucide-react";
import { usePanelMaximize } from "@/hooks/usePanelMaximize";
import { formatCurrency, formatNumber, pnlTone } from "@/lib/format";
import { instrumentDisplayName, isIndexInstrument, type Instrument, type WatchlistQuote } from "@/types/trading";

type DepthLevel = { price: number; quantity: number; orders?: number };
type Depth = {
  bids?: DepthLevel[];
  asks?: DepthLevel[];
  totalBuyQty?: number;
  totalSellQty?: number;
  avgTradedPrice?: number;
  week52High?: number;
  week52Low?: number;
  circuitRange?: string;
};

type TradeRequest = { side: "BUY" | "SELL"; price?: number; quantity?: number; productType?: "CNC" | "MIS" | "NRML"; orderKind?: "LIMIT" };

function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>(undefined);
  useEffect(() => {
    if (value !== undefined) {
      ref.current = value;
    }
  }, [value]);
  return ref.current;
}

const isLevel = (level?: DepthLevel): level is DepthLevel => !!level && (level.quantity > 0 || level.price > 0);

function formatFeedTime(raw?: string): { time: string; date?: string } | null {
  const m = String(raw ?? "").trim().match(/^(?:(\d{4})-(\d{2})-(\d{2})[ T])?(\d{2}):?(\d{2}):?(\d{2})$/);
  if (!m) return null;
  const time = `${m[4]}:${m[5]}:${m[6]}`;
  let date: string | undefined;
  if (m[1]) {
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
    if (!Number.isNaN(d.getTime()) && d.toDateString() !== new Date().toDateString()) {
      date = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    }
  }
  return { time, date };
}

const TONE_TEXT = { buy: "text-aveon-buy", sell: "text-aveon-sell", neutral: "text-aveon-muted" } as const;

export default function MarketDepth({
  instrument,
  quote,
  onTrade,
  connected,
  layoutWide,
  onToggleLayout,
}: {
  instrument: Instrument | null;
  quote?: WatchlistQuote & { depth?: Depth };
  onTrade: (request?: TradeRequest) => void;
  connected?: boolean;
  layoutWide?: boolean;
  onToggleLayout?: () => void;
}) {
  const { maximized, toggle, Portal } = usePanelMaximize({ size: "half" });
  const [mouseTrading, setMouseTrading] = useState(false);
  const [mouseDefaults, setMouseDefaults] = useState({ quantity: 1, productType: "MIS" as "CNC" | "MIS" | "NRML" });
  useEffect(() => {
    try {
      setMouseTrading(window.localStorage.getItem("aveon.marketDepth.mouseTrading.v1") === "true");
      const raw = window.localStorage.getItem("aveon.marketDepth.defaults.v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        setMouseDefaults({ quantity: Math.max(1, Math.floor(Number(parsed.quantity) || 1)), productType: ["CNC", "MIS", "NRML"].includes(parsed.productType) ? parsed.productType : "MIS" });
      }
    } catch { /* Keep safe defaults */ }
  }, []);
  const launchMouseOrder = (side: "BUY" | "SELL", price?: number) => {
    if (!mouseTrading || !instrument || isIndexInstrument(instrument)) return;
    onTrade({ side, price, quantity: mouseDefaults.quantity, productType: mouseDefaults.productType, orderKind: "LIMIT" });
  };

  const currentLtp = instrument ? quote?.ltp : undefined;
  const prevLtp = usePrevious(currentLtp);

  if (!instrument) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-xs text-aveon-muted">
        Select a symbol to view market depth.
      </div>
    );
  }

  const isIndex = isIndexInstrument(instrument);
  const depth = quote?.depth;
  const bids = isIndex ? [] : depth?.bids ?? [];
  const asks = isIndex ? [] : depth?.asks ?? [];
  const hasDepth = bids.some(isLevel) || asks.some(isLevel);
  const depthReceived = bids.length > 0 || asks.length > 0;

  const rows = Array.from({ length: Math.max(5, bids.length, asks.length) }, (_, index) => ({
    bid: isLevel(bids[index]) ? bids[index] : undefined,
    ask: isLevel(asks[index]) ? asks[index] : undefined,
  }));
  const maxQty = Math.max(1, ...rows.flatMap(({ bid, ask }) => [bid?.quantity ?? 0, ask?.quantity ?? 0]));

  const bestBid = rows[0]?.bid;
  const bestAsk = rows[0]?.ask;
  const spread = bestBid && bestAsk && bestBid.price > 0 && bestAsk.price > 0 ? bestAsk.price - bestBid.price : undefined;
  const spreadPct = spread !== undefined && bestAsk ? (spread / bestAsk.price) * 100 : undefined;

  const toneKey = quote ? pnlTone(quote.change) : "neutral";
  const tone = TONE_TEXT[toneKey];
  const exchangeTotals = !!(depth?.totalBuyQty || depth?.totalSellQty);
  const totalBuy = depth?.totalBuyQty || bids.reduce((sum, level) => sum + (level?.quantity ?? 0), 0);
  const totalSell = depth?.totalSellQty || asks.reduce((sum, level) => sum + (level?.quantity ?? 0), 0);
  const buyerRatio = totalBuy + totalSell > 0 ? (totalBuy / (totalBuy + totalSell)) * 100 : 50;

  const circuitParts = depth?.circuitRange?.split("-").map(Number) ?? [];
  const circuitLow = circuitParts.length === 2 && circuitParts[0] > 0 ? circuitParts[0] : undefined;
  const circuitHigh = circuitParts.length === 2 && circuitParts[1] > 0 ? circuitParts[1] : undefined;
  const ltp = quote?.ltp ?? 0;
  const circuitHit = ltp > 0 && circuitHigh !== undefined && ltp >= circuitHigh ? "Upper circuit" : ltp > 0 && circuitLow !== undefined && ltp <= circuitLow ? "Lower circuit" : null;

  let ltpTickColor: string = tone;
  if (currentLtp !== undefined && prevLtp !== undefined) {
    if (currentLtp > prevLtp) ltpTickColor = "text-aveon-buy";
    if (currentLtp < prevLtp) ltpTickColor = "text-aveon-sell";
  }

  const show52Week = !!depth?.week52High && !!depth?.week52Low && depth.week52High > depth.week52Low;
  const showCircuit = circuitLow !== undefined && circuitHigh !== undefined && circuitHigh > circuitLow;
  const updated = formatFeedTime(quote?.last_update_time);
  const lastTrade = formatFeedTime(quote?.last_trade_time);
  const segment = instrument.exchangeSegment || instrument.exchange;
  const buyPrice = bestAsk?.price;
  const sellPrice = bestBid?.price;

  return (
    <Portal>
      <div className="flex h-full w-full flex-col overflow-hidden rounded-aveon border border-aveon-border bg-aveon-panel text-aveon-text selection:bg-aveon-primary/20">

        {/* HEADER */}
        <div className="flex items-center justify-between gap-2 border-b border-aveon-border px-3 py-1.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <BarChart3 size={15} className="shrink-0 self-center text-aveon-primary" />
            <span className="truncate text-[11px] font-semibold">{instrumentDisplayName(instrument)}</span>
            <span className="self-center rounded bg-aveon-panel2 px-1.5 py-0.5 text-[10px] text-aveon-muted">{segment}</span>
            {ltp > 0 ? (
              <span className={`text-[14px] font-bold tabular-nums ${ltpTickColor} transition-colors duration-200`}>{formatCurrency(ltp)}</span>
            ) : (
              <span className="text-[14px] font-bold text-aveon-muted">—</span>
            )}
            {quote && (
              <span className={`text-[11px] font-semibold tabular-nums ${tone}`}>
                {quote.change >= 0 ? "+" : ""}{formatNumber(quote.change)} ({formatNumber(quote.change_percent)}%)
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              title={mouseTrading ? "Disable mouse trading" : "Enable mouse trading"}
              aria-pressed={mouseTrading}
              onClick={() => {
                const next = !mouseTrading;
                setMouseTrading(next);
                try { window.localStorage.setItem("aveon.marketDepth.mouseTrading.v1", String(next)); } catch {}
              }}
              className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${mouseTrading ? "bg-aveon-primary/20 text-aveon-primary" : "text-aveon-muted hover:bg-aveon-panel2 hover:text-aveon-text"}`}
            >
              <Mouse size={13} />
            </button>
            {onToggleLayout && !maximized && (
              <button
                type="button"
                title={layoutWide ? "Restore Market Watch" : "Maximize Market Watch"}
                aria-pressed={!!layoutWide}
                onClick={onToggleLayout}
                className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${layoutWide ? "bg-aveon-primary/20 text-aveon-primary" : "text-aveon-muted hover:bg-aveon-panel2 hover:text-aveon-text"}`}
              >
                {layoutWide ? <ChevronsRight size={13} /> : <ChevronsLeft size={13} />}
              </button>
            )}
            <button
              type="button"
              title={maximized ? "Restore" : "Open market depth in a window"}
              onClick={toggle}
              className="flex h-6 w-6 items-center justify-center rounded text-aveon-muted transition-colors hover:bg-aveon-panel2 hover:text-aveon-text"
            >
              {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          </div>
        </div>

        {/* STATS: Compact 2-Row Grid with Short Labels (OP, HG, LO, CL, IC, AVG, VOL) */}
        <div className="border-b border-aveon-border bg-aveon-panel/40 px-3 py-1.5 text-[11px]">
          <div className="grid grid-cols-4 gap-x-2 gap-y-1 text-center">
            <CompactStatCell label="OPEN" value={quote?.open ? formatNumber(quote.open) : undefined} />
            <CompactStatCell label="HIGH" value={quote?.high ? formatNumber(quote.high) : undefined} tone="buy" />
            <CompactStatCell label="LOW" value={quote?.low ? formatNumber(quote.low) : undefined} tone="sell" />
            <CompactStatCell label="CLOSE" title="Previous day's close" value={quote?.close ? formatNumber(quote.close) : undefined} />

            <CompactStatCell label="IND CL" title="Indicative Close Price (Tag 418)" value={quote?.indicative_close_price ? formatNumber(quote.indicative_close_price) : undefined} />
            <CompactStatCell label="AVG PR" value={depth?.avgTradedPrice ? formatNumber(depth.avgTradedPrice) : undefined} />
            <CompactStatCell label="VOLUME" title="Volume" value={quote?.volume ? formatNumber(quote.volume, 0) : undefined} colSpan={2} />
          </div>

          {(show52Week || showCircuit) && (
            <div className={`mt-1.5 grid gap-x-4 ${show52Week && showCircuit ? "grid-cols-2" : "grid-cols-1"}`}>
              {show52Week && depth && <RangeBar label="52W" low={depth.week52Low!} high={depth.week52High!} value={ltp} />}
              {showCircuit && circuitLow !== undefined && circuitHigh !== undefined && <RangeBar label="DPR" low={circuitLow} high={circuitHigh} value={ltp} />}
            </div>
          )}
        </div>

        {circuitHit && (
          <div className={`border-b border-aveon-border px-3 py-0.5 text-center text-[10px] font-semibold ${circuitHit === "Upper circuit" ? "bg-aveon-buy/10 text-aveon-buy" : "bg-aveon-sell/10 text-aveon-sell"}`}>
            {circuitHit} — the book can be one-sided
          </div>
        )}

        {/* TABLE HEADER */}
        {!isIndex && hasDepth && (
          <div className="grid select-none grid-cols-2 border-b border-aveon-border bg-aveon-panel/20 text-[10px] font-bold uppercase tracking-wider text-aveon-muted">
            <div className="grid grid-cols-[3rem_1fr_5rem] py-1 pl-3 pr-2">
              <span title="Number of buy orders at this price">Orders</span>
              <span className="text-right">Qty</span>
              <span className="text-right text-aveon-buy">Bid</span>
            </div>
            <div className="grid grid-cols-[5rem_1fr_3rem] border-l border-aveon-border/40 py-1 pl-2 pr-3">
              <span className="text-aveon-sell">Offer</span>
              <span className="text-right">Qty</span>
              <span className="text-right" title="Number of sell orders at this price">Orders</span>
            </div>
          </div>
        )}

        {/* DEPTH ROWS (Tighter py-1 to ensure all 5 rows fit perfectly without scrolling) */}
        <div className="flex-1 overflow-y-auto">
          {isIndex ? (
            <div className="p-8 text-center text-xs text-aveon-muted">Indices are non-tradable instruments. Bid/ask depth and order quantities are not applicable.</div>
          ) : hasDepth ? (
            <>
              <div className="divide-y divide-aveon-border/20">
                {rows.map(({ bid, ask }, index) => (
                  <div key={index} className={`grid grid-cols-2 text-[12px] tabular-nums tracking-tight ${index === 0 ? "bg-aveon-panel2/30" : ""}`}>
                    <div className="relative grid grid-cols-[3rem_1fr_5rem] items-center py-1 pl-3 pr-2">
                      {bid && <div aria-hidden className="absolute inset-y-0.5 right-0 rounded-l bg-aveon-buy/[0.14] transition-[width] duration-300" style={{ width: `${Math.max(3, (bid.quantity / maxQty) * 100)}%` }} />}
                      <span className="relative text-aveon-muted/80">{bid?.orders != null ? formatNumber(bid.orders, 0) : "—"}</span>
                      <span className="relative text-right">{bid ? formatNumber(bid.quantity, 0) : "—"}</span>
                      <button
                        type="button"
                        disabled={!mouseTrading || !bid || isIndex}
                        title={mouseTrading && bid ? `Left-click to prepare BUY LIMIT at ${bid.price}` : "Enable mouse trading to use price rows"}
                        onClick={() => bid && launchMouseOrder("BUY", bid.price)}
                        className={`relative text-right text-aveon-buy ${index === 0 ? "font-bold" : "font-medium"} ${mouseTrading && bid ? "cursor-pointer rounded hover:bg-aveon-buy/10" : "cursor-default"}`}
                      >
                        {bid ? formatNumber(bid.price) : "—"}
                      </button>
                    </div>
                    <div className="relative grid grid-cols-[5rem_1fr_3rem] items-center border-l border-aveon-border/40 py-1 pl-2 pr-3">
                      {ask && <div aria-hidden className="absolute inset-y-0.5 left-0 rounded-r bg-aveon-sell/[0.14] transition-[width] duration-300" style={{ width: `${Math.max(3, (ask.quantity / maxQty) * 100)}%` }} />}
                      <button
                        type="button"
                        disabled={!mouseTrading || !ask || isIndex}
                        title={mouseTrading && ask ? `Left-click to prepare SELL LIMIT at ${ask.price}` : "Enable mouse trading to use price rows"}
                        onClick={() => ask && launchMouseOrder("SELL", ask.price)}
                        onContextMenu={(event) => { if (!mouseTrading || !ask) return; event.preventDefault(); launchMouseOrder("SELL", ask.price); }}
                        className={`relative text-left text-aveon-sell ${index === 0 ? "font-bold" : "font-medium"} ${mouseTrading && ask ? "cursor-pointer rounded hover:bg-aveon-sell/10" : "cursor-default"}`}
                      >
                        {ask ? formatNumber(ask.price) : "—"}
                      </button>
                      <span className="relative text-right">{ask ? formatNumber(ask.quantity, 0) : "—"}</span>
                      <span className="relative text-right text-aveon-muted/80">{ask?.orders != null ? formatNumber(ask.orders, 0) : "—"}</span>
                    </div>
                  </div>
                ))}
              </div>

              {spread !== undefined && spread >= 0 && (
                <div className="border-y border-aveon-border/40 bg-aveon-panel/30 py-0.5 text-center text-[10px] font-medium text-aveon-muted tabular-nums">
                  Spread {formatCurrency(spread)}{spreadPct !== undefined ? ` (${formatNumber(spreadPct)}%)` : ""}
                </div>
              )}

              {/* TOTALS */}
              <div className="mt-1 space-y-1.5 border-b border-t border-aveon-border px-3 py-2 text-[12px]">
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[11px] text-aveon-muted">{exchangeTotals ? "Total buy qty" : "Top-5 buy qty"}</span>
                    <span className="text-[13px] font-bold text-aveon-buy">{formatNumber(totalBuy, 0)}</span>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[11px] text-aveon-muted">{exchangeTotals ? "Total sell qty" : "Top-5 sell qty"}</span>
                    <span className="text-[13px] font-bold text-aveon-sell">{formatNumber(totalSell, 0)}</span>
                  </div>
                </div>
                <div className="flex h-1 overflow-hidden rounded-full bg-aveon-panel2">
                  <div className="h-full bg-aveon-buy transition-all duration-300" style={{ width: `${buyerRatio}%` }} />
                  <div className="h-full bg-aveon-sell transition-all duration-300" style={{ width: `${100 - buyerRatio}%` }} />
                </div>
                <div className="flex justify-between text-[10px] font-semibold">
                  <span className="text-aveon-buy">{formatNumber(buyerRatio, 0)}% Buyers</span>
                  <span className="text-aveon-sell">{formatNumber(100 - buyerRatio, 0)}% Sellers</span>
                </div>
              </div>
            </>
          ) : depthReceived ? (
            <div className="select-none p-6 text-center text-xs text-aveon-muted">
              <p className="text-[12px] font-semibold text-aveon-text">No bids or offers right now</p>
              <p className="mt-0.5">The book is empty.</p>
            </div>
          ) : (
            <div className="select-none p-6 text-center text-xs text-aveon-muted">
              Waiting for Best-Five bid/ask updates from the broker feed.
            </div>
          )}
        </div>

        {/* FRESHNESS */}
        {(updated || lastTrade || connected !== undefined) && (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 border-t border-aveon-border px-3 py-1 text-[10px] text-aveon-muted tabular-nums">
            <span>
              {lastTrade && quote?.last_trade_quantity ? (
                <>Last <b className="font-semibold text-aveon-text">{formatNumber(quote.last_trade_quantity, 0)}</b> @ {lastTrade.time}</>
              ) : (
                "No trade yet"
              )}
            </span>
            <span className="flex items-center gap-1.5">
              {updated && <>Updated {updated.time}</>}
              {connected !== undefined && (
                <span className={`flex items-center gap-1 font-medium ${connected ? "text-aveon-buy" : "text-amber-500"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-aveon-buy" : "bg-amber-500"}`} />
                  {connected ? "Live" : "Offline"}
                </span>
              )}
            </span>
          </div>
        )}

        {/* ACTIONS */}
        <div className="grid grid-cols-2 gap-1.5 border-t border-aveon-border bg-aveon-panel2/20 p-2">
          <button
            type="button"
            disabled={isIndex}
            onClick={() => onTrade({ side: "BUY" })}
            className="rounded-md bg-aveon-buy px-2.5 py-1.5 text-[12px] font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            BUY{buyPrice ? <span className="ml-1 text-[10px] font-semibold opacity-90">{formatNumber(buyPrice)}</span> : null}
          </button>
          <button
            type="button"
            disabled={isIndex}
            onClick={() => onTrade({ side: "SELL" })}
            className="rounded-md bg-aveon-sell px-2.5 py-1.5 text-[12px] font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            SELL{sellPrice ? <span className="ml-1 text-[10px] font-semibold opacity-90">{formatNumber(sellPrice)}</span> : null}
          </button>
        </div>
      </div>
    </Portal>
  );
}

function CompactStatCell({ label, value, tone, title, colSpan = 1 }: { label: string; value?: string; tone?: "buy" | "sell"; title?: string; colSpan?: number }) {
  const toneClass = value ? (tone === "buy" ? "text-aveon-buy" : tone === "sell" ? "text-aveon-sell" : "text-aveon-text") : "text-aveon-muted";
  return (
    <div title={title} className={`flex flex-col rounded bg-aveon-panel2/40 px-1 py-0.5 ${colSpan > 1 ? `col-span-${colSpan}` : ""}`}>
      <span className="text-[9px] font-semibold uppercase text-aveon-muted">{label}</span>
      <span className={`tabular-nums font-semibold text-[11px] ${toneClass}`}>{value ?? "—"}</span>
    </div>
  );
}

function RangeBar({ label, low, high, value }: { label: string; low: number; high: number; value: number }) {
  const pct = value > 0 ? Math.min(100, Math.max(0, ((value - low) / (high - low)) * 100)) : undefined;
  return (
    <div className="flex items-center gap-2 text-[10px] tabular-nums">
      <span className="w-7 shrink-0 text-aveon-muted">{label}</span>
      <span className="shrink-0 font-medium text-aveon-sell">{formatNumber(low)}</span>
      <div className="relative h-1 flex-1 rounded-full bg-aveon-panel2">
        {pct !== undefined && (
          <span className="absolute top-1/2 h-2.5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-aveon-primary" style={{ left: `${pct}%` }} />
        )}
      </div>
      <span className="shrink-0 font-medium text-aveon-buy">{formatNumber(high)}</span>
    </div>
  );
}