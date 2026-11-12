"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { X } from "lucide-react";
import MarketDepth from "@/components/market/MarketDepth";
import PositionsPage from "@/app/(app)/positions/page";
import OrdersPage from "@/app/(app)/orders/page";
import HoldingsPage from "@/app/(app)/holdings/page";
import { Badge, Card, EmptyState, Input } from "@/components/ui/Primitives";
import { LIVE_TRADES, usePolledData } from "@/hooks/usePolledData";
import { tradeBookPath } from "@/lib/endpoints";
import { formatCurrency } from "@/lib/format";
import { useLiveOrderStore } from "@/lib/liveOrderStore";
import { displayProductType, extractList, normalizeTrade, orderDisplaySymbol, tradeOrderDisplayId, type Instrument, type WatchlistQuote, type RawTradeModel } from "@/types/trading";

export type TradingShortcutPanel = "ORDER_BOOK" | "MARKET_DEPTH" | "TRADE_BOOK" | "NET_POSITION" | "HOLDINGS";

const PANEL_META: Record<TradingShortcutPanel, { title: string }> = {
  ORDER_BOOK: { title: "Order Book" },
  MARKET_DEPTH: { title: "Market Depth" },
  TRADE_BOOK: { title: "Trade Book" },
  NET_POSITION: { title: "Net Position" },
  HOLDINGS: { title: "Holdings" },
};

function formatTradeTime(value?: string): string {
  if (!value) return "—";
  let raw = String(value).trim().replace(/(\d{2})\.(\d{2})\.(\d{2})$/, "$1:$2:$3");
  const named = raw.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})\s+(.*)$/);
  if (named) {
    const months: Record<string, string> = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };
    const month = months[named[2].toUpperCase()];
    if (month) raw = `${named[3]}-${month}-${named[1]}T${named[4]}`;
  } else {
    raw = raw.replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleString([], { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export default function TradingShortcutModal({
  panel, instrument, quote, onClose, onTrade,
}: {
  panel: TradingShortcutPanel | null;
  instrument: Instrument | null;
  quote?: WatchlistQuote;
  onClose: () => void;
  onTrade: (request?: { side: "BUY" | "SELL"; price?: number; quantity?: number; productType?: "CNC" | "MIS" | "NRML"; orderKind?: "LIMIT" }) => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (panel) closeButtonRef.current?.focus();
  }, [panel]);
  useEffect(() => {
    if (!panel) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [panel, onClose]);

  if (!panel) return null;
  const meta = PANEL_META[panel];
  const isDepth = panel === "MARKET_DEPTH";

  return (
    <div className="fixed inset-0 z-[2147483646] flex items-center justify-center bg-black/65 p-3 md:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={meta.title} className={`flex h-[min(88vh,900px)] w-full ${isDepth ? "max-w-4xl h-[min(82vh,780px)]" : "max-w-[1500px]"} min-w-0 flex-col overflow-hidden rounded-lg border border-aveon-border bg-aveon-panel shadow-2xl`}>
        <header className="flex h-11 shrink-0 items-center justify-between border-b border-aveon-border px-4">
          <div className="text-sm font-semibold">{meta.title}{instrument ? <span className="ml-2 font-normal text-aveon-muted">— {instrument.tradingSymbol || instrument.symbol}</span> : null}</div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label={`Close ${meta.title}`} title="Close (Esc)" className="rounded p-1.5 text-aveon-muted hover:bg-aveon-panel2 hover:text-aveon-text"><X size={16}/></button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {panel === "MARKET_DEPTH" && <MarketDepth instrument={instrument} quote={quote} onTrade={onTrade}/>}
          {panel === "ORDER_BOOK" && <OrdersPage />}
          {panel === "TRADE_BOOK" && <InlineTradeBookView />}
          {panel === "NET_POSITION" && <PositionsPage />}
          {panel === "HOLDINGS" && <HoldingsPage />}
        </div>
        <footer className="shrink-0 border-t border-aveon-border px-4 py-1.5 text-[10px] text-aveon-muted">Press Esc or select × to close.</footer>
      </section>
    </div>
  );
}

function InlineTradeBookView() {
  const [query, setQuery] = useState("");
  const { trades: liveTrades, allOrders: liveAllOrders } = useLiveOrderStore();
  const tradesQuery = usePolledData<RawTradeModel[]>(tradeBookPath(1, 100), 20_000, true, LIVE_TRADES);


  const tradeRows = useMemo(() => {
    return liveTrades.length > 0 ? liveTrades : extractList<RawTradeModel>(tradesQuery.data, ["trades", "tradeBook", "trade_book", "items", "records"]).map(normalizeTrade);
  }, [liveTrades, tradesQuery.data]);

  const filteredTrades = useMemo(() => {
    const text = query.trim().toUpperCase();
    return tradeRows.filter((t) => !text || [t.trading_symbol, t.order_id, t.trade_id, t.exchange].some((v) => String(v ?? "").toUpperCase().includes(text)));
  }, [tradeRows, query]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Trade Book</h1>
          <p className="text-xs text-aveon-muted">Executed trade fills.</p>
        </div>
      </div>
      <Card className="p-3">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search symbol, trade ID or order ID" />
      </Card>
      <Card className="overflow-x-auto p-0">
        {tradesQuery.loading && !tradeRows.length ? (
          <p className="p-6 text-xs text-aveon-muted">Loading trades…</p>
        ) : !filteredTrades.length ? (
          <EmptyState title="No trades found" subtitle="Executed trade fills will appear here." />
        ) : (
          <table className="w-full min-w-[1050px] text-xs">
            <thead className="border-b border-aveon-border text-left text-aveon-muted">
              <tr>
                {["Trade Time", "Symbol", "Side", "Product", "Exec Qty", "Exec Price", "Type", "Trade ID", "Order ID"].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredTrades.map((t, i) => (
                <tr key={t.trade_id || i} className="table-row-hover border-b border-aveon-border/40">
                  <td className="px-3 py-2 text-[10px] text-aveon-muted">{formatTradeTime(t.trade_timestamp)}</td>
                  <td className="px-3 py-2 font-medium">{orderDisplaySymbol(t) || "—"}</td>
                  <td className="px-3 py-2"><Badge tone={t.transaction_type === "BUY" ? "buy" : "sell"}>{t.transaction_type}</Badge></td>
                  <td className="px-3 py-2">{displayProductType(t.product_type || "", t.exchange)}</td>
                  <td className="px-3 py-2 text-right">{t.quantity}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(t.price)}</td>
                  <td className="px-3 py-2">{t.order_type || "—"}</td>
                  <td className="px-3 py-2 font-mono text-[10px]">{t.trade_id || "—"}</td>
                  <td className="px-3 py-2 font-mono text-[10px]">{tradeOrderDisplayId(t, liveAllOrders) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}