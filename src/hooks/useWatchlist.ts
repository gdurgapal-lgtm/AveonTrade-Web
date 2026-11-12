"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Instrument } from "@/types/trading";
import { instrumentIdentityKey } from "@/types/trading";
import { PREDEFINED_WATCHLIST_GROUPS } from "@/data/predefinedWatchlists";
import { resolvePredefinedWatchlist } from "@/lib/watchlistLoader";

const STORAGE_KEY = "aveon_market_watch_portfolios_v3_global";
const PREVIOUS_STORAGE_KEY = "aveon_market_watch_portfolios_v2";
const LEGACY_STORAGE_KEY = "aveon_watchlists_v2";
const SELECTION_STORAGE_KEY = "aveon_market_watch_portfolio_selection_v1";

export interface WatchlistGroup {
  id: string;
  name: string;
  items: Instrument[];
}

export type MarketWatchPortfolio = WatchlistGroup;

type WorkspacePortfolioStore = Record<string, WatchlistGroup[]>;
type GlobalPortfolioStore = {
  portfolios: WatchlistGroup[];
};

const DEFAULT_ITEMS: Instrument[] = [];

const DEFAULT_GROUPS: WatchlistGroup[] = [
  { id: "portfolio_instruments", name: "INSTRUMENTS", items: DEFAULT_ITEMS },
  // Pre-seed the predefined groups into the default template structure
  ...PREDEFINED_WATCHLIST_GROUPS.map((g) => ({
    id: g.id,
    name: g.name,
    items: [], // Will load tokens dynamically on selection
  })),
];

function upperName(value: unknown, fallback = "INSTRUMENTS"): string {
  return typeof value === "string" && value.trim() ? value.trim().toLocaleUpperCase() : fallback;
}

function normalizeGroups(value: unknown): WatchlistGroup[] {
  if (!Array.isArray(value)) return cloneDefaults();
  const groups = value
    .filter((g): g is WatchlistGroup => !!g && typeof g === "object" && typeof (g as any).id === "string")
    .map((g) => ({
      id: g.id,
      name: upperName(g.name),
      items: Array.isArray(g.items) ? g.items.filter(Boolean) : [],
    }));
  return groups.length ? groups : cloneDefaults();
}

function cloneDefaults(): WatchlistGroup[] {
  return DEFAULT_GROUPS.map((group) => ({ ...group, items: [...group.items] }));
}

function normalizeWorkspaceStore(value: unknown): WorkspacePortfolioStore {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: WorkspacePortfolioStore = {};
  for (const [workspaceId, groups] of Object.entries(value as Record<string, unknown>)) {
    result[workspaceId] = normalizeGroups(groups);
  }
  return result;
}

function normalizeGlobalStore(value: unknown): GlobalPortfolioStore | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as { portfolios?: unknown };
  if (!Array.isArray(candidate.portfolios)) return null;
  return { portfolios: normalizeGroups(candidate.portfolios) };
}

function uniquePortfolios(groups: WatchlistGroup[]): WatchlistGroup[] {
  const byId = new Map<string, WatchlistGroup>();
  for (const group of groups) {
    if (!byId.has(group.id)) {
      byId.set(group.id, { ...group, name: upperName(group.name), items: [...group.items] });
    }
  }
  // Ensure all predefined sector groups are always present even if old storage lacks them
  for (const defGroup of DEFAULT_GROUPS) {
    if (!byId.has(defGroup.id)) {
      byId.set(defGroup.id, { ...defGroup, items: [...defGroup.items] });
    }
  }
  return [...byId.values()];
}

function persistGlobalStore(store: GlobalPortfolioStore) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* storage can be unavailable; UI state still updates */
  }
}

function readSelectionStore(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(SELECTION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function persistSelection(workspaceId: string, portfolioId: string) {
  try {
    const selections = readSelectionStore();
    selections[workspaceId] = portfolioId;
    window.localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify(selections));
  } catch {
    /* storage can be unavailable; UI state still updates */
  }
}

function loadOrMigrateGlobalStore(): GlobalPortfolioStore {
  const currentRaw = window.localStorage.getItem(STORAGE_KEY);
  if (currentRaw) {
    const parsed = normalizeGlobalStore(JSON.parse(currentRaw));
    if (parsed?.portfolios.length) {
      return { portfolios: uniquePortfolios(parsed.portfolios) };
    }
  }

  const previousRaw = window.localStorage.getItem(PREVIOUS_STORAGE_KEY);
  if (previousRaw) {
    const previous = normalizeWorkspaceStore(JSON.parse(previousRaw));
    const migrated = uniquePortfolios(Object.values(previous).flat());
    if (migrated.length) {
      const store = { portfolios: migrated };
      persistGlobalStore(store);
      return store;
    }
  }

  const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacyRaw) {
    const legacyGroups = normalizeGroups(JSON.parse(legacyRaw));
    const store = { portfolios: uniquePortfolios(legacyGroups) };
    persistGlobalStore(store);
    return store;
  }

  return { portfolios: cloneDefaults() };
}

export function useWatchlist(workspaceId = "wrk_1") {
  const [groups, setGroups] = useState<WatchlistGroup[]>(cloneDefaults());
  const [activeId, setActiveIdState] = useState("portfolio_instruments");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const store = loadOrMigrateGlobalStore();
      const portfolios = store.portfolios.length ? store.portfolios : cloneDefaults();
      if (!store.portfolios.length) persistGlobalStore({ portfolios });

      const selections = readSelectionStore();
      let selectedId = selections[workspaceId];

      if (!selectedId || !portfolios.some((portfolio) => portfolio.id === selectedId)) {
        selectedId = portfolios[0]?.id ?? "portfolio_instruments";
        persistSelection(workspaceId, selectedId);
      }

      setGroups(portfolios);
      setActiveIdState(selectedId);
      setLoaded(true);
    } catch {
      const defaults = cloneDefaults();
      setGroups(defaults);
      setActiveIdState(defaults[0].id);
      setLoaded(true);
    }
  }, [workspaceId]);

  // Dynamically resolve tokens for predefined watchlists when selected if items are empty
  useEffect(() => {
    async function loadPredefinedTokens() {
      const activeGroup = groups.find((g) => g.id === activeId);
      const isPredefined = PREDEFINED_WATCHLIST_GROUPS.some((g) => g.id === activeId);

      if (activeGroup && isPredefined && activeGroup.items.length === 0) {
        const resolvedItems = await resolvePredefinedWatchlist(activeId);
        if (resolvedItems.length > 0) {
          const nextGroups = groups.map((g) => (g.id === activeId ? { ...g, items: resolvedItems } : g));
          setGroups(nextGroups);
          persistGlobalStore({ portfolios: nextGroups });
        }
      }
    }
    loadPredefinedTokens();
  }, [activeId, groups]);

  const persist = useCallback((next: WatchlistGroup[]) => {
    const normalized = next.map((group) => ({
      ...group,
      name: upperName(group.name),
      items: [...group.items],
    }));
    setGroups(normalized);
    persistGlobalStore({ portfolios: normalized });
  }, []);

  const setActiveId = useCallback((id: string) => {
    setActiveIdState(id);
    persistSelection(workspaceId, id);
  }, [workspaceId]);

  function addGroup(name: string) {
    const clean = upperName(name, "");
    if (!clean) return;
    const id = `portfolio_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const next = [...groups, { id, name: clean, items: [] }];
    persist(next);
    setActiveId(id);
  }

  function renameGroup(id: string, name: string) {
    const clean = upperName(name, "");
    if (!clean) return;
    persist(groups.map((group) => (group.id === id ? { ...group, name: clean } : group)));
  }

  function removeGroup(id: string) {
    if (groups.length <= 1) return;
    const next = groups.filter((group) => group.id !== id);
    persist(next);

    try {
      const selections = readSelectionStore();
      for (const [selectedWorkspace, selectedPortfolio] of Object.entries(selections)) {
        if (selectedPortfolio === id) selections[selectedWorkspace] = next[0].id;
      }
      window.localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify(selections));
    } catch {
      /* storage can be unavailable; UI state still updates */
    }

    if (activeId === id) setActiveId(next[0].id);
  }

  function addItem(groupId: string, item: Instrument) {
    const key = instrumentIdentityKey(item);
    persist(groups.map((group) => {
      if (group.id !== groupId) return group;
      if (group.items.some((existing) => instrumentIdentityKey(existing) === key)) return group;
      return { ...group, items: [...group.items, item] };
    }));
  }

  function removeItem(groupId: string, item: Instrument) {
    const key = instrumentIdentityKey(item);
    persist(groups.map((group) => group.id === groupId
      ? { ...group, items: group.items.filter((existing) => instrumentIdentityKey(existing) !== key) }
      : group));
  }

  const active = useMemo(
    () => groups.find((group) => group.id === activeId) ?? groups[0],
    [groups, activeId],
  );

  return {
    groups,
    portfolios: groups,
    watchlists: groups,
    active,
    activeId,
    setActiveId,
    addGroup,
    addPortfolio: addGroup,
    renameGroup,
    renamePortfolio: renameGroup,
    removeGroup,
    removePortfolio: removeGroup,
    addItem,
    removeItem,
    loaded,
  };
}