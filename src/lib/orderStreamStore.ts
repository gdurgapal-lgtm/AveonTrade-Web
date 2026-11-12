"use client";

import { create } from "zustand";
import { useAuthStore } from "@/lib/authStore";
import { useLiveOrderStore } from "@/lib/liveOrderStore";
import type { RawOrderModel, RawTradeModel } from "@/types/trading";

/**
 * Browser side of the real-time order/trade stream.
 *
 * One shared EventSource to /api/broker/order-stream, opened while at least one
 * component needs live data (see `usePolledData`'s `live` option) and closed
 * shortly after the last one goes away. It doesn't hold orders itself — it only
 * says "something changed" (`orderTick` / `tradeTick`), so the screens re-fetch
 * their REST lists exactly when needed instead of polling constantly.
 *
 * status:
 *   idle / connecting — not connected yet
 *   live              — receiving events; callers can stop fast polling
 *   down              — connection to our server or to the broker dropped; callers fall back to polling
 *   unavailable       — the server can't stream for this session (not logged in, or no
 *                       message-socket URL from login); callers just keep polling
 */
export type OrderStreamStatus = "idle" | "connecting" | "live" | "down" | "unavailable";

interface OrderStreamState {
  status: OrderStreamStatus;
  /** Incremented on every order message (ORD_NRML). */
  orderTick: number;
  /** Incremented on every trade message (TRD_MSG). */
  tradeTick: number;
  acquire: () => void;
  release: () => void;
  /** Drops the current connection and opens a fresh one (used when the logged-in user changes). */
  reconnect: () => void;
}

const CLOSE_DELAY_MS = 1_500; // survives React strict-mode remounts and quick tab switches

let source: EventSource | null = null;
let refs = 0;
let closeTimer: ReturnType<typeof setTimeout> | null = null;

export const useOrderStreamStore = create<OrderStreamState>((set, get) => {
  function close() {
    source?.close();
    source = null;
    if (get().status !== "unavailable") set({ status: "idle" });
  }

  function open() {
    if (source || typeof window === "undefined" || typeof EventSource === "undefined") return;
    set({ status: "connecting" });
    console.info("[AveonTrade][OrderStream DEBUG] Opening browser SSE connection");
    const es = new EventSource("/api/broker/order-stream", { withCredentials: true });
    source = es;

    es.addEventListener("status", (event) => {
      try {
        const { state } = JSON.parse((event as MessageEvent).data ?? "{}");
        const nextStatus = state === "live" ? "live" : state === "down" ? "down" : "connecting";
        console.info("[AveonTrade][OrderStream DEBUG] Browser stream status", { previous: get().status, next: nextStatus });
        set({ status: nextStatus });
      } catch {
        /* ignore malformed status */
      }
    });
    es.addEventListener("order", (event) => {
      // Apply the broker event immediately for pages that show the live store,
      // then retain the tick so REST-backed screens reconcile authoritative
      // data after a burst. Normalization drops malformed/unidentified events.
      try {
        const message = JSON.parse((event as MessageEvent<string>).data) as RawOrderModel;
        console.log("[AveonTrade][OrderStream DEBUG] Order message received", message);
        useLiveOrderStore.getState().upsertOrder(message);
      } catch {
        // A bad SSE payload must never take down the reconnect/refetch path.
      }
      set((s) => ({ orderTick: s.orderTick + 1 }));
    });
    es.addEventListener("trade", (event) => {
      try {
        const message = JSON.parse((event as MessageEvent<string>).data) as RawTradeModel;
        console.log("[AveonTrade][OrderStream DEBUG] Trade message received", message);
        useLiveOrderStore.getState().addTrade(message);
      } catch {
        // Reconciliation below still repairs any event we cannot parse.
      }
      set((s) => ({ tradeTick: s.tradeTick + 1 }));
    });

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        // The server answered with an error status (401 / 409): the browser won't retry.
        if (source === es) source = null;
        set({ status: "unavailable" });
      } else {
        console.warn("[AveonTrade][OrderStream DEBUG] SSE connection interrupted; browser will retry", { readyState: es.readyState });
        set({ status: "down" }); // network blip / server restart — EventSource reconnects by itself
      }
    };
  }

  return {
    status: "idle",
    orderTick: 0,
    tradeTick: 0,
    acquire: () => {
      refs += 1;
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
      if (get().status === "unavailable" && !source) set({ status: "idle" }); // allow a retry on the next mount
      open();
    },
    reconnect: () => {
      source?.close();
      source = null;
      set({ status: "idle" });
      if (refs > 0) open();
    },
    release: () => {
      refs = Math.max(0, refs - 1);
      if (refs === 0 && !closeTimer) {
        closeTimer = setTimeout(() => {
          closeTimer = null;
          if (refs === 0) close();
        }, CLOSE_DELAY_MS);
      }
    },
  };
});

// A different (or no) user must never inherit the previous user's stream.
if (typeof window !== "undefined") {
  let lastUser = useAuthStore.getState().userId;
  useAuthStore.subscribe((state) => {
    if (state.userId === lastUser) return;
    lastUser = state.userId;
    if (state.userId) useOrderStreamStore.getState().reconnect();
    else {
      source?.close();
      source = null;
      useOrderStreamStore.setState({ status: "idle" });
    }
  });
}
