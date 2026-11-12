import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { ServerConfig } from "./serverConfig";

export interface StoredSession {
  accessToken: string;
  sessionToken: string;
  /** Token accepted by the broadcast gateway. Falls back to accessToken when omitted by the broker. */
  broadcastToken?: string;
  userId: string;
  clientId?: string;
  groupId?: string;
  /** Broadcast server parsed from the configured URL or broker login response. */
  broadcastHost?: string;
  broadcastPort?: number;
  broadcastSsl?: boolean;
  /** Login `others.messageSocket` — the socket.io endpoint for real-time order/trade messages. */
  messageSocketUrl?: string;
}

/**
 * Non-secret account capabilities returned by login. Kept in its own cookie so
 * the (token-bearing) session cookie stays well under the 4 KB browser limit.
 */
export interface UserProfileInfo {
  /** Exchanges the user is allowed to trade, e.g. ["NSE_EQ", "BSE_EQ", ...] (login `exchanges`). */
  exchanges: string[];
  /** Allowed broker product types per exchange (login `product_types_exchange`). */
  productTypesByExchange: Record<string, string[]>;
}

const profileCookieName = () => `${ServerConfig.sessionCookieName}_profile`;

// Defaults to Secure in production. Set COOKIE_SECURE=false only for plain-HTTP
// LAN testing (e.g. http://192.168.1.10:3000). Browsers drop Secure cookies on
// non-localhost HTTP origins, which breaks login there.
const cookieSecure = (): boolean =>
  process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === "true"
    : process.env.NODE_ENV === "production";

function sign(value: string): string {
  return createHmac("sha256", ServerConfig.sessionSigningSecret).update(value).digest("base64url");
}

function encodeSession(session: StoredSession): string {
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  // Local development remains usable without an additional secret. Production
  // is guarded by hasSessionSigningConfiguration at login/read time.
  if (!ServerConfig.sessionSigningSecret) return JSON.stringify(session);
  return `v1.${payload}.${sign(payload)}`;
}

function decodeSession(raw: string): StoredSession | null {
  if (raw.startsWith("v1.")) {
    const [, payload, signature, ...extra] = raw.split(".");
    if (!payload || !signature || extra.length || !ServerConfig.sessionSigningSecret) return null;
    const expected = sign(payload);
    const received = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (received.length !== expectedBuffer.length || !timingSafeEqual(received, expectedBuffer)) return null;
    try {
      return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as StoredSession;
    } catch {
      return null;
    }
  }
  // Legacy unsigned sessions are never accepted in production.
  if (process.env.NODE_ENV === "production") return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

/**
 * The mobile app kept access_token / session_token in memory
 * (SessionManager) plus secure storage. On the web we keep them in a single
 * httpOnly, SameSite=Lax cookie (Secure by default in production, see
 * cookieSecure) so client-side JS (and therefore XSS) never sees the raw
 * tokens. Route Handlers read this cookie and attach the tokens as headers
 * when forwarding requests to the broker.
 */
export async function readSession(): Promise<StoredSession | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(ServerConfig.sessionCookieName)?.value;
  if (!raw) return null;
  return decodeSession(raw);
}

export async function writeSession(session: StoredSession, remember = false) {
  const cookieStore = await cookies();
  cookieStore.set(ServerConfig.sessionCookieName, encodeSession(session), {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    // No maxAge => a true session cookie that the browser clears when it
    // fully closes. Only persists across browser restarts if the person
    // explicitly checked "Remember me" at login.
    ...(remember ? { maxAge: 60 * 60 * 24 * 7 } : {}),
  });
}

export async function readProfile(): Promise<UserProfileInfo | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(profileCookieName())?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<UserProfileInfo>;
    if (!Array.isArray(parsed.exchanges)) return null;
    return {
      exchanges: parsed.exchanges.map(String),
      productTypesByExchange: parsed.productTypesByExchange && typeof parsed.productTypesByExchange === "object" ? parsed.productTypesByExchange : {},
    };
  } catch {
    return null;
  }
}

export async function writeProfile(profile: UserProfileInfo, remember = false) {
  const cookieStore = await cookies();
  cookieStore.set(profileCookieName(), JSON.stringify(profile), {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    ...(remember ? { maxAge: 60 * 60 * 24 * 7 } : {}),
  });
}

export async function clearProfile() {
  const cookieStore = await cookies();
  cookieStore.delete(profileCookieName());
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(ServerConfig.sessionCookieName);
  await clearProfile();
}