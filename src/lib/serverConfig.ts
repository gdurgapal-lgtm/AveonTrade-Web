/**
 * Server-only broker configuration.
 *
 * Mirrors `lib/core/config/api_config.dart` from the Flutter app. This file
 * must never be imported from a Client Component — it is only read inside
 * Route Handlers (src/app/api/**) which run on the server, so the API key
 * and allow-list stay out of the browser bundle entirely.
 */

function csv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export const ServerConfig = {
  baseUrl: process.env.AVEON_BASE_URL || "https://pre-prod.odinwave.com",
  tenantId: process.env.AVEON_TENANT_ID || "1404",
  apiKey: process.env.AVEON_API_KEY || "",
  chartBaseUrl: process.env.AVEON_CHART_BASE_URL || "https://web.9star.in:3000",
  source: process.env.AVEON_SOURCE || "MOBILEAPI",
  version: process.env.AVEON_VERSION || "2.0.0",
  udid: process.env.AVEON_UDID || "web-aveon",
  sessionCookieName: process.env.SESSION_COOKIE_NAME || "aveon_session",
  sessionSigningSecret: process.env.SESSION_SIGNING_SECRET || "",
  /** Fallback socket.io URL for real-time order/trade messages when login did not return one. */
  messageSocketUrl: process.env.AVEON_MESSAGE_SOCKET_URL || "",
  get allowedHosts(): Set<string> {
    const hosts = new Set(csv(process.env.AVEON_ALLOWED_HOSTS));
    try {
      const host = new URL(this.baseUrl).host.toLowerCase();
      if (host) hosts.add(host);
    } catch {
      /* ignore malformed baseUrl */
    }
    return hosts;
  },

  get hasTradingConfiguration(): boolean {
    let httpsOk = false;
    try {
      httpsOk = new URL(this.baseUrl).protocol === "https:";
    } catch {
      httpsOk = false;
    }
    return httpsOk && this.tenantId.trim() !== "" && this.apiKey.trim() !== "";
  },
  get hasSessionSigningConfiguration(): boolean {
    return process.env.NODE_ENV !== "production" || this.sessionSigningSecret.trim().length >= 32;
  },
};

/** Guard used by the broker proxy: only ever call allow-listed hosts. */
export function isTrustedBrokerUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return ServerConfig.allowedHosts.has(parsed.host.toLowerCase());
  } catch {
    return false;
  }
}

/** Chart history carries the authenticated broker token, so it gets the same
 * HTTPS and explicit-host policy as the primary broker proxy. */
export function isTrustedChartUrl(url: string): boolean {
  return isTrustedBrokerUrl(url);
}
