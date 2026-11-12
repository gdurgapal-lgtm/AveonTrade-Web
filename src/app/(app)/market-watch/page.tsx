"use client";

import { useEffect, useState } from "react";
import WatchlistSidebar from "@/components/market/WatchlistSidebar";
import dynamic from "next/dynamic";

const ChartViewPanel = dynamic(() => import("@/components/market/ChartViewPanel"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-aveon-panel text-xs text-aveon-muted">
      Loading Terminal Workspace...
    </div>
  ),
});
import MarketDepth from "@/components/market/MarketDepth";
import OrderTicketModal from "@/components/market/OrderTicketModal";
import BottomPanel from "@/components/market/BottomPanel";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useMarketStream } from "@/hooks/useMarketStream";
import { exchangeSegmentFor, feedToken, normalizeInstrument, isIndexInstrument, type Instrument, type ProductType, type TransactionType, type OrderKind } from "@/types/trading";
import { type Candle } from "@/components/market/PriceChart";
import { Expand, LayoutGrid, Columns2 } from "lucide-react";
import SymbolSearch from "@/components/market/SymbolSearch";
import SymbolSearchModal from "@/components/market/SymbolSearchModal";
import PriceAlertDialog from "@/components/market/PriceAlertDialog";
import MarketWatchGrid from "@/components/market/MarketWatchGrid";
import TradingShortcutModal, { type TradingShortcutPanel } from "@/components/market/TradingShortcutModal";

const RANGES = [
  { label: "1D", days: 1 },
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
];

const TIMEFRAMES = [
  "1m", "2m", "3m", "5m", "10m", "15m", "30m", "45m", "1h", "2h", "4h", "D", "W", "M"
];
const CHART_TIMEFRAME_STORAGE_KEY = "aveontrade.chart.timeframe.v1";
const CHART_RANGE_STORAGE_KEY = "aveontrade.chart.range.v1";

function readSavedTimeframe() {
  if (typeof window === "undefined") return "5m";
  const saved = window.localStorage.getItem(CHART_TIMEFRAME_STORAGE_KEY) ?? "";
  return TIMEFRAMES.includes(saved) ? saved : "5m";
}

function readSavedRange() {
  if (typeof window === "undefined") return 2;
  const saved = Number(window.localStorage.getItem(CHART_RANGE_STORAGE_KEY));
  return Number.isInteger(saved) && saved >= 0 && saved < RANGES.length ? saved : 2;
}

function instrumentKey(item: Instrument) {
  return `${exchangeSegmentFor(item) || item.exchange || ""}:${item.token || ""}:${item.tradingSymbol || item.symbol || ""}`;
}

export default function MarketWatchPage() {
  const { activeId: workspaceId } = useWorkspace();
  const { groups, active, activeId, setActiveId, addGroup, renameGroup, removeGroup, addItem, removeItem } = useWatchlist(workspaceId);
  const [selected, setSelected] = useState<Instrument | null>(null);
  const [fullGridSelected, setFullGridSelected] = useState<Instrument | null>(null);
  const [rangeIdx, setRangeIdx] = useState(readSavedRange);
  const [timeframe, setTimeframe] = useState<string>(readSavedTimeframe);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartMessage, setChartMessage] = useState<string | null>(null);
  const [orderEntryOpen, setOrderEntryOpen] = useState(false);
  const [depthOrder, setDepthOrder] = useState<{ side: TransactionType; price?: number; quantity?: number; productType?: ProductType; orderKind?: OrderKind } | null>(null);
  const [maximized, setMaximized] = useState(false);
  const [fullMarketWatch, setFullMarketWatch] = useState(false);
  const [cashPair, setCashPair] = useState<Instrument[]>([]);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertInstrument, setAlertInstrument] = useState<Instrument | null>(null);
  const [shortcutPanel, setShortcutPanel] = useState<TradingShortcutPanel | null>(null);

  useEffect(() => {
    try { window.localStorage.setItem(CHART_TIMEFRAME_STORAGE_KEY, timeframe); } catch {}
  }, [timeframe]);

  useEffect(() => {
    try { window.localStorage.setItem(CHART_RANGE_STORAGE_KEY, String(rangeIdx)); } catch {}
  }, [rangeIdx]);

  const activeSelected = fullMarketWatch ? fullGridSelected : selected;
  const streamSelected = fullMarketWatch ? null : selected;

  // Strictly pass cashPair ONLY when Order Entry modal is open so Market Watch & Market Depth never subscribe to opposite exchange tokens
  const activeCashPair = orderEntryOpen ? cashPair : [];
  const { quotes, quotesByToken, connected, lastError } = useMarketStream(active?.items ?? [], streamSelected, activeCashPair);

  useEffect(() => {
    const openOrderEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ instrument?: Instrument; side?: TransactionType; price?: number; quantity?: number; productType?: ProductType; orderKind?: OrderKind }>).detail;
      if (!detail?.instrument) return;
      if (fullMarketWatch) setFullGridSelected(detail.instrument);
      else setSelected(detail.instrument);
      setDepthOrder(detail.side ? { side: detail.side, price: detail.price, quantity: detail.quantity, productType: detail.productType, orderKind: detail.orderKind } : null);
      setOrderEntryOpen(true);
    };
    window.addEventListener("aveon:open-order-entry", openOrderEvent);
    return () => window.removeEventListener("aveon:open-order-entry", openOrderEvent);
  }, [fullMarketWatch]);

  useEffect(() => {
    const handleHotkeys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (event.key === "Escape") {
        if (shortcutPanel) { event.preventDefault(); setShortcutPanel(null); return; }
        if (orderEntryOpen) { event.preventDefault(); setOrderEntryOpen(false); setDepthOrder(null); return; }
        if (searchModalOpen) { event.preventDefault(); setSearchModalOpen(false); return; }
        if (fullMarketWatch) { event.preventDefault(); setFullMarketWatch(false); return; }
      }
      if (event.ctrlKey && event.key.toLowerCase() === "s") {
        event.preventDefault(); 
        document.querySelector<HTMLInputElement>('[data-aveon-symbol-search="true"]')?.focus(); 
        return;
      }
      if (typing || event.altKey || event.ctrlKey || event.metaKey) return;
      const key = event.key;
      const targetInst = fullMarketWatch ? fullGridSelected : selected;
      if (key === "F1" || key === "+" || key === "=") { event.preventDefault(); if (targetInst && !isIndexInstrument(targetInst)) { setDepthOrder({ side: "BUY" }); setOrderEntryOpen(true); } }
      else if (key === "F2" || key === "-") { event.preventDefault(); if (targetInst && !isIndexInstrument(targetInst)) { setDepthOrder({ side: "SELL" }); setOrderEntryOpen(true); } }
      else if (key === "F3") { event.preventDefault(); setShortcutPanel("ORDER_BOOK"); }
      else if (key === "F5") { event.preventDefault(); setShortcutPanel("MARKET_DEPTH"); }
      else if (key === "F6") { event.preventDefault(); setShortcutPanel("NET_POSITION"); }
      else if (key === "F7") { event.preventDefault(); setShortcutPanel("HOLDINGS"); } 
      else if (key === "F8") { event.preventDefault(); setShortcutPanel("TRADE_BOOK"); }
    };
    window.addEventListener("keydown", handleHotkeys);
    return () => window.removeEventListener("keydown", handleHotkeys);
  }, [selected, fullGridSelected, shortcutPanel, orderEntryOpen, searchModalOpen, fullMarketWatch]);

  const selectedKey = selected ? instrumentKey(selected) : "";
  const activeSelectedKey = activeSelected ? instrumentKey(activeSelected) : "";

  useEffect(() => {
    setSelected(null);
    setFullGridSelected(null);
    setCandles([]);
    setChartMessage(null);
  }, [workspaceId]);

  useEffect(() => {
    if (active && active.items && active.items.length > 0) {
      const currentExists = selected && active.items.some((item) => instrumentKey(item) === instrumentKey(selected));
      if (!currentExists) {
        setSelected(active.items[0]);
      }

      const fullGridExists = fullGridSelected && active.items.some((item) => instrumentKey(item) === instrumentKey(fullGridSelected));
      if (!fullGridExists) {
        setFullGridSelected(active.items[0]);
      }
    } else {
      if (selected !== null) setSelected(null);
      if (fullGridSelected !== null) setFullGridSelected(null);
      setCandles([]);
    }
    // Only run when the watchlist group or its items array updates so newly selected items aren't overwritten
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, active?.items]);

  function handleSelectFromSearch(instrument: Instrument) {
    addItem(activeId, instrument);
    setSelected(instrument);
    setFullGridSelected(instrument);

    // Shift focus away from search input and focus/scroll the newly added row in Market Watch
    const rowId = `${exchangeSegmentFor(instrument)}:${instrument.token}:${instrument.tradingSymbol || instrument.symbol}`;
    setTimeout(() => {
      document.querySelector<HTMLInputElement>('[data-aveon-symbol-search="true"]')?.blur();
      const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-aveon-instrument-row]"));
      const row = rows.find((el) => el.dataset.aveonInstrumentRow === rowId);
      if (row) {
        row.scrollIntoView({ block: "nearest", behavior: "smooth" });
        row.focus({ preventScroll: true });
      }
    }, 50);
  }

  // STRICT RULE 1 & 2: Only resolve and subscribe to the pair exchange when Order Entry (orderEntryOpen) is open!
  useEffect(() => {
    if (!orderEntryOpen || !activeSelected || !activeSelected.token) {
      setCashPair([]);
      return;
    }

    const segment = exchangeSegmentFor(activeSelected).toUpperCase();
    const isCash = segment === "NSE_EQ" || segment === "BSE_EQ";
    if (!isCash) {
      setCashPair([activeSelected]);
      return;
    }

    let cancelled = false;
    const symbolQuery = (activeSelected.symbol || activeSelected.tradingSymbol || "").trim();
    const oppositeSegment = segment === "NSE_EQ" ? "BSE_EQ" : "NSE_EQ";
    const expectedMktSegId = oppositeSegment === "NSE_EQ" ? 1 : 3;

    // Immediately set the selected instrument so OE has it while the pair lookup runs
    setCashPair([activeSelected]);

    (async () => {
      try {
        const response = await fetch(`/api/broker/scrip-lookup?q=${encodeURIComponent(symbolQuery)}`, { credentials: "include" });
        const json = await response.json();
        const hits = json?.data?.result?.hits?.hits ?? json?.data?.hits?.hits ?? [];
        const hitsArray = Array.isArray(hits) ? hits : [hits];

        // Strictly match opposite exchange by ISIN (if available) or exact symbol + ExchangeSegment
        const targetSym = symbolQuery.toUpperCase();
        const matchedOppositeHit = hitsArray.find((h: any) => {
          const source = h?._source || h;
          if (!source) return false;
          const hitSegment = String(source.ExchangeSegment || "").toUpperCase();
          const hitMktSegId = Number(source.MktSegId ?? source.nMarketSegmentId ?? 0);
          const isOppositeExchange = hitSegment === oppositeSegment || hitMktSegId === expectedMktSegId;
          if (!isOppositeExchange) return false;

          if (activeSelected.isin && source.sISINCode) {
            return String(source.sISINCode).trim().toUpperCase() === activeSelected.isin.trim().toUpperCase();
          }
          const hitSym = String(source.sSymbolnew || source.sSymbol || "").trim().toUpperCase();
          return hitSym === targetSym;
        });

        if (cancelled) return;

        if (matchedOppositeHit) {
          const oppositeInst = normalizeInstrument((matchedOppositeHit._source || matchedOppositeHit) as Record<string, unknown>);
          setCashPair([activeSelected, oppositeInst]);
        } else {
          setCashPair([activeSelected]);
        }
      } catch {
        if (!cancelled) setCashPair([activeSelected]);
      }
    })();

    return () => { cancelled = true; };
  }, [activeSelectedKey, orderEntryOpen]);

  const baseInterval = ["d", "w", "m"].includes(timeframe.toLowerCase()) ? "DAY" : "MIN";

  useEffect(() => {
    if (fullMarketWatch) return;
    if (!selected || !selected.token) {
      setCandles([]);
      setChartMessage("Select a symbol from your watchlist to display chart metrics.");
      setChartLoading(false);
      return;
    }

    let cancelled = false;
    setChartLoading(true);
    setChartMessage(null);

    (async () => {
      const segment = exchangeSegmentFor(selected) || selected.exchange || "NSE_EQ";
      const token = selected.token;
      const selectedRange = RANGES[rangeIdx] ?? RANGES[2];

      try {
        let countBack = "1500";
        const apiInterval = baseInterval;

        if (apiInterval === "DAY") {
          const minDays = Math.max(selectedRange.days, 365 * 2);
          countBack = String(Math.max(1500, Math.min(3650, minDays)));
        } else {
          const minIntradayDays = Math.max(selectedRange.days, 30);
          countBack = String(Math.max(10000, Math.min(12000, minIntradayDays * 375)));
        }

        const historyDays = apiInterval === "DAY"
          ? Math.max(selectedRange.days, 365 * 2)
          : Math.max(60, Math.min(selectedRange.days, 45));
        const proxyUrl =
          `/api/broker/chart-history?exchangeSegment=${encodeURIComponent(segment)}` +
          `&token=${encodeURIComponent(token)}` +
          `&interval=${apiInterval}` +
          `&days=${historyDays}` +
          `&countBack=${countBack}`;

        const res = await fetch(proxyUrl, { credentials: "include" });
        const json = await res.json();

        if (cancelled) return;

        if (json && Array.isArray(json.data) && json.data.length > 0) {
          setCandles(json.data);
          setChartMessage(null);
        } else {
          setCandles([]);
          setChartMessage("No history records found inside your broker data payload.");
        }
      } catch (err) {
        if (cancelled) return;
        console.error("[Chart API] Token lookup route fetch failed:", err);
        setCandles([]);
        setChartMessage("Broker chart data gateway connection offline.");
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedKey, rangeIdx, baseInterval, fullMarketWatch]);

  function openAlert(instrument: Instrument | null) {
    if (!instrument) return;
    setAlertInstrument(instrument);
    setAlertOpen(true);
  }

  const selectedQuote = activeSelected ? quotesByToken[feedToken(activeSelected) ?? ""] : undefined;

  return (
    <div className={`${maximized ? "fixed inset-0 z-50 h-screen bg-aveon-bg" : "-m-6 h-[calc(100%+3rem)]"} flex min-w-0 flex-col overflow-hidden`}>
      {/* Top Symbol Search Bar */}
      <div className="shrink-0 border-b border-aveon-border bg-aveon-panel px-2 py-2">
        <div className="mx-auto flex w-full max-w-[760px] items-center gap-2">
          <div className="min-w-0 flex-1">
            <SymbolSearch
              onSelect={handleSelectFromSearch}
              isAdded={(instrument) => (active?.items ?? []).some((item: Instrument) =>
                `${exchangeSegmentFor(item)}:${item.token}:${item.tradingSymbol || item.symbol}` ===
                `${exchangeSegmentFor(instrument)}:${instrument.token}:${instrument.tradingSymbol || instrument.symbol}`
              )}
            />
          </div>
          <button
            type="button"
            onClick={() => setFullMarketWatch((v) => !v)}
            className={`flex items-center gap-1.5 h-9 shrink-0 rounded-md border px-3 text-xs font-semibold transition-all ${
              fullMarketWatch
                ? "border-aveon-primary bg-aveon-primary text-white shadow"
                : "border-aveon-border bg-aveon-panel2 text-aveon-text hover:bg-aveon-primary/10 hover:text-aveon-primary"
            }`}
          >
            {fullMarketWatch ? <Columns2 size={14} /> : <LayoutGrid size={14} />}
            <span>{fullMarketWatch ? "Split View" : "Full Market Watch"}</span>
          </button>
          <button
            type="button"
            title="Advanced search"
            onClick={() => setSearchModalOpen(true)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-aveon-border text-aveon-muted hover:bg-aveon-panel2 hover:text-aveon-text"
          >
            <Expand size={15} />
          </button>
        </div>
        <SymbolSearchModal
          open={searchModalOpen}
          onClose={() => setSearchModalOpen(false)}
          onSelect={(instrument) => {
            handleSelectFromSearch(instrument);
            setSearchModalOpen(false);
          }}
          isAdded={(instrument) => (active?.items ?? []).some((item: Instrument) =>
            `${exchangeSegmentFor(item)}:${item.token}:${item.tradingSymbol || item.symbol}` ===
            `${exchangeSegmentFor(instrument)}:${instrument.token}:${instrument.tradingSymbol || instrument.symbol}`
          )}
        />
      </div>

      {/* Workspace Area */}
      {fullMarketWatch ? (
        <div className="flex min-h-0 min-w-0 flex-1 p-2">
          <MarketWatchGrid
            instruments={active?.items ?? []}
            quotesByToken={quotesByToken}
            selected={fullGridSelected}
            onSelect={setFullGridSelected}
            onClose={() => setFullMarketWatch(false)}
            activeId={activeId}
            setActiveId={setActiveId}
            onRemove={(instrument) => removeItem(activeId, instrument)}
            onCreateAlert={openAlert}
            onTrade={(instrument, side = "BUY") => {
              if (isIndexInstrument(instrument)) { window.alert("Indices Instrument are non tradable"); return; }
              setFullGridSelected(instrument);
              setDepthOrder({ side });
              setOrderEntryOpen(true);
            }}
          />
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 gap-2 p-2">
          <WatchlistSidebar
            groups={groups} active={active} activeId={activeId} setActiveId={setActiveId}
            addGroup={addGroup} renameGroup={renameGroup} removeGroup={removeGroup} addItem={addItem} removeItem={removeItem}
            selected={selected} setSelected={setSelected} quotesByToken={quotesByToken} connected={Boolean(connected)} lastError={lastError}
            onCreateAlert={openAlert}
          />

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
            <div className="flex min-h-0 min-w-0 flex-1 gap-2">
              <ChartViewPanel
                selected={selected} quotes={quotes} ranges={RANGES} rangeIdx={rangeIdx} setRangeIdx={setRangeIdx}
                onCreateAlert={() => openAlert(selected)}
                selectedQuote={selected ? quotesByToken[feedToken(selected) ?? ""] : undefined}
                timeframes={TIMEFRAMES} timeframe={timeframe} setTimeframe={setTimeframe}
                candles={candles} chartLoading={chartLoading} chartMessage={chartMessage}
              />
              <div className={`${maximized ? "w-[34rem]" : "w-[26rem]"} relative shrink-0 rounded-aveon border border-aveon-border bg-aveon-panel`}>
              <MarketDepth 
                instrument={selected} 
                connected={Boolean(connected)} 
                layoutWide={maximized} 
                onToggleLayout={() => setMaximized((value) => !value)} 
                quote={selected ? quotesByToken[feedToken(selected) ?? ""] : undefined} 
                onTrade={(request) => { 
                  if (isIndexInstrument(selected)) { 
                    window.alert("Indices Instrument are non tradable"); 
                    return; 
                  } 
                  setDepthOrder(request ? { side: request.side, price: request.price, quantity: request.quantity, productType: request.productType, orderKind: request.orderKind } : null); 
                  setOrderEntryOpen(true); 
                }} 
              />
            </div>
            </div>
            {!maximized && BottomPanel && <BottomPanel />}
          </div>
        </div>
      )}

      <OrderTicketModal
        open={orderEntryOpen}
        instrument={activeSelected}
        cashOptions={activeCashPair}
        quotes={quotes}
        onClose={() => { setOrderEntryOpen(false); setDepthOrder(null); }}
        initialSide={depthOrder?.side ?? "BUY"}
        initialProductType={depthOrder?.productType}
        initialQuantity={depthOrder?.quantity}
        initialPrice={depthOrder?.price}
        initialOrderKind={depthOrder?.orderKind}
      />
      <TradingShortcutModal
        panel={shortcutPanel}
        instrument={activeSelected}
        quote={selectedQuote}
        onClose={() => setShortcutPanel(null)}
        onTrade={(request) => { if (isIndexInstrument(activeSelected)) { window.alert("Indices are not-tradable"); return; } setDepthOrder(request ? { side: request.side, price: request.price, quantity: request.quantity, productType: request.productType, orderKind: request.orderKind } : null); setOrderEntryOpen(true); }}
      />
      <PriceAlertDialog
        open={alertOpen}
        instrument={alertInstrument}
        currentPrice={selectedQuote?.ltp ?? 0}
        onClose={() => setAlertOpen(false)}
      />
    </div>
  );
}