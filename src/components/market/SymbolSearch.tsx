"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, Check } from "lucide-react";
import { Input } from "@/components/ui/Primitives";
import {
  instrumentDisplayName,
  instrumentSearchSubtitle,
  normalizeInstrument,
  searchFilters,
  searchFilterLabel,
  sortSearchInstruments,
  type Instrument,
} from "@/types/trading";



/**
 * Ports the search + filter UX from
 * lib/features/market_watch/screens/search_symbol_screen.dart — same
 * filter-chip categories (Stock/Index/Futures/Options/Commodity/Currency),
 * same "already in your watchlist" indicator.
 */
export default function SymbolSearch({
  onSelect,
  isAdded,
}: {
  onSelect: (instrument: Instrument) => void;
  isAdded: (instrument: Instrument) => boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Instrument[]>([]);
  const [filter, setFilter] = useState<string>("ALL");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

  const boxRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/broker/scrip-lookup?q=${encodeURIComponent(query.trim())}`, {
          credentials: "include",
        });
        const json = await res.json();
        const hits = json?.data?.result?.hits?.hits ?? json?.data?.hits?.hits ?? [];
        setResults(hits.map((h: unknown) => normalizeInstrument(h as Record<string, unknown>)).slice(0, 500));
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = useMemo(() => sortSearchInstruments(results, query, filter).slice(0, 15), [results, query, filter]);
  const filters = useMemo(() => searchFilters(results), [results]);

  useEffect(() => {
    if (!filters.includes(filter)) setFilter("ALL");
  }, [filters, filter]);

  // Reset highlighted index to 0 whenever the filtered list changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filtered]);

  // Keep the highlighted item scrolled into view during keyboard navigation
  useEffect(() => {
    const el = itemRefs.current[highlightedIndex];
    if (el && open) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex, open]);

  function handleSelectInstrument(instrument: Instrument) {
    onSelect(instrument);
    setQuery("");
    setResults([]);
    setOpen(false);
    // Blur the search input so Market Watch hotkeys (F1/F2/+/-/Arrows) work immediately
    const searchInput = document.querySelector<HTMLInputElement>('[data-aveon-symbol-search="true"]');
    searchInput?.blur();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || filtered.length === 0) {
      if (e.key === "ArrowDown" && results.length > 0) {
        setOpen(true);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      setHighlightedIndex((prev) => (prev + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      setHighlightedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const chosen = filtered[highlightedIndex];
      if (chosen) {
        handleSelectInstrument(chosen);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-aveon-muted" />
        <Input
          data-aveon-symbol-search="true"
          value={query}
          onChange={(e) => setQuery(e.target.value.toUpperCase())}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search scrip — e.g. RELIANCE, NIFTY"
          className="pl-8"
        />
      </div>

      {open && (loading || results.length > 0) && (
        <div className="absolute z-20 mt-1 w-full max-h-96 overflow-hidden rounded-lg border border-aveon-border bg-aveon-panel2 shadow-xl">
          {results.length > 0 && (
            <div className="flex min-h-10 items-center gap-1 overflow-x-auto border-b border-aveon-border p-1.5">
              {filters.map((key) => {
                const f = { key, label: searchFilterLabel(key) };
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition ${
                      filter === f.key ? "bg-aveon-primary text-white" : "text-aveon-muted hover:bg-aveon-panel"
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          )}

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <p className="px-3 py-2 text-xs text-aveon-muted">Searching…</p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-aveon-muted">No symbols found.</p>
            ) : (
              filtered.map((r, idx) => {
                const added = isAdded(r);
                const isHighlighted = idx === highlightedIndex;
                return (
                  <button
                    key={`${r.exchange}-${r.token}-${r.tradingSymbol}`}
                    ref={(el) => {
                      itemRefs.current[idx] = el;
                    }}
                    type="button"
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => handleSelectInstrument(r)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                      isHighlighted
                        ? "bg-aveon-primary/20 text-aveon-text ring-1 ring-inset ring-aveon-primary/40"
                        : "hover:bg-aveon-panel"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{instrumentDisplayName(r)}</p>
                      <p className="truncate text-xs text-aveon-muted">{instrumentSearchSubtitle(r)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-[10px] text-aveon-muted">{r.exchange}</span>
                      {added ? (
                        <Check size={14} className="text-aveon-buy" />
                      ) : (
                        <Plus size={14} className="text-aveon-primary" />
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}