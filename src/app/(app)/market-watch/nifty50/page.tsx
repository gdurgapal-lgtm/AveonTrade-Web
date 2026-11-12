"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Card, Badge } from "@/components/ui/Primitives";
import { NIFTY_50_CONSTITUENTS, NiftyConstituent } from "@/data/nifty50";
import { TrendingUp, TrendingDown, ArrowUpDown, Loader2, BarChart3, Filter } from "lucide-react";
import { useMarketStream } from "@/hooks/useMarketStream";
import { normalizeInstrument, feedToken, exchangeSegmentFor, isIndexInstrument, type Instrument, type ProductType, type TransactionType, type OrderKind } from "@/types/trading";
import OrderTicketModal from "@/components/market/OrderTicketModal";
import TradingShortcutModal, { type TradingShortcutPanel } from "@/components/market/TradingShortcutModal";

interface ResolvedNiftyConstituent extends NiftyConstituent {
  instrument?: Instrument;
  restLtp?: number;
  restChange?: number;
  restChangePercent?: number;
  loading: boolean;
}

const NIFTY_CACHE_KEY = "aveontrade.nifty50.token.cache.v1";
type SortKey = "symbol" | "sector" | "ltp" | "changePercent" | "weightage" | "estPoints";

// --- Reconciliation / feed-health tuning -----------------------------------
const STOCK_LAG_MS = 1000;        // index ticks ~5ms, stocks ~1s: compare against index as it was ~1s ago
const RESIDUAL_WARN_PTS = 5;      // GAP chip appears when |gap| goes above this
const RESIDUAL_CLEAR_PTS = 3;     // ...and only disappears once |gap| falls below this (stops flicker)
const GAP_ALWAYS_VISIBLE = false; // true = always show the GAP chip (muted when small, amber when large)
const FEED_DELAYED_SEC = 5;       // no constituent tick for this long -> DELAYED
const FEED_STALE_SEC = 15;        // ... -> STALE
const SORT_REFRESH_TICKS = 3;     // live-sorted columns re-order at most every N seconds

function compactUpper(value: string): string {
  return value.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

/**
 * Previous close for a quote. quote.close can be clobbered by ltp when a tick
 * carries no close field, so if close === ltp but change != 0, trust ltp - change.
 */
function derivePrevClose(quote: any, ltp: number): number {
  if (!quote || !(ltp > 0)) return 0;
  const close = Number(quote.close) || 0;
  const change = Number(quote.change ?? quote.net_change) || 0;
  if (close > 0 && (Math.abs(close - ltp) > 1e-9 || change === 0)) return close;
  return change !== 0 ? ltp - change : close;
}

export default function Nifty50AnalyzerPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSector, setSelectedSector] = useState("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("weightage");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [resolvedConstituents, setResolvedConstituents] = useState<ResolvedNiftyConstituent[]>([]);
  const [resolving, setResolving] = useState(true);

  // Keyboard navigation & container refs
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const sectorContainerRef = useRef<HTMLDivElement | null>(null);

  // Terminal state for Order Entry and Shortcut Panels (F3, F5, F6, F8)
  const [orderEntryOpen, setOrderEntryOpen] = useState(false);
  const [activeOrderInstrument, setActiveOrderInstrument] = useState<Instrument | null>(null);
  const [depthOrder, setDepthOrder] = useState<{ side: TransactionType; price?: number; quantity?: number; productType?: ProductType; orderKind?: OrderKind } | null>(null);
  const [shortcutPanel, setShortcutPanel] = useState<TradingShortcutPanel | null>(null);
  const [cashPair, setCashPair] = useState<Instrument[]>([]);

  // NIFTY 50 index instrument (previous close + live value come from the feed, not a constant)
  const [indexInstrument, setIndexInstrument] = useState<Instrument | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [orderTick, setOrderTick] = useState(0);
  const tablePausedRef = useRef(false);
  const seenQuotesRef = useRef<Map<string, { q: unknown; t: number }>>(new Map());
  const lastStockTickRef = useRef(0);
  const idxBufRef = useRef<{ t: number; ltp: number }[]>([]);
  const lastIdxQuoteRef = useRef<unknown>(null);
  const gapWarnRef = useRef(false);

  // Instant local cache loading with background differential synchronization
  useEffect(() => {
    let cancelled = false;

    async function initializeScrips() {
      setResolving(true);
      let cachedMap: Record<string, Instrument> = {};
      
      try {
        const rawCache = window.localStorage.getItem(NIFTY_CACHE_KEY);
        if (rawCache) {
          cachedMap = JSON.parse(rawCache);
        }
      } catch (err) {
        console.error("Failed to parse Nifty 50 local cache:", err);
      }

      const missingSymbols = NIFTY_50_CONSTITUENTS.filter((item) => !cachedMap[item.symbol]);

      if (missingSymbols.length === 0 && Object.keys(cachedMap).length > 0) {
        const initialList = NIFTY_50_CONSTITUENTS.map((item) => ({
          ...item,
          instrument: cachedMap[item.symbol],
          loading: false,
        }));
        if (!cancelled) {
          setResolvedConstituents(initialList);
          setResolving(false);
        }
        return;
      }

      if (Object.keys(cachedMap).length > 0) {
        const partialList = NIFTY_50_CONSTITUENTS.map((item) => ({
          ...item,
          instrument: cachedMap[item.symbol],
          loading: !cachedMap[item.symbol],
        }));
        if (!cancelled) {
          setResolvedConstituents(partialList);
          setResolving(false);
        }
      }

      const newlyResolved = { ...cachedMap };
      await Promise.all(
        missingSymbols.map(async (item) => {
          try {
            const res = await fetch(`/api/broker/scrip-lookup?q=${encodeURIComponent(item.symbol)}`, { credentials: "include" });
            const json = await res.json();
            const hits = json?.data?.result?.hits?.hits ?? json?.data?.hits?.hits ?? json?.data?.result ?? json?.data ?? [];
            const rawHit = Array.isArray(hits) ? hits[0] : hits;
            const match = rawHit?._source || rawHit;

            if (match) {
              const inst = normalizeInstrument(match);
              inst.companyName = item.companyName;
              if (!inst.symbol) inst.symbol = item.symbol;
              if (!inst.tradingSymbol) inst.tradingSymbol = item.symbol;
              newlyResolved[item.symbol] = inst;
            }
          } catch (err) {
            console.error(`Failed to resolve token for ${item.symbol}:`, err);
          }
        })
      );

      try {
        window.localStorage.setItem(NIFTY_CACHE_KEY, JSON.stringify(newlyResolved));
      } catch (err) {
        console.error("Failed to save Nifty 50 token cache:", err);
      }

      if (!cancelled) {
        const updatedList = NIFTY_50_CONSTITUENTS.map((item) => ({
          ...item,
          instrument: newlyResolved[item.symbol],
          loading: false,
        }));
        setResolvedConstituents(updatedList);
        setResolving(false);
      }
    }

    initializeScrips();
    return () => {
      cancelled = true;
    };
  }, []);

  // Resolve the NIFTY 50 index itself (same lookup approach as MarketIndexStrip)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const q of ["NIFTY 50", "NIFTY"]) {
        try {
          const res = await fetch(`/api/broker/scrip-lookup?q=${encodeURIComponent(q)}`, { credentials: "include" });
          const json = await res.json();
          const hits = json?.data?.result?.hits?.hits ?? json?.data?.hits?.hits ?? [];
          const candidates: Instrument[] = hits.map((hit: Record<string, unknown>) => normalizeInstrument(hit));
          const found = candidates.find(
            (i) => i.isIndex && i.token && ["NIFTY", "NIFTY50"].includes(compactUpper(i.tradingSymbol || i.symbol || ""))
          );
          if (found) {
            if (!cancelled) setIndexInstrument(found);
            return;
          }
        } catch {
          /* try next query */
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 1s clock: feed-age display + throttled re-sorting of live columns
  useEffect(() => {
    let n = 0;
    const id = setInterval(() => {
      setNow(Date.now());
      n += 1;
      if (!tablePausedRef.current && n % SORT_REFRESH_TICKS === 0) setOrderTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const instrumentsList = useMemo(() => {
    if (resolving && resolvedConstituents.length === 0) return [];
    const list = resolvedConstituents.filter((c) => c.instrument && c.instrument.token).map((c) => c.instrument!);
    if (indexInstrument) list.push(indexInstrument);
    return list;
  }, [resolving, resolvedConstituents, indexInstrument]);

  const { quotes, quotesByToken, connected } = useMarketStream(instrumentsList, activeOrderInstrument, cashPair);

  // Index quote: previous close + live value (index ticks arrive far faster than stock ticks)
  const indexQuote = indexInstrument ? quotesByToken[feedToken(indexInstrument) ?? ""] : undefined;
  const idxLtp = Number(indexQuote?.ltp) || 0;
  const idxPrev = derivePrevClose(indexQuote, idxLtp);
  const indexReady = idxPrev > 0;

  // Keep a short history of index values so we can compare against the index "as of" the stock snapshot
  useEffect(() => {
    if (!indexQuote || indexQuote === lastIdxQuoteRef.current) return;
    lastIdxQuoteRef.current = indexQuote;
    const t = Date.now();
    const ltp = Number(indexQuote.ltp) || 0;
    if (ltp > 0) {
      idxBufRef.current.push({ t, ltp });
      idxBufRef.current = idxBufRef.current.filter((x) => t - x.t < 5000);
    }
  }, [indexQuote]);

  // Stamp the arrival time of each constituent's quote (identity changes only when a tick is applied)
  useEffect(() => {
    const t = Date.now();
    for (const c of resolvedConstituents) {
      const k = c.instrument ? feedToken(c.instrument) : undefined;
      const q = k ? quotesByToken[k] : undefined;
      if (!k || !q) continue;
      const seen = seenQuotesRef.current.get(k);
      if (!seen || seen.q !== q) {
        seenQuotesRef.current.set(k, { q, t });
        lastStockTickRef.current = t;
      }
    }
  }, [quotesByToken, resolvedConstituents]);

  // Map live streaming quotes by token and symbol; change is derived from previous close
  const liveData = useMemo(() => {
    return resolvedConstituents.map((c) => {
      const inst = c.instrument;
      const tokenKey = inst ? feedToken(inst) : "";
      const altTokenKey = inst?.token ? `${exchangeSegmentFor(inst) || 1}_${inst.token}` : "";

      const quote =
        (tokenKey ? quotesByToken[tokenKey] : undefined) ||
        (altTokenKey ? quotesByToken[altTokenKey] : undefined) ||
        (inst?.tradingSymbol ? quotes[inst.tradingSymbol] : undefined) ||
        (inst?.symbol ? quotes[inst.symbol] : undefined) ||
        quotes[c.symbol];

      // Only a real traded price counts as live; never substitute close for ltp
      const ltp = Number(quote?.ltp) || 0;
      const prevClose = derivePrevClose(quote, ltp);
      const change = ltp > 0 && prevClose > 0 ? ltp - prevClose : 0;
      const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
      const live = ltp > 0 && prevClose > 0;
      // k = index points per Rs 1 move. It is a calibrated constant (data/nifty50.ts) that stays valid between
      // rebalances; a stock without one (seed weight only) is calibrated here from its seed weight and live prev close.
      const k = c.indexPtsPerRupee ?? (indexReady && prevClose > 0 ? (c.weightage * idxPrev) / prevClose : 0);
      const pts = live ? k * change : 0;
      const weight = live && idxLtp > 0 && k > 0 ? (k * ltp) / idxLtp : c.weightage; // live weight, like exchange tables

      return { ...c, ltp, change, changePercent, prevClose, live, pts, weight };
    });
  }, [resolvedConstituents, quotes, quotesByToken, idxPrev, idxLtp, indexReady]);

  const sectors = useMemo(() => {
    return ["ALL", ...Array.from(new Set(NIFTY_50_CONSTITUENTS.map((c) => c.sector)))];
  }, []);

  // Calculate sector-wise performance attribution
  const sectorAttribution = useMemo(() => {
    const map: Record<string, { totalWeight: number; netPoints: number; constituentCount: number }> = {};
    liveData.forEach((c) => {
      if (!map[c.sector]) {
        map[c.sector] = { totalWeight: 0, netPoints: 0, constituentCount: 0 };
      }
      map[c.sector].totalWeight += c.weight;
      map[c.sector].netPoints += c.pts;
      map[c.sector].constituentCount += 1;
    });

    return Object.entries(map)
      .map(([sector, data]) => ({ sector, ...data }))
      .sort((a, b) => b.netPoints - a.netPoints);
  }, [liveData]);

  // Row ORDER is decided from a snapshot that refreshes every few seconds (and is paused while the
  // mouse is over the table), so rows don't jump under the cursor next to BUY/SELL. Values stay live.
  const liveRef = useRef(liveData);
  liveRef.current = liveData;
  const orderedSymbols = useMemo(() => {
    let list = [...liveRef.current];
    if (searchTerm.trim()) {
      const q = searchTerm.toUpperCase();
      list = list.filter(
        (c) => c.symbol.toUpperCase().includes(q) || c.companyName.toUpperCase().includes(q) || c.sector.toUpperCase().includes(q)
      );
    }
    if (selectedSector !== "ALL") {
      list = list.filter((c) => c.sector === selectedSector);
    }
    list.sort((a, b) => {
      let valA: string | number = 0;
      let valB: string | number = 0;
      if (sortKey === "symbol") { valA = a.symbol; valB = b.symbol; }
      else if (sortKey === "sector") { valA = a.sector; valB = b.sector; }
      else if (sortKey === "ltp") { valA = a.ltp; valB = b.ltp; }
      else if (sortKey === "changePercent") { valA = a.changePercent; valB = b.changePercent; }
      else if (sortKey === "weightage") { valA = a.weight; valB = b.weight; }
      else if (sortKey === "estPoints") { valA = a.pts; valB = b.pts; }
      if (typeof valA === "string" && typeof valB === "string") {
        return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortOrder === "asc" ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });
    return list.map((c) => c.symbol);
    // liveData.length: re-run once constituents load; orderTick: periodic refresh
  }, [orderTick, liveData.length, searchTerm, selectedSector, sortKey, sortOrder]);

  const filteredAndSorted = useMemo(() => {
    const bySymbol = new Map(liveData.map((c) => [c.symbol, c]));
    return orderedSymbols.map((s) => bySymbol.get(s)).filter((c): c is NonNullable<typeof c> => !!c);
  }, [orderedSymbols, liveData]);

  // Selection follows the SYMBOL, not a row position, so F1/F2 never hit a different stock after a re-sort
  const selectedIndex = Math.max(0, filteredAndSorted.findIndex((c) => c.symbol === selectedSymbol));

  // Keep active order instrument synced & scroll strictly within container without sticky header overlap
  useEffect(() => {
    if (filteredAndSorted.length > 0) {
      const target = filteredAndSorted[selectedIndex] || filteredAndSorted[0];
      if (target?.instrument) {
        setActiveOrderInstrument(target.instrument);
      }
      const container = tableContainerRef.current;
      const row = rowRefs.current[selectedIndex];
      if (container && row) {
        const headerHeight = 38;
        const rowTop = row.offsetTop;
        const rowBottom = rowTop + row.offsetHeight;
        const scrollTop = container.scrollTop;
        const scrollBottom = scrollTop + container.clientHeight;

        if (rowTop - headerHeight < scrollTop) {
          container.scrollTop = Math.max(0, rowTop - headerHeight - 6);
        } else if (rowBottom > scrollBottom) {
          container.scrollTop = rowBottom - container.clientHeight + 6;
        }
      }
    }
  }, [selectedIndex, filteredAndSorted]);

  // Trigger local order ticket modal
  const handleOpenOrderTicket = (constituent: ResolvedNiftyConstituent, side: TransactionType) => {
    if (constituent.instrument) {
      if (isIndexInstrument(constituent.instrument)) {
        window.alert("Indices Instruments are non-tradable");
        return;
      }
      setActiveOrderInstrument(constituent.instrument);
      setDepthOrder({ side });
      setOrderEntryOpen(true);
    }
  };

  // Terminal Institutional Hotkeys & Arrow Key Navigation
  useEffect(() => {
    const handleHotkeys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

      if (event.key === "Escape") {
        if (shortcutPanel) { event.preventDefault(); setShortcutPanel(null); return; }
        if (orderEntryOpen) { event.preventDefault(); setOrderEntryOpen(false); setDepthOrder(null); return; }
      }

      if (sectorContainerRef.current && sectorContainerRef.current.contains(target)) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedSymbol(filteredAndSorted[Math.min(filteredAndSorted.length - 1, selectedIndex + 1)]?.symbol ?? null);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedSymbol(filteredAndSorted[Math.max(0, selectedIndex - 1)]?.symbol ?? null);
        return;
      }

      if (typing) return;

      const targetInst = activeOrderInstrument || filteredAndSorted[selectedIndex]?.instrument;
      if (event.key === "F1" || event.key === "+" || event.key === "=") {
        event.preventDefault();
        if (targetInst && !isIndexInstrument(targetInst)) {
          setActiveOrderInstrument(targetInst);
          setDepthOrder({ side: "BUY" });
          setOrderEntryOpen(true);
        }
      } else if (event.key === "F2" || event.key === "-") {
        event.preventDefault();
        if (targetInst && !isIndexInstrument(targetInst)) {
          setActiveOrderInstrument(targetInst);
          setDepthOrder({ side: "SELL" });
          setOrderEntryOpen(true);
        }
      } else if (event.key === "F3") { event.preventDefault(); setShortcutPanel("ORDER_BOOK"); }
      else if (event.key === "F5") { event.preventDefault(); setShortcutPanel("MARKET_DEPTH"); }
      else if (event.key === "F6") { event.preventDefault(); setShortcutPanel("NET_POSITION"); }
      else if (event.key === "F8") { event.preventDefault(); setShortcutPanel("TRADE_BOOK"); }
    };

    window.addEventListener("keydown", handleHotkeys);
    return () => window.removeEventListener("keydown", handleHotkeys);
  }, [activeOrderInstrument, filteredAndSorted, selectedIndex, shortcutPanel, orderEntryOpen]);

  const estimatedIndexPoints = liveData.reduce((acc, c) => acc + c.pts, 0); // net contribution
  const totalWeightedChange = indexReady ? (estimatedIndexPoints / idxPrev) * 100 : 0; // as % of the index
  const positivePoints = liveData.reduce((acc, c) => acc + (c.pts > 0 ? c.pts : 0), 0);
  const negativePoints = liveData.reduce((acc, c) => acc + (c.pts < 0 ? c.pts : 0), 0);
  const pullersCount = liveData.filter((c) => c.pts > 0).length;
  const draggersCount = liveData.filter((c) => c.pts < 0).length;
  const liveCount = liveData.filter((c) => c.live).length;
  const totalCount = NIFTY_50_CONSTITUENTS.length;

  // Index as it was ~STOCK_LAG_MS ago, to line up with 1s stock ticks (falls back to the live value)
  const idxAligned =
    [...idxBufRef.current].reverse().find((x) => x.t <= now - STOCK_LAG_MS)?.ltp ?? idxLtp;
  const actualPoints = indexReady ? idxLtp - idxPrev : 0;
  const actualPointsAligned = indexReady ? idxAligned - idxPrev : 0;
  const residual = actualPointsAligned - estimatedIndexPoints;
  const residualRaw = actualPoints - estimatedIndexPoints;
  // Hysteresis: turn on above WARN, turn off only below CLEAR, so a gap hovering near the limit doesn't flicker
  if (!indexReady) gapWarnRef.current = false;
  else if (Math.abs(residual) > RESIDUAL_WARN_PTS) gapWarnRef.current = true;
  else if (Math.abs(residual) < RESIDUAL_CLEAR_PTS) gapWarnRef.current = false;
  const residualWarn = indexReady && (gapWarnRef.current || liveCount < totalCount);

  const lastTickAt = lastStockTickRef.current;
  const feedAgeSec = lastTickAt ? Math.max(0, now - lastTickAt) / 1000 : null;
  const feedState: "caching" | "disconnected" | "stale" | "delayed" | "live" =
    resolving && resolvedConstituents.length === 0 ? "caching"
    : !connected ? "disconnected"
    : feedAgeSec === null || feedAgeSec > FEED_STALE_SEC ? "stale"
    : feedAgeSec > FEED_DELAYED_SEC ? "delayed"
    : "live";
  const feedDot = { caching: "bg-amber-500 animate-ping", disconnected: "bg-rose-500", stale: "bg-rose-500", delayed: "bg-amber-500", live: "bg-emerald-500 animate-pulse" }[feedState];
  const fmtSigned = (v: number, d = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}`;

  const topPullers = useMemo(() => {
    return [...liveData]
      .filter((c) => c.changePercent > 0)
      .sort((a, b) => b.pts - a.pts)
      .slice(0, 4);
  }, [liveData]);

  const topDraggers = useMemo(() => {
    return [...liveData]
      .filter((c) => c.changePercent < 0)
      .sort((a, b) => a.pts - b.pts)
      .slice(0, 4);
  }, [liveData]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
  };

  const selectedQuote = activeOrderInstrument ? quotes[activeOrderInstrument.tradingSymbol] || quotes[activeOrderInstrument.symbol] : undefined;

  return (
    <div className="flex flex-col h-full space-y-2 text-aveon-text font-sans">
      {/* Compact Header & Terminal Telemetry */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between shrink-0 pb-1">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold tracking-tight text-aveon-text font-mono">NIFTY 50 INDEX ANALYZER</h1>
          <div className="text-[10px] px-2 py-0.5 rounded font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono">CAP-WEIGHTED</div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-aveon-panel px-2.5 py-1 rounded-md border border-aveon-border" title={feedAgeSec !== null ? `Last constituent tick ${feedAgeSec.toFixed(0)}s ago` : "No constituent ticks yet"}>
            <span className={`h-2 w-2 rounded-full ${feedDot}`} />
            <span className="text-[11px] font-mono font-medium text-aveon-muted">
              {feedState.toUpperCase()} {liveCount}/{totalCount}
              {feedAgeSec !== null && feedState !== "caching" ? ` · ${feedAgeSec.toFixed(0)}s` : ""}
            </span>
          </div>

          <div className="font-mono flex items-center gap-2">
            {indexReady ? (
              <>
                <div className="text-xs px-2.5 py-1 rounded font-semibold border bg-emerald-500/15 text-emerald-400 border-emerald-500/30" title={`Sum of contributions from stocks pulling the index up (${pullersCount})`}>
                  POSITIVE: {fmtSigned(positivePoints)} <span className="font-normal opacity-80">({pullersCount})</span>
                </div>
                <div className="text-xs px-2.5 py-1 rounded font-semibold border bg-rose-500/15 text-rose-400 border-rose-500/30" title={`Sum of contributions from stocks dragging the index down (${draggersCount})`}>
                  NEGATIVE: {fmtSigned(negativePoints)} <span className="font-normal opacity-80">({draggersCount})</span>
                </div>
                <div className={`text-xs px-2.5 py-1 rounded font-semibold border ${estimatedIndexPoints >= 0 ? "text-emerald-400 border-emerald-500/30" : "text-rose-400 border-rose-500/30"} bg-aveon-panel`} title={`Positive + negative. Weighted change ${fmtSigned(totalWeightedChange)}%`}>
                  NET: {fmtSigned(estimatedIndexPoints)} pts
                </div>
                {(residualWarn || GAP_ALWAYS_VISIBLE) && (
                  <div
                    className={`text-xs px-2.5 py-1 rounded font-semibold border ${residualWarn ? "bg-amber-500/15 text-amber-400 border-amber-500/30" : "bg-aveon-panel text-aveon-muted border-aveon-border"}`}
                    title={`Index moved ${fmtSigned(actualPointsAligned)} pts but stocks explain ${fmtSigned(estimatedIndexPoints)}. Gap ${fmtSigned(residual)} pts (raw, unaligned: ${fmtSigned(residualRaw)}). ${liveCount < totalCount ? `${totalCount - liveCount} constituent(s) have no live price. ` : ""}Check weights and feed.`}
                  >
                    GAP {fmtSigned(residual)}
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs px-2.5 py-1 rounded font-semibold border border-aveon-border text-aveon-muted bg-aveon-panel">WAITING FOR NIFTY INDEX QUOTE</div>
            )}
          </div>
        </div>
      </div>

      {resolving && resolvedConstituents.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-20 bg-aveon-panel border-aveon-border shadow-sm">
          <Loader2 size={32} className="animate-spin text-aveon-primary mb-3" />
          <p className="text-xs font-semibold text-aveon-text font-mono">Loading Nifty 50 Scrip Master from Local Cache...</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start flex-1 min-h-0">
          
          {/* LEFT COLUMN: Master Constituents Table & Filters (Span 8) */}
          <div className="lg:col-span-8 flex flex-col space-y-2 h-full min-h-0">
            
            {/* Search & Sector Dropdown Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-aveon-panel p-2.5 rounded-lg border border-aveon-border shadow-sm shrink-0">
              <input
                type="text"
                placeholder="Search symbol (e.g. RELIANCE, HDFCBANK)..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setSelectedSymbol(null); }}
                className="w-full sm:w-64 rounded-md border border-aveon-border bg-aveon-panel2 text-aveon-text px-3 py-1.5 text-xs font-mono outline-none focus:border-aveon-primary placeholder:text-aveon-muted shadow-sm"
              />

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="flex items-center gap-1 text-xs text-aveon-muted font-mono whitespace-nowrap">
                  <Filter size={12} /> Sector:
                </div>
                <select
                  value={selectedSector}
                  onChange={(e) => { setSelectedSector(e.target.value); setSelectedSymbol(null); }}
                  style={{ colorScheme: "dark light" }}
                  className="w-full sm:w-48 rounded-md border border-aveon-border bg-aveon-panel2 text-aveon-text px-2.5 py-1.5 text-xs font-mono outline-none focus:border-aveon-primary cursor-pointer shadow-sm"
                >
                  <option value="ALL" className="bg-aveon-panel2 text-aveon-text">All Sectors ({totalCount})</option>
                  {sectors.filter(s => s !== "ALL").map((s) => (
                    <option key={s} value={s} className="bg-aveon-panel2 text-aveon-text">{s}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Clean Table with Dynamic Green/Red LTP & Prominent Prices */}
            <div className="rounded-aveon border border-aveon-border bg-aveon-panel overflow-hidden shadow-sm flex-1 flex flex-col min-h-0">
              <div ref={tableContainerRef} onMouseEnter={() => { tablePausedRef.current = true; }} onMouseLeave={() => { tablePausedRef.current = false; }} className="overflow-x-auto h-full overflow-y-auto scrollbar-thin relative">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-20 border-b border-aveon-border text-left text-aveon-muted bg-aveon-panel font-mono uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold cursor-pointer hover:text-aveon-text transition-colors" onClick={() => toggleSort("symbol")}>
                        Symbol / Company <ArrowUpDown size={11} className={`inline ml-1 ${sortKey === "symbol" ? "text-aveon-primary" : ""}`} />
                      </th>
                      <th className="px-3 py-2.5 font-semibold cursor-pointer hover:text-aveon-text transition-colors" onClick={() => toggleSort("sector")}>
                        Sector <ArrowUpDown size={11} className={`inline ml-1 ${sortKey === "sector" ? "text-aveon-primary" : ""}`} />
                      </th>
                      <th className="px-3 py-2.5 font-semibold text-right cursor-pointer hover:text-aveon-text transition-colors" onClick={() => toggleSort("ltp")}>
                        LTP (₹) <ArrowUpDown size={11} className={`inline ml-1 ${sortKey === "ltp" ? "text-aveon-primary" : ""}`} />
                      </th>
                      <th className="px-3 py-2.5 font-semibold text-right cursor-pointer hover:text-aveon-text transition-colors" onClick={() => toggleSort("changePercent")}>
                        Net Change / (%) <ArrowUpDown size={11} className={`inline ml-1 ${sortKey === "changePercent" ? "text-aveon-primary" : ""}`} />
                      </th>
                      <th className="px-3 py-2.5 font-semibold text-right cursor-pointer hover:text-aveon-text transition-colors" onClick={() => toggleSort("weightage")}>
                        Weight (%) <ArrowUpDown size={11} className={`inline ml-1 ${sortKey === "weightage" ? "text-aveon-primary" : ""}`} />
                      </th>
                      <th className="px-3 py-2.5 font-semibold text-right cursor-pointer hover:text-aveon-text transition-colors" onClick={() => toggleSort("estPoints")}>
                        Est. Points <ArrowUpDown size={11} className={`inline ml-1 ${sortKey === "estPoints" ? "text-aveon-primary" : ""}`} />
                      </th>
                      <th className="px-3 py-2.5 font-semibold text-center">Quick Trade</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono divide-y divide-aveon-border/40">
                    {filteredAndSorted.map((c, i) => {
                      const pts = c.pts;
                      const isPositive = c.changePercent >= 0;
                      const isKeyboardSelected = i === selectedIndex;
                      return (
                        <tr
                          key={c.symbol}
                          ref={(el) => { rowRefs.current[i] = el; }}
                          onClick={() => { setSelectedSymbol(c.symbol); if (c.instrument) setActiveOrderInstrument(c.instrument); }}
                          className={`transition-colors cursor-pointer group ${
                            isKeyboardSelected
                              ? "bg-aveon-primary/25 border-l-4 border-aveon-primary"
                              : "hover:bg-aveon-panel2/60"
                          }`}
                        >
                          <td className="px-4 py-2.5">
                            <div className="font-bold text-aveon-text">{c.symbol}</div>
                            <div className="text-[10px] text-aveon-muted font-sans truncate max-w-[130px]">{c.companyName}</div>
                          </td>
                          <td className="px-3 py-2.5 text-aveon-muted text-[11px] font-sans truncate max-w-[110px]">{c.sector}</td>
                          <td className={`px-3 py-2.5 text-right font-bold text-sm ${c.ltp > 0 ? (isPositive ? "text-emerald-400" : "text-rose-400") : "text-aveon-text"}`}>
                            {c.ltp > 0 ? `₹${c.ltp.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                          </td>
                          <td className={`px-3 py-2.5 text-right font-bold text-sm ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
                            {c.ltp > 0 ? (
                              <div className="flex flex-col items-end">
                                <span>{isPositive ? "+" : ""}₹{c.change.toFixed(2)}</span>
                                <span className="text-[11px] font-semibold">({isPositive ? "+" : ""}{c.changePercent.toFixed(2)}%)</span>
                              </div>
                            ) : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right text-aveon-muted text-xs">
                            <div className="flex items-center justify-end gap-1.5">
                              <span>{(c.weight * 100).toFixed(2)}%</span>
                              <div className="w-8 bg-aveon-panel2 h-1.5 rounded-full overflow-hidden hidden sm:block">
                                <div className="bg-aveon-primary h-full rounded-full" style={{ width: `${Math.min(100, (c.weight * 100) * 8)}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className={`px-3 py-2.5 text-right font-bold text-sm ${pts >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {c.ltp > 0 ? `${pts >= 0 ? "+" : ""}${pts.toFixed(2)}` : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleOpenOrderTicket(c, "BUY")}
                                className="px-2 py-1 rounded bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500 hover:text-white font-bold text-[10px] transition-colors"
                                title="Quick Buy (F1)"
                              >
                                BUY
                              </button>
                              <button
                                onClick={() => handleOpenOrderTicket(c, "SELL")}
                                className="px-2 py-1 rounded bg-rose-500/15 text-rose-400 hover:bg-rose-500 hover:text-white font-bold text-[10px] transition-colors"
                                title="Quick Sell (F2)"
                              >
                                SELL
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Stacked Pullers, Draggers & Sector Attribution Matrix (Span 4) */}
          <div className="lg:col-span-4 space-y-2.5">
            
            {/* Top Index Pullers */}
            <div className="rounded-aveon border border-aveon-border bg-aveon-panel p-3 shadow-sm">
              <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-aveon-border">
                <div className="flex items-center gap-1.5">
                  <TrendingUp size={14} className="text-emerald-400" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-aveon-text font-mono">Top Index Pullers</h2>
                </div>
                <span className="text-[10px] text-emerald-400 font-mono">BULLISH</span>
              </div>

              <div className="space-y-1.5">
                {topPullers.length > 0 ? (
                  topPullers.map((c, i) => {
                    const pts = c.pts;
                    return (
                      <div key={i} className="flex items-center justify-between text-xs py-0.5 font-mono">
                        <div>
                          <div className="font-bold text-aveon-text">{c.symbol}</div>
                          <div className="text-[9px] text-aveon-muted font-sans">{c.companyName}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-emerald-400 font-bold text-sm">+{pts.toFixed(2)} pts</div>
                          <div className="text-[9px] text-aveon-muted">Wtg: {(c.weight * 100).toFixed(1)}%</div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-2 text-center text-xs text-aveon-muted font-mono">
                    No active index pullers (&gt;0%) in flat market.
                  </div>
                )}
              </div>
            </div>

            {/* Top Index Draggers */}
            <div className="rounded-aveon border border-aveon-border bg-aveon-panel p-3 shadow-sm">
              <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-aveon-border">
                <div className="flex items-center gap-1.5">
                  <TrendingDown size={14} className="text-rose-400" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-aveon-text font-mono">Top Index Draggers</h2>
                </div>
                <span className="text-[10px] text-rose-400 font-mono">BEARISH</span>
              </div>

              <div className="space-y-1.5">
                {topDraggers.length > 0 ? (
                  topDraggers.map((c, i) => {
                    const pts = c.pts;
                    return (
                      <div key={i} className="flex items-center justify-between text-xs py-0.5 font-mono">
                        <div>
                          <div className="font-bold text-aveon-text">{c.symbol}</div>
                          <div className="text-[9px] text-aveon-muted font-sans">{c.companyName}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-rose-400 font-bold text-sm">{pts.toFixed(2)} pts</div>
                          <div className="text-[9px] text-aveon-muted">Wtg: {(c.weight * 100).toFixed(1)}%</div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-2 text-center text-xs text-aveon-muted font-mono">
                    No active index draggers (&lt;0%) in flat market.
                  </div>
                )}
              </div>
            </div>

            {/* Sector Attribution Matrix */}
            <div className="rounded-aveon border border-aveon-border bg-aveon-panel p-3 shadow-sm">
              <div className="flex items-center gap-1.5 mb-1.5 pb-1 border-b border-aveon-border">
                <BarChart3 size={14} className="text-aveon-primary" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-aveon-text font-mono">Sector Contribution Matrix</h2>
              </div>
              <div ref={sectorContainerRef} tabIndex={0} className="space-y-1.5 font-mono text-xs max-h-[170px] overflow-y-auto scrollbar-thin outline-none focus:ring-1 focus:ring-aveon-primary/50 rounded">
                {sectorAttribution.map((s, i) => {
                  const isPos = s.netPoints >= 0;
                  return (
                    <div key={i} className="flex items-center justify-between py-0.5 border-b border-aveon-border/40 last:border-0">
                      <div>
                        <div className="font-semibold text-aveon-text text-[11px]">{s.sector}</div>
                        <div className="text-[9px] text-aveon-muted">Weight: {(s.totalWeight * 100).toFixed(1)}% ({s.constituentCount} scrips)</div>
                      </div>
                      <div className={`text-right font-bold text-sm ${isPos ? "text-emerald-400" : "text-rose-400"}`}>
                        {isPos ? "+" : ""}{s.netPoints.toFixed(2)} pts
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Production Order Entry (OE) Ticket Modal */}
      <OrderTicketModal
        open={orderEntryOpen}
        instrument={activeOrderInstrument}
        cashOptions={cashPair}
        quotes={quotes}
        onClose={() => { setOrderEntryOpen(false); setDepthOrder(null); }}
        initialSide={depthOrder?.side ?? "BUY"}
        initialProductType={depthOrder?.productType}
        initialQuantity={depthOrder?.quantity}
        initialPrice={depthOrder?.price}
        initialOrderKind={depthOrder?.orderKind}
      />

      {/* Terminal Shortcut Panels */}
      <TradingShortcutModal
        panel={shortcutPanel}
        instrument={activeOrderInstrument}
        quote={selectedQuote}
        onClose={() => setShortcutPanel(null)}
        onTrade={(request) => {
          if (activeOrderInstrument) {
            setDepthOrder(request ? { side: request.side, price: request.price, quantity: request.quantity, productType: request.productType, orderKind: request.orderKind } : null);
            setOrderEntryOpen(true);
          }
        }}
      />
    </div>
  );
}