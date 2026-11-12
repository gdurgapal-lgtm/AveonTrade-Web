"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Bell, ChevronDown, Pencil, Plus, X } from "lucide-react";
import { usePanelMaximize } from "@/hooks/usePanelMaximize";
import { instrumentDisplayName, instrumentSearchSubtitle, instrumentIdentityKey, feedToken, exchangeSegmentFor, isIndexInstrument } from "@/types/trading";
import { formatCurrency, formatNumber, pnlTone } from "@/lib/format";
import type { Instrument } from "@/types/trading";

interface WatchlistSidebarProps {
  groups: any[];
  active: any;
  activeId: string;
  setActiveId: (id: string) => void;
  addGroup: (name: string) => void;
  renameGroup: (id: string, name: string) => void;
  removeGroup: (id: string) => void;
  addItem: (id: string, item: Instrument) => void;
  removeItem: (id: string, item: Instrument) => void;
  selected: Instrument | null;
  setSelected: (item: Instrument | null) => void;
  quotesByToken: Record<string, any>;
  connected: boolean | null;
  lastError: string | null;
  onCreateAlert: (instrument: Instrument) => void;
}

export default function WatchlistSidebar({
  groups, active, activeId, setActiveId, addGroup, renameGroup, removeGroup, addItem, removeItem,
  selected, setSelected, quotesByToken, connected, lastError, onCreateAlert
}: WatchlistSidebarProps) {
  const { maximized, toggle, Portal } = usePanelMaximize();
  const [customOrder, setCustomOrder] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const identity = (item: Instrument) => `${exchangeSegmentFor(item)}:${item.token}:${item.tradingSymbol || item.symbol}`;

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`aveon.market-watch.order.${activeId}`) || "[]");
      if (Array.isArray(saved)) setCustomOrder(saved.filter((x: unknown) => typeof x === "string"));
      else setCustomOrder([]);
    } catch {
      setCustomOrder([]);
    }
  }, [activeId, groups]);

  const sortedItems = useMemo(() => {
    const list = active?.items ?? [];
    if (customOrder.length) {
      const rank = new Map(customOrder.map((key, i) => [key, i]));
      return [...list].sort((a: Instrument, b: Instrument) => (rank.get(identity(a)) ?? 999999) - (rank.get(identity(b)) ?? 999999));
    }
    return list;
  }, [active?.items, customOrder]);

  // Whenever `selected` changes, scroll and shift DOM focus directly to that row in the sidebar
  useEffect(() => {
    if (!selected) return;
    const rowId = identity(selected);
    const timer = setTimeout(() => {
      const rows = Array.from(containerRef.current?.querySelectorAll<HTMLElement>("[data-aveon-instrument-row]") ?? []);
      const matchedRow = rows.find((el) => el.dataset.aveonInstrumentRow === rowId);
      if (matchedRow) {
        matchedRow.scrollIntoView({ block: "nearest", behavior: "smooth" });
        matchedRow.focus({ preventScroll: true });
      }
    }, 40);
    return () => clearTimeout(timer);
  }, [selected]);

  // Handle Up/Down arrow key navigation within the watchlist sidebar
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!sortedItems.length) return;
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;

    e.preventDefault();
    e.stopPropagation();

    const currentIndex = selected
      ? sortedItems.findIndex((item: Instrument) => identity(item) === identity(selected))
      : -1;

    let nextIndex = 0;
    if (e.key === "ArrowDown") {
      nextIndex = currentIndex < sortedItems.length - 1 ? currentIndex + 1 : 0;
    } else {
      nextIndex = currentIndex > 0 ? currentIndex - 1 : sortedItems.length - 1;
    }

    const nextItem = sortedItems[nextIndex];
    if (nextItem) {
      setSelected(nextItem);
    }
  }

  return (
    <Portal>
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="flex h-full w-full sm:w-80 shrink-0 flex-col rounded-aveon border border-aveon-border bg-aveon-panel outline-none focus:ring-1 focus:ring-aveon-primary/40"
    >
      <div className="flex items-center gap-2 border-b border-aveon-border px-3 py-2">
        <div className="relative min-w-0 flex-1">
          <select
            value={activeId}
            onChange={(e) => setActiveId(e.target.value)}
            className="h-8 w-full appearance-none rounded-md border border-aveon-border bg-aveon-panel2 px-2.5 pr-8 text-xs font-medium text-aveon-text outline-none focus:border-aveon-primary cursor-pointer"
            aria-label="Market watch portfolio"
          >
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-aveon-muted" />
        </div>
        <button
          type="button"
          title="Create market watch portfolio"
          onClick={() => {
            const name = window.prompt("Portfolio name", `Portfolio ${groups.length + 1}`);
            if (name?.trim()) addGroup(name.trim());
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-aveon-border text-aveon-muted hover:bg-aveon-panel2 hover:text-aveon-primary"
        >
          <Plus size={14} />
        </button>
        <button
          type="button"
          title="Rename current portfolio"
          onClick={() => {
            if (!active) return;
            const name = window.prompt("Portfolio name", active.name);
            if (name?.trim()) renameGroup(active.id, name.trim());
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-aveon-border text-aveon-muted hover:bg-aveon-panel2 hover:text-aveon-text"
        >
          <Pencil size={13} />
        </button>
        {groups.length > 1 && (
          <button
            type="button"
            title="Delete current portfolio"
            onClick={() => {
              if (!active) return;
              if (window.confirm(`Delete portfolio "${active.name}"?`)) removeGroup(active.id);
            }}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-aveon-border text-aveon-muted hover:bg-aveon-panel2 hover:text-aveon-sell"
          >
            <X size={13} />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between border-b border-aveon-border px-3 py-1 text-[11px] text-aveon-muted">
        <span>{active?.name ?? "Instruments"} · {sortedItems.length} instruments</span>
        <span className="flex items-center gap-1">
          <span className={`h-1.5 w-1.5 rounded-full ${connected === true ? "bg-aveon-buy" : connected === false ? "bg-amber-400" : "bg-aveon-muted"}`} />
          {connected === true ? "Live" : "No live feed"}
        </span>
      </div>
      
      {lastError && <p className="border-b border-aveon-border bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-500">{lastError}</p>}

      {/* Header layout updated to remove static action icon slots and widen space */}
      <div className="grid grid-cols-[minmax(0,1fr)_110px] items-center border-b border-aveon-border/70 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-aveon-muted">
        <span>Symbol</span>
        <div className="flex items-center justify-end gap-5 pr-1">
          <span>LTP</span>
          <span>Chg%</span>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {sortedItems.length === 0 ? (
          <p className="p-4 text-center text-xs text-aveon-muted">Search above to add scrips to this watchlist.</p>
        ) : (
          sortedItems.map((item: Instrument) => {
            const tokenKey = feedToken(item) || `${item.marketSegmentId ?? ""}_${item.token}`;
            const q = quotesByToken[tokenKey];
            const isSelected = !!selected && instrumentIdentityKey(selected) === instrumentIdentityKey(item);
            const tone = q ? (pnlTone(q.change) === "buy" ? "text-aveon-buy" : "text-aveon-sell") : "text-aveon-muted";
            const rowIdentity = identity(item);
            return (
              <div
                key={instrumentIdentityKey(item)}
                data-aveon-instrument-row={rowIdentity}
                tabIndex={-1}
                onClick={() => setSelected(item)}
                onDoubleClick={() => {
                  if (isIndexInstrument(item)) {
                    window.alert("Indices Instrument are non tradable");
                    return;
                  }
                  window.dispatchEvent(
                    new CustomEvent("aveon:open-order-entry", {
                      detail: { instrument: item, side: "BUY" },
                    })
                  );
                }}
                className={`group relative grid grid-cols-[minmax(0,1fr)_110px] items-center border-b border-aveon-border/40 px-3 py-2 text-sm outline-none hover:bg-aveon-panel2 focus:bg-aveon-primary/20 cursor-pointer ${isSelected ? "bg-aveon-primary/10" : ""}`}
              >
                {/* Left: Symbol & Subtitle */}
                <div className="min-w-0 pr-1">
                  <p className="truncate font-medium">{instrumentDisplayName(item)}</p>
                  <p className="truncate text-[11px] text-aveon-muted">{instrumentSearchSubtitle(item)}</p>
                </div>

                {/* Right: LTP & Change % */}
                <div className={`text-right ${tone} pr-1`}>
                  <p className="truncate text-sm font-medium tabular-nums">{q?.ltp ? formatCurrency(q.ltp) : "—"}</p>
                  <p className="text-[11px] tabular-nums">{q ? `${q.change >= 0 ? "+" : ""}${formatNumber(q.change_percent)}%` : "—"}</p>
                </div>

                {/* Floating Hover Action Toolbar (Replaces static columns with cursor-attached hover tools) */}
                <div
                  className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1 bg-aveon-panel/95 backdrop-blur-sm px-1.5 py-1 rounded border border-aveon-border shadow-lg z-10"
                  onClick={(e) => e.stopPropagation()}
                >
                  {!isIndexInstrument(item) && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(item);
                          window.dispatchEvent(new CustomEvent("aveon:open-order-entry", { detail: { instrument: item, side: "BUY" } }));
                        }}
                        className="h-5 w-5 rounded bg-aveon-buy text-[10px] font-bold text-white flex items-center justify-center transition hover:opacity-90"
                        title="Buy (B)"
                      >
                        B
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(item);
                          window.dispatchEvent(new CustomEvent("aveon:open-order-entry", { detail: { instrument: item, side: "SELL" } }));
                        }}
                        className="h-5 w-5 rounded bg-aveon-sell text-[10px] font-bold text-white flex items-center justify-center transition hover:opacity-90"
                        title="Sell (S)"
                      >
                        S
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateAlert(item);
                    }}
                    aria-label={`Create alert for ${instrumentDisplayName(item)}`}
                    className="rounded p-1 text-aveon-muted hover:bg-aveon-primary/10 hover:text-aveon-primary"
                    title="Create Alert"
                  >
                    <Bell size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeItem(activeId, item);
                      if (isSelected) setSelected(null);
                    }}
                    aria-label={`Remove ${instrumentDisplayName(item)} from watchlist`}
                    className="rounded p-1 text-aveon-muted hover:text-aveon-sell"
                    title="Remove"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
    </Portal>
  );
}