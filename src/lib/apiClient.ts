"use client";

import type { BrokerApiResponse } from "./brokerFetch";

/**
 * Client-side counterpart to `ApiClient` in the Flutter app. Every call is
 * same-origin (`/api/broker/...`), so the browser never sees the broker
 * host, api-key, or tokens — the Next.js route handler attaches those.
 *
 * If the broker (or our own /api/broker/[...path] guard) reports the
 * session is gone — expired token, cleared cookie, etc — every screen would
 * otherwise just show blank/broken data forever. Instead we redirect to
 * /login once, immediately, from wherever the stale call happened.
 */
let redirecting = false;
function handleUnauthorized() {
  if (redirecting || typeof window === "undefined") return;
  redirecting = true;
  const next = window.location.pathname + window.location.search;
  window.location.href = `/login?next=${encodeURIComponent(next)}&expired=1`;
}

async function call<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  endpoint: string,
  body?: unknown
): Promise<BrokerApiResponse<T>> {
  try {
    const res = await fetch(`/api/broker${endpoint}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "include",
    });

    if (res.status === 401) {
      handleUnauthorized();
      return {
        success: false,
        statusCode: 401,
        message: "Your session has expired. Please sign in again.",
        data: null,
        failureKind: "unauthorized",
      };
    }

    return (await res.json()) as BrokerApiResponse<T>;
  } catch {
    return {
      success: false,
      statusCode: 0,
      message: "Network error. Please check your connection.",
      data: null,
      failureKind: "network",
    };
  }
}

export const apiClient = {
  get: <T = unknown>(endpoint: string) => call<T>("GET", endpoint),
  post: <T = unknown>(endpoint: string, body: unknown) => call<T>("POST", endpoint, body),
  put: <T = unknown>(endpoint: string, body: unknown) => call<T>("PUT", endpoint, body),
  delete: <T = unknown>(endpoint: string, body?: unknown) => call<T>("DELETE", endpoint, body),
};
