"use client";

export type LastMarketQuote = {
  ltp: number;
  receivedAt: number;
  tradingSymbol?: string;
};

const STORAGE_KEY = "aveon_market_quote_cache_v1";
const MAX_ENTRIES = 5000;

type QuoteCache = Record<string, LastMarketQuote>;

function readCache(): QuoteCache {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as QuoteCache : {};
  } catch {
    return {};
  }
}

export function getLastMarketQuote(tokenKey: string | null | undefined): LastMarketQuote | null {
  if (!tokenKey) return null;
  const quote = readCache()[tokenKey];
  if (!quote || !Number.isFinite(Number(quote.ltp)) || Number(quote.ltp) <= 0 || !Number.isFinite(Number(quote.receivedAt))) return null;
  return { ltp: Number(quote.ltp), receivedAt: Number(quote.receivedAt), tradingSymbol: quote.tradingSymbol };
}

export function saveLastMarketQuote(tokenKey: string, quote: LastMarketQuote): void {
  if (typeof window === "undefined" || !tokenKey || !Number.isFinite(quote.ltp) || quote.ltp <= 0) return;
  try {
    const cache = readCache();
    cache[tokenKey] = { ...quote, receivedAt: Number.isFinite(quote.receivedAt) ? quote.receivedAt : Date.now() };
    const entries = Object.entries(cache).sort((a, b) => b[1].receivedAt - a[1].receivedAt).slice(0, MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Storage may be disabled or full; live streaming must continue unaffected.
  }
}
