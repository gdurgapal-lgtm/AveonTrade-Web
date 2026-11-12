"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useOrderStreamStore } from "@/lib/orderStreamStore";
import { fetchShared, subscribeInvalidate } from "@/lib/sharedFetch";

interface State<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export type LiveTopic = "orders" | "trades";

export interface LiveOptions {
  /** Which real-time messages should trigger a refetch of this endpoint. */
  topics: LiveTopic[];
  /**
   * By default timed polling stops completely while the stream is live. Set this
   * for data that also changes without any order/trade message (e.g. position P&L).
   */
  keepPolling?: boolean;
}

/** Order book style data: refresh when an order message arrives. */
export const LIVE_ORDERS: LiveOptions = { topics: ["orders"] };
/** Trade book style data: refresh when a trade message arrives. */
export const LIVE_TRADES: LiveOptions = { topics: ["trades"] };
/**
 * Net positions change when a trade is reported, but their P&L also moves with
 * prices — so refresh on trades and keep the normal polling interval.
 */
export const LIVE_POSITIONS: LiveOptions = { topics: ["trades"], keepPolling: true };

// Several messages usually arrive together (order + trade for one fill); fetch once for the burst.
const LIVE_REFETCH_DEBOUNCE_MS = 400;
// On first connect the page has usually just fetched; skip a reconcile if the data is younger than this.
const RECONCILE_MIN_AGE_MS = 2_000;

/**
 * Fetches `endpoint` via the broker proxy and (optionally) re-polls it on an
 * interval.
 *
 *  - `enabled=false` skips fetching/polling entirely (used to only poll the
 *    active tab in BottomPanel instead of all four tabs at once).
 *  - Identical requests made by several components are shared (lib/sharedFetch.ts).
 *  - Polling pauses while the browser tab isn't visible, and refetches once when it
 *    becomes visible again.
 *
 * Optional 4th argument `live` — the real-time order/trade stream
 * (lib/orderStreamStore.ts). While the stream is live:
 *  - there is NO timed polling (unless `keepPolling`);
 *  - the endpoint is refetched when a matching message arrives (one fetch per burst);
 *  - on connect, and again after any reconnect, it is reconciled exactly once, because
 *    that is the only time a message could have been missed;
 *  - returning to a hidden tab refetches only if a message arrived while it was hidden.
 * If the stream is down or unavailable, normal `intervalMs` polling continues, so
 * behaviour never gets worse than plain polling.
 */
export function usePolledData<T = unknown>(endpoint: string, intervalMs = 0, enabled = true, live?: LiveOptions) {
  const [state, setState] = useState<State<T>>({ data: null, loading: enabled, error: null });
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const lastFetchAt = useRef(0);
  const requestSequence = useRef(0);
  const dirtyWhileHidden = useRef(false);

  const load = useCallback(
    async (force = false) => {
      if (!enabledRef.current) return;
      dirtyWhileHidden.current = false;
      lastFetchAt.current = Date.now();
      const requestId = ++requestSequence.current;
      const res = await fetchShared<T>(endpoint, force);
      // A newer request may have started while this one was in flight.
      // Never let an older response replace more recent screen data.
      if (requestId !== requestSequence.current) return;
      if (res.success) {
        setState({ data: res.data, loading: false, error: null });
      } else {
        setState((s) => ({ ...s, loading: false, error: res.message || "Failed to load." }));
      }
    },
    [endpoint]
  );
  const reload = useCallback(() => load(true), [load]);

  // ---- real-time stream (optional) ----
  const topicsKey = (live?.topics ?? []).join(",");
  const wantsLive = enabled && topicsKey !== "";

  useEffect(() => {
    if (!wantsLive) return;
    const { acquire, release } = useOrderStreamStore.getState();
    acquire();
    return release;
  }, [wantsLive]);

  const streamStatus = useOrderStreamStore((s) => s.status);
  // A primitive string, so this only re-renders when a message for one of our topics arrives.
  const tickKey = useOrderStreamStore((s) =>
    topicsKey
      .split(",")
      .map((topic) => (topic === "orders" ? s.orderTick : topic === "trades" ? s.tradeTick : 0))
      .join("-")
  );
  const streamLive = wantsLive && streamStatus === "live";
  const streamLiveRef = useRef(streamLive);
  streamLiveRef.current = streamLive;
  const timerMs = streamLive && !live?.keepPolling ? 0 : intervalMs;

  // 1) initial load + "tab became visible again"
  useEffect(() => {
    if (!enabled) return;
    if (document.visibilityState === "visible") void load(false);

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      const missedMessage = dirtyWhileHidden.current;
      // With a live stream nothing was missed unless a message arrived while the tab was hidden.
      if (streamLiveRef.current && !missedMessage) return;
      // A missed message means any cached copy is out of date, so bypass the short-lived cache.
      void load(missedMessage);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [load, enabled]);

  // 2) timed polling — only when there is no live stream (or the data needs it regardless)
  useEffect(() => {
    if (!enabled || timerMs <= 0) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load(false);
    }, timerMs);
    return () => clearInterval(id);
  }, [load, enabled, timerMs]);

  // 3) reconcile once when the stream becomes live — first connect or after an interruption
  const wasLive = useRef(false);
  const interrupted = useRef(false);
  useEffect(() => {
    if (!wantsLive) {
      wasLive.current = false;
      return;
    }
    if (streamLive && !wasLive.current) {
      const stale = Date.now() - lastFetchAt.current > RECONCILE_MIN_AGE_MS;
      if (interrupted.current || stale) void load(true);
      interrupted.current = false;
    } else if (!streamLive && wasLive.current) {
      interrupted.current = true; // we may miss messages until it is live again
    }
    wasLive.current = streamLive;
  }, [streamLive, wantsLive, load]);

  // 4) a matching real-time message arrived
  const seenTick = useRef(tickKey);
  useEffect(() => {
    if (seenTick.current === tickKey) return;
    seenTick.current = tickKey;
    if (!wantsLive) return;
    if (document.visibilityState !== "visible") {
      dirtyWhileHidden.current = true; // refetch when the user comes back
      return;
    }
    const id = setTimeout(() => void load(true), LIVE_REFETCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [tickKey, wantsLive, load]);

  // 5) another part of the app changed the data behind this endpoint (see invalidateShared)
  useEffect(() => {
    if (!enabled) return;
    return subscribeInvalidate((prefix) => {
      if (endpoint.startsWith(prefix)) void load(true);
    });
  }, [enabled, endpoint, load]);

  return { ...state, reload };
}
