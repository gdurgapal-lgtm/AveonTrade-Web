"use client";

import { create } from "zustand";
import { apiClient } from "@/lib/apiClient";
import { useAuthStore } from "@/lib/authStore";
import { Endpoints } from "@/lib/endpoints";
import { readProfile, type UserProfile } from "@/types/profile";

/**
 * One shared copy of GET /authentication/v1/user/profile for the whole app.
 * Any screen can read it through `useUserProfile()` — the request is made once,
 * de-duplicated while in flight, and cached for TTL_MS (a manual refresh bypasses it).
 */
const TTL_MS = 5 * 60_000;

interface ProfileState {
  profile: UserProfile | null;
  /** The untouched `data` of the response (every field the broker sent). */
  raw: unknown;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  loadedAt: number;
  load: (force?: boolean) => Promise<void>;
  reset: () => void;
}

let inflight: Promise<void> | null = null;

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  raw: null,
  status: "idle",
  error: null,
  loadedAt: 0,

  load: async (force = false) => {
    if (inflight) return inflight;
    const { status, loadedAt } = get();
    if (!force && status === "ready" && Date.now() - loadedAt < TTL_MS) return;

    set({ status: "loading", error: null });
    inflight = (async () => {
      const res = await apiClient.get<unknown>(Endpoints.auth.profile);
      if (res.success) {
        set({ profile: readProfile(res.data), raw: res.data, status: "ready", error: null, loadedAt: Date.now() });
      } else {
        set({ status: "error", error: res.message || "Unable to load your profile." });
      }
    })().finally(() => {
      inflight = null;
    });
    return inflight;
  },

  reset: () => {
    inflight = null;
    set({ profile: null, raw: null, status: "idle", error: null, loadedAt: 0 });
  },
}));

// Never show one user's profile to the next: clear it whenever the logged-in user changes or logs out.
if (typeof window !== "undefined") {
  let lastUser = useAuthStore.getState().userId;
  useAuthStore.subscribe((state) => {
    if (state.userId !== lastUser) {
      lastUser = state.userId;
      useProfileStore.getState().reset();
    }
  });
}
