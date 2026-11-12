"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Search, Check, Plus } from "lucide-react";
import { classifyInstrument, instrumentDisplayName, instrumentSearchSubtitle, normalizeInstrument, searchFilters, searchFilterLabel, sortSearchInstruments, type Instrument } from "@/types/trading";



/**
 * TradingView-style full search popup: Symbol | Series | Expiry | Company |
 * Type | Exchange columns, filter chips, autofocus. Same broker endpoint
 * and classification logic as the compact SymbolSearch dropdown — this is
 * just the "browse everything" surface for it.
 */
export default function SymbolSearchModal({
  open,
  onClose,
  onSelect,
  isAdded,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (instrument: Instrument) => void;
  isAdded: (instrument: Instrument) => boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Instrument[]>([]);
  const [filter, setFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else {
      setQuery("");
      setResults([]);
      setFilter("ALL");
    }
  }, [open]);

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
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => sortSearchInstruments(results, query, filter), [results, query, filter]);
  const filters = useMemo(() => searchFilters(results), [results]);

  useEffect(() => {
    if (!filters.includes(filter)) setFilter("ALL");
  }, [filters, filter]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center bg-black/60 pt-20" onClick={onClose}>
      <div
        className="flex max-h-[70vh] w-full max-w-3xl flex-col rounded-aveon border border-aveon-border bg-aveon-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center gap-2 border-b border-aveon-border p-3">
          <Search size={16} className="shrink-0 text-aveon-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value.toUpperCase())}
            placeholder="Symbol, company name…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-aveon-muted"
          />
          <button onClick={onClose} className="rounded p-1 text-aveon-muted hover:bg-aveon-panel2">
            <X size={16} />
          </button>
        </div>

        <div className="shrink-0 flex min-h-11 items-center gap-1 overflow-x-auto border-b border-aveon-border px-3 py-2">
          {filters.map((key) => {
            const f = { key, label: searchFilterLabel(key) };
            return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
                filter === f.key ? "bg-aveon-primary text-white" : "bg-aveon-panel2 text-aveon-muted hover:text-aveon-text"
              }`}
            >
              {f.label}
            </button>
          )})}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {query.trim().length < 2 ? (
            <p className="p-6 text-center text-sm text-aveon-muted">Type at least 2 characters to search.</p>
          ) : loading ? (
            <p className="p-6 text-center text-sm text-aveon-muted">Searching…</p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-aveon-muted">No symbols found.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 border-b border-aveon-border bg-aveon-panel text-left text-xs text-aveon-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Symbol</th>
                  <th className="px-3 py-2 font-medium">Series</th>
                  <th className="px-3 py-2 font-medium">Expiry</th>
                  <th className="px-3 py-2 font-medium">Company</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Exchange</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const added = isAdded(r);
                  const kind = classifyInstrument(r);
                  return (
                    <tr
                      key={`${r.exchange}-${r.token}-${r.tradingSymbol}`}
                      onClick={() => {
                        onSelect(r);
                        onClose();
                      }}
                      className="table-row-hover cursor-pointer border-b border-aveon-border/40"
                    >
                      <td className="px-3 py-2 font-medium"><div>{instrumentDisplayName(r)}</div><div className="mt-0.5 text-[11px] font-normal text-aveon-muted">{instrumentSearchSubtitle(r)}</div></td>
                      <td className="px-3 py-2 text-aveon-muted">{r.series || "—"}</td>
                      <td className="px-3 py-2 text-aveon-muted">{r.expiryDateText || "—"}</td>
                      <td className="max-w-[220px] truncate px-3 py-2 text-aveon-muted">{r.companyName || r.derivativeDesc || "—"}</td>
                      <td className="px-3 py-2 text-aveon-muted">{kind}</td>
                      <td className="px-3 py-2 text-aveon-muted">{r.exchange}</td>
                      <td className="px-3 py-2 text-right">
                        {added ? (
                          <Check size={14} className="ml-auto text-aveon-buy" />
                        ) : (
                          <Plus size={14} className="ml-auto text-aveon-primary" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
