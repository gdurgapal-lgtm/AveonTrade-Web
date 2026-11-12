"use client";

import { useEffect } from "react";
import { useProfileStore } from "@/lib/profileStore";

/**
 * Shared user profile (name, email, mobile, PAN, bank_details, dp_details, …).
 *
 *   const { profile, loading, error, reload } = useUserProfile();
 *   const dp = defaultDp(profile);          // from "@/types/profile"
 *
 * The first component to call it triggers the fetch; everyone else reuses the cached copy.
 */
export function useUserProfile() {
  const profile = useProfileStore((s) => s.profile);
  const raw = useProfileStore((s) => s.raw);
  const status = useProfileStore((s) => s.status);
  const error = useProfileStore((s) => s.error);
  const load = useProfileStore((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    profile,
    raw,
    loading: !profile && (status === "idle" || status === "loading"),
    refreshing: status === "loading" && Boolean(profile),
    error: !profile && status === "error" ? error : null,
    reload: () => load(true),
  };
}
