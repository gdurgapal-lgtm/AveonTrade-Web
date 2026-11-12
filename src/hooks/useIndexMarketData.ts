"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { WatchlistQuote } from "@/types/trading";
import { indexApiBroadcastSegmentId } from "@/config/marketSegments";

const SELECTED_STORAGE_KEY = "aveon_market_watch_indices_v2";
const LEGACY_STORAGE_KEY = "aveon_market_watch_indices_v1";
const DEFAULT_INDEX_CODES = ["NIFTY", "SENSEX", "BANKNIFTY"];

export interface IndexDetails {
  nMarketSegmentId: number;
  nToken: number;
  sIndex: string;
  sIndexDesc: string;
  nIsDefaultIndex: number;
  cIsIndex: string;
  key: string;
  broadcastSegmentId?: number;
  feedKey?: string;
}

interface IndexMarketState {
  catalogue: IndexDetails[];
  selectedKeys: string[];
  quotesByToken: Record<string, WatchlistQuote>;
  loading: boolean;
  connected: boolean | null;
  error: string | null;
}

const SERVER_STATE: IndexMarketState = {
  catalogue: [],
  selectedKeys: [],
  quotesByToken: {},
  loading: true,
  connected: null,
  error: null,
};

let state = SERVER_STATE;
let initialized = false;
let cataloguePromise: Promise<void> | null = null;
let eventSource: EventSource | null = null;
let feedSignature = "";
const listeners = new Set<() => void>();

function publish(next: IndexMarketState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

function getServerSnapshot() {
  return SERVER_STATE;
}

function compact(value: string) {
  return value.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

function makeIndexKey(apiSegment: number, token: number | string) {
  return `${apiSegment}_${String(token)}`;
}

function parseCatalogue(payload: any): IndexDetails[] {
  const rows = Array.isArray(payload?.result)
    ? payload.result
    : Array.isArray(payload?.data?.result)
      ? payload.data.result
      : Array.isArray(payload?.data)
        ? payload.data
        : [];

  return rows
    .filter((row: any) =>
      String(row?.cIsIndex ?? "").toUpperCase() === "Y" &&
      Number(row?.nMarketSegmentId) > 0 &&
      Number(row?.nToken) > 0 &&
      String(row?.sIndex ?? "").trim()
    )
    .map((row: any) => {
      const apiSegment = Number(row.nMarketSegmentId);
      const token = Number(row.nToken);
      const broadcastSegmentId = indexApiBroadcastSegmentId(apiSegment);
      return {
        nMarketSegmentId: apiSegment,
        nToken: token,
        sIndex: String(row.sIndex).trim(),
        sIndexDesc: String(row.sIndexDesc ?? row.sIndex).trim(),
        nIsDefaultIndex: Number(row.nIsDefaultIndex ?? 0),
        cIsIndex: String(row.cIsIndex),
        key: makeIndexKey(apiSegment, token),
        broadcastSegmentId,
        feedKey: broadcastSegmentId ? `${broadcastSegmentId}_${token}` : undefined,
      };
    });
}

function findDefaultKeys(catalogue: IndexDetails[]) {
  // Defaults must be exact identities. A substring check such as
  // "NIFTY50" matching "NIFTY500" can silently select the wrong index.
  return DEFAULT_INDEX_CODES
    .map((code) => {
      const target = compact(code);
      const match = catalogue.find((item) =>
        compact(item.sIndex) === target || compact(item.sIndexDesc) === target ||
        (code === "NIFTY" && (
          compact(item.sIndex) === "NIFTY50" || compact(item.sIndexDesc) === "NIFTY50"
        ))
      );
      return match?.key;
    })
    .filter((key): key is string => Boolean(key));
}

function loadSavedKeys(catalogue: IndexDetails[]) {
  try {
    const saved = window.localStorage.getItem(SELECTED_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.every((value) => typeof value === "string")) {
        const valid = new Set(catalogue.map((item) => item.key));
        return parsed.filter((key) => valid.has(key));
      }
    }

    // Migrate the previous name-based selection against the API catalogue.
    const legacy = JSON.parse(window.localStorage.getItem(LEGACY_STORAGE_KEY) ?? "null");
    if (Array.isArray(legacy) && legacy.every((value) => typeof value === "string")) {
      const migrated = legacy
        .map((name: string) => {
          const query = compact(name);
          const exact = catalogue.find((item) =>
            compact(item.sIndex) === query || compact(item.sIndexDesc) === query
          );
          if (exact) return exact.key;
          // Only use a prefix fallback when it identifies one unique record.
          const prefixMatches = catalogue.filter((item) =>
            compact(item.sIndex).startsWith(query) || compact(item.sIndexDesc).startsWith(query)
          );
          return prefixMatches.length === 1 ? prefixMatches[0].key : undefined;
        })
        .filter((key: string | undefined): key is string => Boolean(key));
      if (migrated.length) return Array.from(new Set(migrated));
    }
  } catch {
    // Invalid local storage is ignored; defaults are used below.
  }
  return findDefaultKeys(catalogue);
}

function stopFeed() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  feedSignature = "";
}

function syncFeed() {
  if (typeof window === "undefined") return;

  const selected = state.catalogue.filter((item) =>
    state.selectedKeys.includes(item.key) && item.feedKey
  );
  const tokenKeys = Array.from(new Set(selected.map((item) => item.feedKey as string)));
  const signature = tokenKeys.slice().sort().join(",");

  if (signature === feedSignature) return;
  stopFeed();

  if (!signature) {
    publish({ ...state, connected: null });
    return;
  }

  feedSignature = signature;
  const symbolsByFeedKey = new Map<string, string>();
  selected.forEach((item) => {
    if (item.feedKey) symbolsByFeedKey.set(item.feedKey, item.sIndex);
  });

  const params = new URLSearchParams({ tokens: signature });
  const source = new EventSource(`/api/broker/market-feed?${params.toString()}`, {
    withCredentials: true,
  });
  eventSource = source;

  source.addEventListener("subscribed", () => {
    if (eventSource !== source) return;
    publish({ ...state, connected: true, error: null });
  });

  source.addEventListener("tick", (event) => {
    if (eventSource !== source) return;
    try {
      const raw = JSON.parse((event as MessageEvent).data ?? "{}");
      const segment = Number(raw?.mktSegId ?? raw?.marketSegmentId ?? raw?.["1"]);
      const token = String(raw?.token ?? raw?.scripToken ?? raw?.["7"] ?? "");
      if (!token || !Number.isFinite(segment)) return;
      const key = `${segment}_${token}`;
      const symbol = symbolsByFeedKey.get(key);
      if (!symbol) return;

      const ltp = Number(raw?.ltp ?? 0);
      if (!Number.isFinite(ltp) || ltp <= 0) return;
      const close = Number(raw?.closePrice ?? raw?.previousDayClosePrice ?? 0);
      const rawChange = Number(raw?.change);
      const rawPercent = Number(raw?.changePercent ?? raw?.change_percent ?? raw?.netChange);
      const change = Number.isFinite(rawChange) && rawChange !== 0
        ? rawChange
        : close > 0 ? ltp - close : 0;
      const changePercent = Number.isFinite(rawPercent) && rawPercent !== 0
        ? rawPercent
        : close > 0 ? (change / close) * 100 : 0;

      const quote: WatchlistQuote = {
        exchange: "",
        trading_symbol: symbol,
        token,
        ltp,
        receivedAt: Date.now(),
        change,
        change_percent: changePercent,
        open: Number(raw?.open ?? 0),
        high: Number(raw?.high ?? 0),
        low: Number(raw?.low ?? 0),
        close,
      };
      publish({
        ...state,
        quotesByToken: { ...state.quotesByToken, [key]: quote },
      });
    } catch {
      // Ignore malformed feed frames.
    }
  });

  source.addEventListener("error", (event) => {
    if (eventSource !== source) return;
    let message = "Index market feed connection error.";
    try {
      const data = JSON.parse((event as MessageEvent).data ?? "{}");
      if (data.message) message = String(data.message);
    } catch {
      // Native EventSource errors do not always include JSON data.
    }
    publish({ ...state, connected: false, error: message });
  });

  source.onerror = () => {
    if (eventSource === source) {
      publish({ ...state, connected: false, error: state.error ?? "Index feed disconnected. Retrying…" });
    }
  };

  source.addEventListener("closed", () => {
    if (eventSource !== source) return;
    publish({ ...state, connected: false, error: "Index market feed closed." });
  });
}

async function initialize(): Promise<void> {
  if (initialized) return;
  if (cataloguePromise) return cataloguePromise;

  cataloguePromise = (async () => {
    publish({ ...state, loading: true, error: null });
    try {
      const response = await fetch("/api/broker/index-details", { credentials: "include" });
      const payload = await response.json();
      if (!response.ok || payload?.status === false) {
        throw new Error(payload?.message || `Index Details request failed (${response.status}).`);
      }
      const catalogue = parseCatalogue(payload);
      if (!catalogue.length) {
        throw new Error("Index Details API returned no usable index records.");
      }
      const selectedKeys = loadSavedKeys(catalogue);
      window.localStorage.setItem(SELECTED_STORAGE_KEY, JSON.stringify(selectedKeys));
      initialized = true;
      publish({
        ...state,
        catalogue,
        selectedKeys,
        loading: false,
        error: null,
      });
      syncFeed();
    } catch (error) {
      publish({
        ...state,
        loading: false,
        error: error instanceof Error ? error.message : "Unable to load index catalogue.",
      });
    } finally {
      cataloguePromise = null;
    }
  })();
  return cataloguePromise;
}

export function addSelectedIndex(key: string) {
  if (!state.catalogue.some((item) => item.key === key)) return;
  if (state.selectedKeys.includes(key)) return;
  const selectedKeys = [...state.selectedKeys, key];
  window.localStorage.setItem(SELECTED_STORAGE_KEY, JSON.stringify(selectedKeys));
  publish({ ...state, selectedKeys });
  syncFeed();
}

export function removeSelectedIndex(key: string) {
  const selectedKeys = state.selectedKeys.filter((item) => item !== key);
  window.localStorage.setItem(SELECTED_STORAGE_KEY, JSON.stringify(selectedKeys));
  publish({ ...state, selectedKeys });
  syncFeed();
}

export function indexHistoryExchange(index: IndexDetails): string | null {
  if (index.nMarketSegmentId === 1) return "NSE_INDICES";
  if (index.nMarketSegmentId === 8) return "BSE_INDICES";
  return null;
}

export function useIndexMarketData() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    void initialize();
  }, []);

  const selectedIndices = snapshot.catalogue
    .filter((item) => snapshot.selectedKeys.includes(item.key))
    .sort((a, b) => {
      // Keep the primary benchmark indices in a predictable order,
      // regardless of the order in which the user adds them.
      const priority = (item: IndexDetails) => {
        const symbol = compact(item.sIndex);
        const description = compact(item.sIndexDesc);
        if (symbol === "NIFTY50" || description === "NIFTY50" ||
            (symbol === "NIFTY" && description.includes("NIFTY50"))) return 0;
        if (symbol === "SENSEX" || description === "SENSEX") return 1;
        if (symbol === "BANKNIFTY" || symbol === "NIFTYBANK" ||
            description === "NIFTYBANK" || description === "BANKNIFTY") return 2;
        return 3;
      };
      return priority(a) - priority(b) ||
        snapshot.selectedKeys.indexOf(a.key) - snapshot.selectedKeys.indexOf(b.key);
    });

  return {
    ...snapshot,
    selectedIndices,
    addIndex: addSelectedIndex,
    removeIndex: removeSelectedIndex,
    reload: initialize,
  };
}
