"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { Columns3, Minimize2, Maximize2, ChevronUp, ChevronDown, FolderKanban, GripVertical, Bell, Trash2 } from "lucide-react";
import { exchangeSegmentFor, feedToken, instrumentDisplayName, isIndexInstrument, type Instrument, type WatchlistQuote } from "@/types/trading";
import { formatNumber } from "@/lib/format";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useWorkspace } from "@/hooks/useWorkspace";

type Column = { id: string; label: string; value: (instrument: Instrument, quote?: WatchlistQuote) => string; price?: boolean; indexHide?: boolean };
const columns: Column[] = [
  { id: "buyQty", label: "Buy Qty", value: (_i,q) => num(q?.bid_qty), indexHide: true },
  { id: "buyPrice", label: "Buy Price", value: (_i,q) => price(q?.bid_price), price: true, indexHide: true },
  { id: "sellQty", label: "Sell Qty", value: (_i,q) => num(q?.ask_qty), indexHide: true },
  { id: "sellPrice", label: "Sell Price", value: (_i,q) => price(q?.ask_price), price: true, indexHide: true },
  { id: "ltp", label: "LTP", value: (_i,q) => price(q?.ltp), price: true },
  { id: "indicativeClose", label: "Ind. Close", value: (_i,q) => price(q?.indicative_close_price), price: true },
  { id: "ltq", label: "LTQ", value: (_i,q) => num(q?.last_trade_quantity) },
  { id: "lastTradeTime", label: "LTT", value: (_i,q) => q?.last_trade_time || "—" },
  { id: "oi", label: "OI", value: (_i,q) => num(q?.open_interest) },
  { id: "netChange", label: "Change", value: (_i,q) => price(q?.net_change ?? q?.change), price: true },
  { id: "open", label: "Open ", value: (_i,q) => price(q?.open), price: true },
  { id: "high", label: "High ", value: (_i,q) => price(q?.high), price: true },
  { id: "low", label: "Low ", value: (_i,q) => price(q?.low), price: true },
  { id: "close", label: "Close ", value: (_i,q) => price(q?.close), price: true },
  { id: "volume", label: "Volume", value: (_i,q) => num(q?.volume) },
  { id: "avg", label: "ATP", value: (_i,q) => price(q?.average_traded_price ?? q?.depth?.avgTradedPrice), price: true },
  { id: "totalBuy", label: "Total Buy", value: (_i,q) => num(q?.depth?.totalBuyQty), indexHide: true },
  { id: "totalSell", label: "Total Sell", value: (_i,q) => num(q?.depth?.totalSellQty), indexHide: true },
  { id: "lifeHigh", label: "52W High", value: (_i,q) => price(q?.lifetime_high ?? q?.depth?.week52High), price: true },
  { id: "lifeLow", label: "52W Low", value: (_i,q) => price(q?.lifetime_low ?? q?.depth?.week52Low), price: true },
  { id: "cas", label: "CAS Ref Price", value: (_i,q) => price(q?.cas_reference_price), price: true },
  { id: "dailyRange", label: "Circuit Range", value: (_i,q) => q?.daily_price_range || q?.depth?.circuitRange || "—" },
  { id: "changePct", label: "Change %", value: (_i,q) => q ? `${formatNumber(q.change_percent)}%` : "—" },
];

const DEFAULT_COLUMNS = ["buyQty","buyPrice","sellQty","sellPrice","ltp","indicativeClose","changePct","volume","open","high","low","close","cas"];
const STORAGE_KEY = "aveon.market-watch.column-profiles.v1";
type Profile = { name: string; columns: string[] };

function num(value: unknown) {  
  const n = Number(value);  
  return value == null || value === "" || !Number.isFinite(n) ? "—" : formatNumber(n, 0);  
}
function price(value: unknown) {  
  const n = Number(value);  
  return value == null || value === "" || !Number.isFinite(n) || n === 0 ? "—" : formatNumber(n, 2);  
}

export default function MarketWatchGrid({ instruments, quotesByToken, onSelect, selected, onClose, onTrade, onRemove, onCreateAlert, embedded = false, activeId: propActiveId, setActiveId: propSetActiveId }: {
  instruments: Instrument[]; quotesByToken: Record<string, WatchlistQuote>; onSelect: (item: Instrument) => void;
  selected: Instrument | null; onClose: () => void; onTrade: (item: Instrument, side?: "BUY" | "SELL") => void;  
  onRemove?: (item: Instrument) => void; onCreateAlert?: (item: Instrument) => void; embedded?: boolean;
  activeId?: string; setActiveId?: (id: string) => void;
}) {
  const { activeId: workspaceId } = useWorkspace();
  const { groups, activeId: hookActiveId, setActiveId: hookSetActiveId } = useWatchlist(workspaceId);

  const activeId = propActiveId ?? hookActiveId;
  const setActiveId = propSetActiveId ?? hookSetActiveId;

  const [profiles, setProfiles] = useState<Profile[]>([{ name: "DEFAULT", columns: DEFAULT_COLUMNS }]);
  const [profileName, setProfileName] = useState("DEFAULT");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [visible, setVisible] = useState<string[]>(DEFAULT_COLUMNS);
  const [saveName, setSaveName] = useState("");
  const [maximized, setMaximized] = useState(!embedded);
  const [customOrder, setCustomOrder] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Drag and drop state
  const [draggedKey, setDraggedKey] = useState<string | null>(null);

  const prevQuotesRef = useRef<Record<string, number>>({});
  const [flashStates, setFlashStates] = useState<Record<string, "up" | "down">>({});

  const identity = (item: Instrument) => `${exchangeSegmentFor(item)}:${item.token}:${item.tradingSymbol || item.symbol}`;

  // Load saved custom order for the active watchlist group
  useEffect(() => {
    try {  
      const saved = JSON.parse(localStorage.getItem(`aveon.market-watch.order.${activeId}`) || "[]");  
      if (Array.isArray(saved)) setCustomOrder(saved.filter((x) => typeof x === "string"));  
      else setCustomOrder([]);
    } catch {  
      setCustomOrder([]);  
    }
  }, [activeId]);

  useEffect(() => {
    const nextFlashes: Record<string, "up" | "down"> = {};
    for (const [token, q] of Object.entries(quotesByToken)) {
      if (!q || typeof q.ltp !== "number") continue;
      const prevLtp = prevQuotesRef.current[token];
      if (prevLtp !== undefined && prevLtp !== q.ltp) {
        nextFlashes[token] = q.ltp > prevLtp ? "up" : "down";
      }
      prevQuotesRef.current[token] = q.ltp;
    }

    if (Object.keys(nextFlashes).length > 0) {
      setFlashStates(nextFlashes);
      const timer = setTimeout(() => setFlashStates({}), 450);
      return () => clearTimeout(timer);
    }
  }, [quotesByToken]);

  const orderedInstruments = useMemo(() => {
    let result = [...instruments];
    if (sortBy) {
      const col = columns.find((c) => c.id === sortBy);
      if (col) result.sort((a,b) => {
        const av = col.value(a, quotesByToken[feedToken(a) ?? ""]).replace(/[%,$]/g, "");
        const bv = col.value(b, quotesByToken[feedToken(b) ?? ""]).replace(/[%,$]/g, "");
        const an = Number(av), bn = Number(bv);
        const cmp = Number.isFinite(an) && Number.isFinite(bn) ? an-bn : av.localeCompare(bv);
        return sortDirection === "asc" ? cmp : -cmp;
      });
    } else if (customOrder.length) {
      const rank = new Map(customOrder.map((key, i) => [key, i]));
      result.sort((a,b) => (rank.get(identity(a)) ?? 999999) - (rank.get(identity(b)) ?? 999999));
    }
    return result;
  }, [instruments, quotesByToken, customOrder, sortBy, sortDirection]);

  function moveInstrument(item: Instrument, offset: number) {
    const keys = orderedInstruments.map(identity);
    const index = keys.indexOf(identity(item)); const nextIndex = index + offset;
    if (index < 0 || nextIndex < 0 || nextIndex >= keys.length) return;
    [keys[index], keys[nextIndex]] = [keys[nextIndex], keys[index]];
    setSortBy(null); setCustomOrder(keys);
    try { localStorage.setItem(`aveon.market-watch.order.${activeId}`, JSON.stringify(keys)); } catch { /* optional */ }
  }

  // Drag and drop handlers
  function handleDragStart(e: React.DragEvent, item: Instrument) {
    setDraggedKey(identity(item));
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(e: React.DragEvent, targetItem: Instrument) {
    e.preventDefault();
    if (!draggedKey) return;
    const targetKey = identity(targetItem);
    if (draggedKey === targetKey) return;

    const keys = orderedInstruments.map(identity);
    const fromIdx = keys.indexOf(draggedKey);
    const toIdx = keys.indexOf(targetKey);

    if (fromIdx < 0 || toIdx < 0) return;

    keys.splice(fromIdx, 1);
    keys.splice(toIdx, 0, draggedKey);

    setSortBy(null);
    setCustomOrder(keys);
    setDraggedKey(null);
    try {  
      localStorage.setItem(`aveon.market-watch.order.${activeId}`, JSON.stringify(keys));  
    } catch {  
      /* optional */  
    }
  }

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target?.isContentEditable) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (!orderedInstruments.length) return;
        event.preventDefault();
        const current = selected ? orderedInstruments.findIndex((item) => identity(item) === identity(selected)) : -1;
        const next = event.key === "ArrowDown" ? Math.min(orderedInstruments.length - 1, current + 1) : Math.max(0, current < 0 ? 0 : current - 1);
        const nextInstrument = orderedInstruments[next];
        onSelect(nextInstrument);
        
        window.requestAnimationFrame(() => {
          const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-aveon-instrument-row]"));
          const row = rows.find((element) => element.dataset.aveonInstrumentRow === identity(nextInstrument));
          if (row) {
            if (next === 0) {
              const scrollContainer = row.closest(".overflow-auto");
              if (scrollContainer) scrollContainer.scrollTop = 0;
            } else {
              row.scrollIntoView({ block: "nearest", behavior: "instant" });
            }
          }
        });
      }
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [orderedInstruments, selected, onSelect]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (Array.isArray(saved) && saved.length) {
        const valid = saved.filter((x: any) => typeof x?.name === "string" && Array.isArray(x.columns)) as Profile[];
        if (valid.length) { setProfiles(valid); setProfileName(valid[0].name); setVisible(valid[0].columns.filter((id) => columns.some((c) => c.id === id))); }
      }
    } catch { /* keep default profile */ }
  }, []);

  const activeColumns = useMemo(() => columns.filter((column) => visible.includes(column.id)), [visible]);

  function selectProfile(name: string) {
    setProfileName(name);
    const profile = profiles.find((item) => item.name === name);
    if (profile) setVisible(profile.columns.filter((id) => columns.some((column) => column.id === id)));
  }

  function saveProfile() {
    const name = saveName.trim().toUpperCase() || profileName;
    const next = [...profiles.filter((item) => item.name !== name), { name, columns: visible }];
    setProfiles(next); setProfileName(name); setSaveName("");
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* storage disabled */ }
  }

  function applyPreset(preset: "ALL" | "DEFAULT" | "INDEX") {
    const ids = preset === "ALL" ? columns.map((c) => c.id) : preset === "INDEX" ? columns.filter((c) => !c.indexHide).map((c) => c.id) : DEFAULT_COLUMNS;
    setVisible(ids); setProfileName(preset === "ALL" ? "ALL COLUMNS" : preset === "INDEX" ? "INDEX VIEW" : "DEFAULT");
  }

  return (
    <div className="relative h-full w-full flex min-w-0 flex-col overflow-hidden border border-aveon-border bg-aveon-panel text-aveon-text font-sans select-none z-0">
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-aveon-border bg-aveon-panel2 px-3 py-2 text-xs z-10">
        <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-aveon-primary">
          <FolderKanban size={14} />
          <span>Watchlist:</span>
        </div>
        <select
          aria-label="Select shared portfolio group"
          value={activeId}
          onChange={(e) => setActiveId(e.target.value)}
          className="h-7 rounded border border-aveon-border bg-aveon-panel px-2 text-xs font-semibold text-aveon-text outline-none focus:border-aveon-primary cursor-pointer"
        >
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name} ({group.items.length})
            </option>
          ))}
        </select>

        <span className="mx-1 h-3.5 border-l border-aveon-border" />
        <label className="text-aveon-muted">Profile:</label>
        <select value={profileName} onChange={(e) => { const value = e.target.value; if (value === "ALL COLUMNS") applyPreset("ALL"); else if (value === "INDEX VIEW") applyPreset("INDEX"); else selectProfile(value); }} className="h-7 rounded border border-aveon-border bg-aveon-panel px-2 text-xs text-aveon-text outline-none cursor-pointer">
          {profiles.map((profile) => <option key={profile.name} value={profile.name}>{profile.name}</option>)}
          <option value="ALL COLUMNS">ALL COLUMNS</option>
          <option value="INDEX VIEW">INDEX VIEW</option>
        </select>
        <button onClick={() => applyPreset("ALL")} className="rounded border border-aveon-border px-2 py-1 hover:bg-aveon-panel">All columns</button>
        <button onClick={() => setPickerOpen((v) => !v)} className="flex items-center gap-1 rounded border border-aveon-border px-2 py-1 hover:bg-aveon-panel">
          <Columns3 size={13}/> Select columns
        </button>

        {pickerOpen && (
          <div className="absolute right-3 top-12 z-50 max-h-[70vh] w-80 overflow-y-auto rounded-lg border border-aveon-border bg-aveon-panel p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <b className="text-xs text-aveon-text">Visible columns</b>
              <button onClick={() => setPickerOpen(false)} className="text-xs text-aveon-primary font-semibold">Done</button>
            </div>
            <div className="grid grid-cols-1 gap-1">
              {columns.map((column) => (
                <label key={column.id} className="flex items-center gap-2 py-1 text-xs text-aveon-text cursor-pointer hover:bg-aveon-panel2 px-1 rounded">
                  <input type="checkbox" checked={visible.includes(column.id)} onChange={(e) => setVisible((old) => e.target.checked ? [...old, column.id] : old.filter((id) => id !== column.id))}/>
                  {column.label}
                </label>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Save profile name" className="min-w-0 flex-1 rounded border border-aveon-border bg-aveon-panel2 px-2 py-1 text-xs text-aveon-text outline-none"/>
              <button onClick={saveProfile} className="rounded bg-aveon-primary px-3 py-1 text-xs font-semibold text-white">Save</button>
            </div>
          </div>
        )}

        <span className="ml-auto text-[11px] text-aveon-muted">
          <strong className="text-aveon-text">{instruments.length}</strong> instruments · Drag rows to reorder · <kbd className="rounded bg-aveon-panel px-1 py-0.5 font-mono text-[10px]">↑/↓</kbd> navigate
        </span>

        <button onClick={onClose} className="rounded border border-aveon-border px-2.5 py-1 text-xs hover:bg-aveon-panel font-semibold text-aveon-primary">Split View</button>
      </div>

      {/* Grid Table */}
      <div className="min-h-0 flex-1 overflow-auto bg-aveon-panel relative z-0">
        <table className="min-w-max w-full border-collapse text-xs tabular-nums">
          <thead className="sticky top-0 z-10 bg-aveon-panel2 text-aveon-muted shadow-sm">
            <tr>
              <th className="sticky left-0 z-20 border-b border-r border-aveon-border bg-aveon-panel2 px-3 py-2 text-left font-semibold w-48">Instrument</th>
              {activeColumns.map((column) => (
                <th key={column.id} className="whitespace-nowrap border-b border-aveon-border px-3 py-2 text-right font-semibold">
                  <button type="button" onClick={() => { setSortDirection((old) => sortBy === column.id && old === "asc" ? "desc" : "asc"); setSortBy(column.id); }} title={`Sort by ${column.label}`} className="hover:text-aveon-text">
                    {column.label}{sortBy === column.id ? (sortDirection === "asc" ? " ▲" : " ▼") : ""}
                  </button>
                </th>
              ))}
              <th className="border-b border-aveon-border px-3 py-2 text-center font-semibold">Quick Actions</th>
            </tr>
          </thead>
          <tbody>
            {orderedInstruments.map((instrument, rowIndex) => {
              const tokenKey = feedToken(instrument) || `${instrument.marketSegmentId ?? ""}_${instrument.token}`;
              const quote = quotesByToken[tokenKey];
              const index = isIndexInstrument(instrument);
              const chosen = selected && exchangeSegmentFor(selected) === exchangeSegmentFor(instrument) && selected.token === instrument.token;
              const flash = flashStates[tokenKey];
              const tone = (quote?.change ?? 0) > 0 ? "text-aveon-buy" : (quote?.change ?? 0) < 0 ? "text-aveon-sell" : "text-aveon-text";

              return (
                <tr
                  key={`${tokenKey}:${instrument.symbol}`}
                  data-aveon-instrument-row={identity(instrument)}
                  draggable
                  onDragStart={(e) => handleDragStart(e, instrument)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, instrument)}
                  tabIndex={-1}
                  onClick={() => onSelect(instrument)}
                  className={`cursor-pointer border-b border-aveon-border/65 transition-colors hover:bg-aveon-panel2 ${
                    chosen ? "bg-aveon-primary/15 font-medium ring-1 ring-inset ring-aveon-primary/40" : ""
                  } ${draggedKey === identity(instrument) ? "opacity-40" : ""}`}
                >
                  <td className="sticky left-0 z-[5] border-r border-aveon-border bg-aveon-panel px-3 py-1.5 w-48 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                    <div className="flex items-center gap-1.5">
                      <span className="cursor-grab text-aveon-muted hover:text-aveon-text" title="Drag to reorder">
                        <GripVertical size={13} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-aveon-text truncate">{instrumentDisplayName(instrument)}</div>
                        <div className="text-[10px] text-aveon-muted">{exchangeSegmentFor(instrument) || instrument.exchange}</div>
                      </div>
                    </div>
                  </td>

                  {activeColumns.map((column) => {
                      const isLtp = column.id === "ltp";
                      const flashClass = isLtp && flash === "up" ? "bg-aveon-buy/25 text-aveon-buy font-bold transition-colors duration-300" : isLtp && flash === "down" ? "bg-aveon-sell/25 text-aveon-sell font-bold transition-colors duration-300" : "";
                      
                      // Ensure prices and key metrics use full-strength primary text and bold weights for Google Finance-level clarity
                      const isPriceColumn = column.price || ["ltp", "open", "high", "low", "close", "indicativeClose", "volume", "oi"].includes(column.id);
                      const sideTone = ["buyQty", "buyPrice", "totalBuy"].includes(column.id)
                        ? "text-aveon-buy font-semibold"
                        : ["sellQty", "sellPrice", "totalSell"].includes(column.id)
                          ? "text-aveon-sell font-semibold"
                          : ["ltp", "change", "changePct", "netChange"].includes(column.id) 
                            ? `${tone} font-bold` 
                            : isPriceColumn 
                              ? "text-[rgb(var(--aveon-text))] font-semibold" 
                              : "text-[rgb(var(--aveon-text))]";

                      return (
                        <td key={column.id} className={`whitespace-nowrap px-3 py-1.5 text-right tabular-nums ${sideTone} ${flashClass} ${index && column.indexHide ? "text-aveon-muted" : ""}`}>
                          {index && column.indexHide ? "—" : column.value(instrument, quote)}
                        </td>
                      );
                    })}

                  <td className="px-2 py-1 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button type="button" title="Move symbol up" aria-label="Move symbol up" disabled={rowIndex === 0} onClick={(e) => { e.stopPropagation(); moveInstrument(instrument, -1); }} className="rounded p-1 text-aveon-muted hover:bg-aveon-panel disabled:opacity-20"><ChevronUp size={12}/></button>
                      <button type="button" title="Move symbol down" aria-label="Move symbol down" disabled={rowIndex === orderedInstruments.length - 1} onClick={(e) => { e.stopPropagation(); moveInstrument(instrument, 1); }} className="rounded p-1 text-aveon-muted hover:bg-aveon-panel disabled:opacity-20"><ChevronDown size={12}/></button>
                      
                      {onCreateAlert && (
                        <button
                          type="button"
                          title="Create price alert"
                          onClick={(e) => { e.stopPropagation(); onCreateAlert(instrument); }}
                          className="rounded p-1 text-aveon-muted hover:bg-aveon-panel hover:text-aveon-text"
                        >
                          <Bell size={12} />
                        </button>
                      )}

                      {onRemove && (
                        <button
                          type="button"
                          title="Remove from watchlist"
                          onClick={(e) => { e.stopPropagation(); onRemove(instrument); }}
                          className="rounded p-1 text-aveon-muted hover:bg-aveon-panel hover:text-aveon-sell"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}

                      {!index ? (
                        <div className="flex items-center gap-1 ml-1">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onTrade(instrument, "BUY"); }}
                            className="rounded bg-aveon-buy px-2 py-0.5 text-[10px] font-bold text-white hover:opacity-90 shadow-sm"
                          >
                            B
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onTrade(instrument, "SELL"); }}
                            className="rounded bg-aveon-sell px-2 py-0.5 text-[10px] font-bold text-white hover:opacity-90 shadow-sm"
                          >
                            S
                          </button>
                        </div>
                      ) : (
                        <span className="rounded bg-aveon-panel2 px-2 py-0.5 text-[10px] text-aveon-muted">Index</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!instruments.length && <p className="p-12 text-center text-xs text-aveon-muted">No instruments in this watchlist. Use the symbol search above to add scrips.</p>}
      </div>
    </div>
  );
}