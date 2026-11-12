"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MarketWatchGrid from "@/components/market/MarketWatchGrid";
import SymbolSearch from "@/components/market/SymbolSearch";
import SymbolSearchModal from "@/components/market/SymbolSearchModal";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useMarketStream } from "@/hooks/useMarketStream";
import { exchangeSegmentFor, isIndexInstrument, type Instrument, type ProductType, type TransactionType, type OrderKind } from "@/types/trading";
import OrderTicketModal from "@/components/market/OrderTicketModal";
import TradingShortcutModal, { type TradingShortcutPanel } from "@/components/market/TradingShortcutModal";
import { Expand, FolderKanban, ArrowLeft, Plus } from "lucide-react";

export default function FullWorkspaceTerminalPage() {
  const router = useRouter();
  const { activeId: workspaceId } = useWorkspace();
  const { groups, active, activeId, setActiveId, addItem, removeItem } = useWatchlist(workspaceId);
  const [selected, setSelected] = useState<Instrument | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderRequest, setOrderRequest] = useState<{side: TransactionType; price?: number; quantity?: number; productType?: ProductType; orderKind?: OrderKind} | null>(null);
  const [panel, setPanel] = useState<TradingShortcutPanel | null>(null);
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  const instruments = active?.items ?? [];
  const { quotes, quotesByToken } = useMarketStream(instruments, selected);

  // Keyboard navigation & institutional terminal hotkeys
  useEffect(() => {
    const hotkeys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      
      if (event.key === "Escape") { 
        if (orderOpen) { event.preventDefault(); setOrderOpen(false); setOrderRequest(null); return; } 
        if (panel) { event.preventDefault(); setPanel(null); return; } 
        if (searchModalOpen) { event.preventDefault(); setSearchModalOpen(false); return; }
      }
      if (event.ctrlKey && event.key.toLowerCase() === "s") { 
        event.preventDefault(); 
        document.querySelector<HTMLInputElement>('[data-aveon-symbol-search="true"]')?.focus(); 
        return; 
      }
      if (typing || event.altKey || event.ctrlKey || event.metaKey) return;

      if (event.key === "F1" || event.key === "+" || event.key === "=") { 
        event.preventDefault(); 
        if (selected && !isIndexInstrument(selected)) { setOrderRequest({ side: "BUY" }); setOrderOpen(true); } 
      }
      else if (event.key === "F2" || event.key === "-") { 
        event.preventDefault(); 
        if (selected && !isIndexInstrument(selected)) { setOrderRequest({ side: "SELL" }); setOrderOpen(true); } 
      }
      else if (event.key === "F3") { event.preventDefault(); setPanel("ORDER_BOOK"); }
      else if (event.key === "F5") { event.preventDefault(); setPanel("MARKET_DEPTH"); }
      else if (event.key === "F6") { event.preventDefault(); setPanel("NET_POSITION"); }
      else if (event.key === "F8") { event.preventDefault(); setPanel("TRADE_BOOK"); }
      else if (event.key === "Delete" && selected) {
        event.preventDefault();
        removeItem(activeId, selected);
      }
    };
    window.addEventListener("keydown", hotkeys); 
    return () => window.removeEventListener("keydown", hotkeys);
  }, [selected, orderOpen, panel, searchModalOpen, activeId, removeItem]);

  return (
    <div className="-m-6 flex h-[calc(100%+3rem)] min-h-0 min-w-0 flex-col overflow-hidden bg-aveon-bg text-aveon-text">
      {/* Top Terminal Toolbar: Watchlist Selector + Symbol Search + Advanced Modal + Back Button */}
      <div className="shrink-0 border-b border-aveon-border bg-aveon-panel px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          {/* Watchlist Group Dropdown */}
          <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-aveon-primary text-xs">
            <FolderKanban size={15} />
            <span>Watchlist:</span>
          </div>
          <select
            aria-label="Select watchlist group"
            value={activeId}
            onChange={(e) => setActiveId(e.target.value)}
            className="h-8 rounded border border-aveon-border bg-aveon-panel2 px-2 text-xs font-semibold text-aveon-text outline-none focus:border-aveon-primary"
          >
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name} ({group.items.length})
              </option>
            ))}
          </select>

          <span className="h-4 border-l border-aveon-border" />

          {/* Symbol Search Bar (Ctrl+S focused) */}
          <div className="min-w-0 flex-1 max-w-xl">
            <SymbolSearch
              onSelect={(instrument) => { addItem(activeId, instrument); setSelected(instrument); }}
              isAdded={(instrument) => instruments.some((item: Instrument) => `${exchangeSegmentFor(item)}:${item.token}:${item.tradingSymbol || item.symbol}` === `${exchangeSegmentFor(instrument)}:${instrument.token}:${instrument.tradingSymbol || instrument.symbol}`)}
            />
          </div>

          {/* Advanced Search Modal Trigger */}
          <button
            type="button"
            title="Advanced Search Modal"
            onClick={() => setSearchModalOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded border border-aveon-border bg-aveon-panel2 text-aveon-muted hover:bg-aveon-panel hover:text-aveon-text"
          >
            <Expand size={14} />
          </button>

          {/* Return to Chart Workspace */}
          <button
            type="button"
            onClick={() => router.push("/market-watch")}
            className="flex items-center gap-1.5 h-8 rounded border border-aveon-border bg-aveon-panel2 px-3 text-xs font-semibold text-aveon-text hover:bg-aveon-primary/10 hover:text-aveon-primary"
          >
            <ArrowLeft size={14} />
            <span>Back to Charts</span>
          </button>
        </div>
      </div>

      {/* Full-Workspace Market Watch Grid */}
      <div className="min-h-0 min-w-0 flex-1 p-2">
        <MarketWatchGrid
          embedded
          instruments={instruments}
          quotesByToken={quotesByToken}
          selected={selected}
          onSelect={setSelected}
          onClose={() => router.push("/market-watch")}
          onTrade={(instrument, side = "BUY") => {
            if (isIndexInstrument(instrument)) { window.alert("Indices are non-tradable"); return; }
            setSelected(instrument); 
            setOrderRequest({ side }); 
            setOrderOpen(true);
          }}
        />
      </div>

      {/* Advanced Symbol Search Modal */}
      <SymbolSearchModal
        open={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        onSelect={(instrument) => {
          addItem(activeId, instrument);
          setSelected(instrument);
        }}
        isAdded={(instrument) => instruments.some((item: Instrument) =>
          `${exchangeSegmentFor(item)}:${item.token}:${item.tradingSymbol || item.symbol}` ===
          `${exchangeSegmentFor(instrument)}:${instrument.token}:${instrument.tradingSymbol || instrument.symbol}`
        )}
      />

      {/* Popup Order Ticket Modal */}
      <OrderTicketModal
        open={orderOpen}
        instrument={selected}
        cashOptions={[]}
        quotes={quotes}
        onClose={() => { setOrderOpen(false); setOrderRequest(null); }}
        initialSide={orderRequest?.side ?? "BUY"}
        initialProductType={orderRequest?.productType}
        initialQuantity={orderRequest?.quantity}
        initialPrice={orderRequest?.price}
        initialOrderKind={orderRequest?.orderKind}
      />

      {/* Popup Trading Shortcut Panels (F3 Orders, F5 Depth, F6 Positions, F8 Trades) */}
      <TradingShortcutModal
        panel={panel}
        instrument={selected}
        quote={selected ? quotes[selected.tradingSymbol] || quotes[selected.symbol] : undefined}
        onClose={() => setPanel(null)}
        onTrade={(request) => {
          if (isIndexInstrument(selected)) { window.alert("Indices are non-tradable"); return; }
          setOrderRequest(request ? { side: request.side, price: request.price, quantity: request.quantity, productType: request.productType, orderKind: request.orderKind } : null);
          setOrderOpen(true);
        }}
      />
    </div>
  );
}