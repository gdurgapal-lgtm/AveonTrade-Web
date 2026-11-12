"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Plus, X } from "lucide-react";
import { formatNumber, pnlTone } from "@/lib/format";
import { useIndexMarketData, type IndexDetails } from "@/hooks/useIndexMarketData";

function displayIndexName(index: IndexDetails) {
  return index.sIndexDesc || index.sIndex;
}

const WIDTH_STORAGE_KEY = "aveon_market_watch_index_widths_v1";
const DEFAULT_INDEX_WIDTH = 260;
const MIN_INDEX_WIDTH = 190;
const MAX_INDEX_WIDTH = 420;

type WidthMap = Record<string, number>;
type ResizeState = { key: string; startX: number; startWidth: number };

/** API-driven index strip shared with the Dashboard index quote store. */
export default function MarketIndexStrip() {
  const {
    catalogue,
    selectedIndices,
    quotesByToken,
    loading,
    error,
    addIndex,
    removeIndex,
  } = useIndexMarketData();
  const [query, setQuery] = useState("");
  const [itemWidths, setItemWidths] = useState<WidthMap>({});
  const [widthsLoaded, setWidthsLoaded] = useState(false);
  const resizeRef = useRef<ResizeState | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(WIDTH_STORAGE_KEY) ?? "{}");
      if (saved && typeof saved === "object" && !Array.isArray(saved)) setItemWidths(saved);
    } catch {
      // Invalid saved widths are ignored.
    } finally {
      setWidthsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!widthsLoaded) return;
    try {
      window.localStorage.setItem(WIDTH_STORAGE_KEY, JSON.stringify(itemWidths));
    } catch {
      // Width persistence is optional.
    }
  }, [itemWidths, widthsLoaded]);

  const updateWidth = (key: string, width: number) => {
    const nextWidth = Math.max(MIN_INDEX_WIDTH, Math.min(MAX_INDEX_WIDTH, width));
    setItemWidths((current) => ({ ...current, [key]: nextWidth }));
  };

  const handleResizeMove = (event: ReactPointerEvent<HTMLDivElement>, key: string) => {
    const drag = resizeRef.current;
    if (!drag || drag.key !== key) return;
    updateWidth(key, drag.startWidth + event.clientX - drag.startX);
  };

  const finishResize = () => {
    resizeRef.current = null;
  };

  const suggestions = useMemo(() => {
    const value = query.trim().toUpperCase();
    if (!value) return [];
    const normalized = value.replace(/[^A-Z0-9]/g, "");
    const available = catalogue.filter((item) =>
      !selectedIndices.some((selected) => selected.key === item.key) &&
      `${item.sIndex} ${item.sIndexDesc}`.toUpperCase().includes(value)
    );
    const rank = (item: IndexDetails) => {
      const symbol = item.sIndex.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const description = item.sIndexDesc.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (symbol === normalized || description === normalized) return 0;
      // Typing NIFTY should put the actual NIFTY 50 index ahead of
      // NIFTY BANK / NIFTY 500, even when the API symbol is NIFTY50.
      if (normalized === "NIFTY" && (symbol === "NIFTY50" || description === "NIFTY50")) return 1;
      if (symbol.startsWith(normalized)) return 2;
      if (description.startsWith(normalized)) return 3;
      return 4;
    };
    return available.sort((a, b) => rank(a) - rank(b) || a.sIndex.localeCompare(b.sIndex)).slice(0, 8);
  }, [catalogue, query, selectedIndices]);

  const normalizedQuery = query.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const exactMatches = suggestions.filter((item) =>
    item.sIndex.toUpperCase().replace(/[^A-Z0-9]/g, "") === normalizedQuery ||
    item.sIndexDesc.toUpperCase().replace(/[^A-Z0-9]/g, "") === normalizedQuery ||
    (normalizedQuery === "NIFTY" && (
      item.sIndex.toUpperCase().replace(/[^A-Z0-9]/g, "") === "NIFTY50" ||
      item.sIndexDesc.toUpperCase().replace(/[^A-Z0-9]/g, "") === "NIFTY50"
    ))
  );
  const safeSubmitIndex = exactMatches.length === 1
    ? exactMatches[0]
    : suggestions.length === 1 ? suggestions[0] : undefined;

  const selectIndex = (index: IndexDetails) => {
    addIndex(index.key);
    setQuery("");
  };

  return (
    <div className="flex min-h-9 shrink-0 items-center gap-1 overflow-x-auto bg-aveon-panel px-2">
      {selectedIndices.map((index) => {
        const quote = index.feedKey ? quotesByToken[index.feedKey] : undefined;
        const tone = quote ? pnlTone(quote.change) : "neutral";
        const toneClass = tone === "buy"
          ? "text-aveon-buy"
          : tone === "sell"
            ? "text-aveon-sell"
            : "text-aveon-muted";

        return (
          <div
            key={index.key}
            className="relative flex h-8 shrink-0 items-center gap-2 overflow-hidden border-r border-aveon-border px-3 pr-4 text-xs"
            style={{ width: itemWidths[index.key] ?? DEFAULT_INDEX_WIDTH }}
            title={index.feedKey ? undefined : "Live feed mapping is not configured for this index segment."}
          >
            <span className="min-w-0 flex-1 truncate whitespace-nowrap font-medium">{displayIndexName(index)}</span>
            <span className="shrink-0 whitespace-nowrap font-semibold">
              {quote ? formatNumber(quote.ltp) : "—"}
            </span>
            {quote && (
              <>
                <span className={`shrink-0 whitespace-nowrap ${toneClass}`}>
                  {quote.change >= 0 ? "+" : ""}{formatNumber(quote.change)}
                </span>
                <span className={`shrink-0 whitespace-nowrap ${toneClass}`}>
                  {quote.change_percent >= 0 ? "+" : ""}{formatNumber(quote.change_percent)}%
                </span>
              </>
            )}
            <button
              type="button"
              onClick={() => removeIndex(index.key)}
              title={`Remove ${displayIndexName(index)}`}
              aria-label={`Remove ${displayIndexName(index)}`}
              className="shrink-0 text-aveon-muted hover:text-aveon-sell"
            >
              <X size={12} />
            </button>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label={`Resize ${displayIndexName(index)} width`}
              title="Drag to resize"
              className="absolute right-0 top-1 h-6 w-1.5 cursor-col-resize touch-none rounded bg-aveon-border/70 hover:bg-aveon-primary"
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                resizeRef.current = {
                  key: index.key,
                  startX: event.clientX,
                  startWidth: itemWidths[index.key] ?? DEFAULT_INDEX_WIDTH,
                };
              }}
              onPointerMove={(event) => handleResizeMove(event, index.key)}
              onPointerUp={finishResize}
              onPointerCancel={finishResize}
            />
          </div>
        );
      })}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          // Never silently add the first fuzzy match (e.g. NIFTY BANK).
          if (safeSubmitIndex) selectIndex(safeSubmitIndex);
        }}
        className="relative flex shrink-0 items-center gap-1 px-2"
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setQuery("");
          }}
          placeholder={loading ? "Loading indices…" : "Search index"}
          disabled={loading || catalogue.length === 0}
          className="w-28 bg-transparent text-xs outline-none placeholder:text-aveon-muted"
          aria-label="Search indices"
          aria-autocomplete="list"
        />
        <button
          type="submit"
          aria-label="Add matching index"
          disabled={!safeSubmitIndex}
          className="text-aveon-primary disabled:opacity-40"
        >
          <Plus size={14} />
        </button>
        {query.trim() && suggestions.length > 0 && (
          <div className="absolute left-0 top-full z-50 mt-1 max-h-64 w-64 overflow-y-auto rounded-md border border-aveon-border bg-aveon-panel py-1 shadow-xl">
            {suggestions.map((index) => (
              <button
                type="button"
                key={index.key}
                onClick={() => selectIndex(index)}
                className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-aveon-panel2"
              >
                <span className="min-w-0">
                  <span className="block font-medium">{index.sIndex}</span>
                  <span className="block truncate text-aveon-muted">{index.sIndexDesc}</span>
                </span>
                {!index.feedKey && (
                  <span className="shrink-0 text-[10px] text-aveon-muted">No feed map</span>
                )}
              </button>
            ))}
          </div>
        )}
      </form>
      {error && selectedIndices.length === 0 && (
        <span className="shrink-0 text-[11px] text-aveon-sell" title={error}>Index data unavailable</span>
      )}
    </div>
  );
}
