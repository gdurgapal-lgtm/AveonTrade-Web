import { normalizeInstrument, type Instrument } from "@/types/trading";
import { PREDEFINED_WATCHLIST_GROUPS, WatchlistConstituent } from "@/data/predefinedWatchlists";

const WATCHLIST_TOKEN_CACHE = "aveontrade.predefined.watchlist.cache.v3";

// Helper to normalize symbol strings for comparison (removes hyphens, spaces, ampersands, case)
function cleanSymbol(sym: string): string {
  if (!sym) return "";
  return sym.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function resolvePredefinedWatchlist(watchlistId: string): Promise<Instrument[]> {
  const group = PREDEFINED_WATCHLIST_GROUPS.find((g) => g.id === watchlistId);
  if (!group) return [];

  let cachedMap: Record<string, Instrument> = {};
  try {
    const raw = window.localStorage.getItem(WATCHLIST_TOKEN_CACHE);
    if (raw) cachedMap = JSON.parse(raw);
  } catch (e) {
    console.error("Cache load error", e);
  }

  const resolved: Instrument[] = [];
  const missing: WatchlistConstituent[] = [];

  group.items.forEach((item) => {
    if (cachedMap[item.symbol]) {
      resolved.push(cachedMap[item.symbol]);
    } else {
      missing.push(item);
    }
  });

  if (missing.length > 0) {
    await Promise.all(
      missing.map(async (item) => {
        try {
          const res = await fetch(`/api/broker/scrip-lookup?q=${encodeURIComponent(item.symbol)}`, { credentials: "include" });
          const json = await res.json();
          const hits = json?.data?.result?.hits?.hits ?? json?.data?.hits?.hits ?? json?.data?.result ?? json?.data ?? [];
          const hitsArray = Array.isArray(hits) ? hits : [hits];

          const targetClean = cleanSymbol(item.symbol);

          // STRICT DUAL MATCH with resilient symbol cleaning (handles BAJAJ-AUTO vs BAJAJAUTO, etc.)
          const strictHit = hitsArray.find((h) => {
            const source = h?._source || h;
            const apiSym1 = cleanSymbol(source?.sSymbolnew);
            const apiSym2 = cleanSymbol(source?.sSymbol);
            
            const symMatch = (apiSym1 === targetClean) || (apiSym2 === targetClean);
            
            // Must strictly match the requested exchange segment (e.g., "NSE_EQ")
            const exchMatch = (source?.ExchangeSegment === item.exchange) || 
                              (source?.sExchange === item.exchange) ||
                              (item.exchange === "NSE_EQ" && source?.MktSegId === 1);

            return symMatch && exchMatch;
          });

          const match = strictHit?._source || strictHit;

          if (match) {
            const inst = normalizeInstrument(match) as Instrument & { sector?: string; companyName?: string };
            inst.companyName = item.companyName;
            inst.sector = item.sector;
            if (!inst.symbol) inst.symbol = item.symbol;
            if (!inst.tradingSymbol) inst.tradingSymbol = item.symbol;
            
            cachedMap[item.symbol] = inst as Instrument;
            resolved.push(inst as Instrument);
          } else {
            console.warn(`[WatchlistLoader] Strict segment match failed: Dropping ${item.symbol} for exchange ${item.exchange} (No matching NSE segment found in lookup).`);
          }
        } catch (err) {
          console.error(`Scrip lookup failed for predefined symbol ${item.symbol}:`, err);
        }
      })
    );

    try {
      window.localStorage.setItem(WATCHLIST_TOKEN_CACHE, JSON.stringify(cachedMap));
    } catch (e) {
      console.error("Cache save error", e);
    }
  }

  return resolved;
}