"use client";

import { create } from "zustand";

interface AuthState {
  status: "unknown" | "authenticated" | "guest";
  userId: string | null;
  clientId: string | null;
  /** Broker group id from login (used e.g. as GroupID on IPO orders). */
  groupId: string | null;
  /** Exchanges the account may trade (from login). null = not known yet / session predates this field. */
  exchanges: string[] | null;
  /** Allowed broker product types per exchange (from login). */
  productTypesByExchange: Record<string, string[]>;
  setAuthenticated: (userId: string, clientId?: string | null) => void;
  setGuest: () => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

/**
 * Equivalent of `SessionManager` (lib/core/session/session_manager.dart) but
 * intentionally holds no tokens — those live only in the httpOnly cookie
 * managed by the server. This store just tracks "am I logged in" + identity
 * for the UI (top bar, guarded routes, etc).
 */
export const useAuthStore = create<AuthState>((set) => ({
  status: "unknown",
  userId: null,
  clientId: null,
  groupId: null,
  exchanges: null,
  productTypesByExchange: {},
  setAuthenticated: (userId, clientId = null) =>
    set({ status: "authenticated", userId, clientId }),
  setGuest: () => set({ status: "guest", userId: null, clientId: null, groupId: null, exchanges: null, productTypesByExchange: {} }),
  refresh: async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      const json = await res.json();
      if (json.authenticated) {
        set({
          status: "authenticated",
          userId: json.userId,
          clientId: json.clientId ?? null,
          groupId: json.groupId ?? null,
          exchanges: Array.isArray(json.exchanges) && json.exchanges.length ? json.exchanges : null,
          productTypesByExchange: json.productTypesByExchange && typeof json.productTypesByExchange === "object" ? json.productTypesByExchange : {},
        });
      } else {
        set({ status: "guest", userId: null, clientId: null, groupId: null, exchanges: null, productTypesByExchange: {} });
      }
    } catch {
      set({ status: "guest", userId: null, clientId: null, groupId: null, exchanges: null, productTypesByExchange: {} });
    }
  },
  logout: async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    set({ status: "guest", userId: null, clientId: null, groupId: null, exchanges: null, productTypesByExchange: {} });
  },
}));
