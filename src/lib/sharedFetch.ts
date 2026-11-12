"use client";

import { apiClient } from "@/lib/apiClient";
import { useAuthStore } from "@/lib/authStore";
import type { BrokerApiResponse } from "@/lib/brokerFetch";

/**
 * One request per endpoint, however many components ask for it.
 *
 * Before this, every component that showed the same list (dashboard, bottom
 * panel, orders page…) made its own identical request, and every real-time
 * event multiplied that. Now:
 *  - a request already on the wire is shared by everyone who asks for it;
 *  - a non-forced load (timer / focus) reuses a result that is only a moment old;
 *  - a forced load (a real-time event, or the user pressing refresh) always goes to the
 *    broker, except that it may join a request that started a split second ago — that
 *    request already reflects the change.
 */
const JOIN_WINDOW_MS = 400; // forced loads may join an in-flight request this young
const FRESH_MS = 1_500; // non-forced loads may reuse a result this young
const MAX_ENTRIES = 60;

interface Entry {
  startedAt: number;
  finishedAt?: number;
  result?: BrokerApiResponse<unknown>;
  promise: Promise<BrokerApiResponse<unknown>>;
}

const entries = new Map<string, Entry>();

export function fetchShared<T = unknown>(endpoint: string, force = false): Promise<BrokerApiResponse<T>> {
  const now = Date.now();
  const existing = entries.get(endpoint);
  if (existing) {
    const inFlight = existing.finishedAt === undefined;
    if (inFlight && (!force || now - existing.startedAt <= JOIN_WINDOW_MS)) {
      return existing.promise as Promise<BrokerApiResponse<T>>;
    }
    if (!inFlight && !force && existing.result?.success && now - (existing.finishedAt ?? 0) <= FRESH_MS) {
      return Promise.resolve(existing.result as BrokerApiResponse<T>);
    }
  }

  const entry: Entry = { startedAt: now, promise: undefined as unknown as Promise<BrokerApiResponse<unknown>> };
  entry.promise = apiClient.get<T>(endpoint).then(
    (res) => {
      entry.result = res;
      entry.finishedAt = Date.now();
      return res;
    },
    (error) => {
      entry.finishedAt = Date.now();
      throw error;
    }
  );
  entries.set(endpoint, entry);

  // keep the map small (date-range endpoints can produce many distinct keys)
  if (entries.size > MAX_ENTRIES) {
    for (const [key, value] of entries) {
      if (value.finishedAt !== undefined && key !== endpoint) {
        entries.delete(key);
        if (entries.size <= MAX_ENTRIES) break;
      }
    }
  }
  return entry.promise as Promise<BrokerApiResponse<T>>;
}

type InvalidateListener = (prefix: string) => void;
const invalidateListeners = new Set<InvalidateListener>();

/** Lets a mounted data hook hear that some endpoints are now out of date. */
export function subscribeInvalidate(listener: InvalidateListener): () => void {
  invalidateListeners.add(listener);
  return () => {
    invalidateListeners.delete(listener);
  };
}

/**
 * Something changed the server-side data behind every endpoint that starts with
 * `prefix` (e.g. a position was converted). Drops the cached copies and tells
 * every mounted usePolledData for those endpoints to refetch right away, so all
 * screens showing that data (dashboard, positions, market-watch panel…) update
 * together instead of each waiting for its own timer.
 */
export function invalidateShared(prefix: string) {
  for (const key of Array.from(entries.keys())) {
    if (key.startsWith(prefix)) entries.delete(key);
  }
  invalidateListeners.forEach((listener) => listener(prefix));
}

/** Forget everything (used on logout / user change — results are personal data). */
export function clearSharedFetch() {
  entries.clear();
}

if (typeof window !== "undefined") {
  let lastUser = useAuthStore.getState().userId;
  useAuthStore.subscribe((state) => {
    if (state.userId !== lastUser) {
      lastUser = state.userId;
      clearSharedFetch();
    }
  });
}
