import { NextRequest, NextResponse } from "next/server";
import { ServerConfig } from "@/lib/serverConfig";
import { Endpoints } from "@/lib/endpoints";
import { toSafeSocketUrl } from "@/lib/safeSocketUrl";
import { clearProfile, writeProfile, writeSession } from "@/lib/session";
import { takeRateLimit } from "@/lib/requestRateLimit";

type BroadcastSocket = { host: string; port: number; ssl: boolean };

function parseBroadcastSocket(raw: unknown): BroadcastSocket | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;

  const withScheme = /^wss?:\/\//i.test(value) ? value : `wss://${value}`;

  try {
    const url = new URL(withScheme);
    if (
      !["ws:", "wss:"].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password ||
      (url.pathname !== "/" && url.pathname !== "") ||
      url.search ||
      url.hash
    ) return null;

    // Explicit ports of any valid value (e.g. 8443) are preserved.
    // Protocol defaults apply only when the URL omits a port.
    const port = url.port
      ? Number(url.port)
      : url.protocol === "wss:"
        ? 443
        : 80;

    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;

    return { host: url.hostname, port, ssl: url.protocol === "wss:" };
  } catch {
    return null;
  }
}

function firstToken(...values: unknown[]): string {
  for (const value of values) {
    const token = String(value ?? "").trim();
    if (token) return token;
  }
  return "";
}

/**
 * Logs in through the broker's session endpoint. Tokens are stored in an
 * httpOnly cookie and are never returned to browser-side code.
 */
export async function POST(req: NextRequest) {
  const {
    userId,
    password,
    otp,
    loginType = "PASSWORD",
    secondAuthType = "OTP",
    remember = false,
  } = await req.json();

  if (!userId || !password) {
    return NextResponse.json(
      { success: false, message: "User ID and password are required." },
      { status: 400 }
    );
  }
  if (!ServerConfig.hasSessionSigningConfiguration) {
    return NextResponse.json({ success: false, message: "Server session security is not configured." }, { status: 500 });
  }
  if (!takeRateLimit("login", String(userId), 10, 5 * 60 * 1000)) {
    return NextResponse.json({ success: false, message: "Too many login attempts. Please wait and try again." }, { status: 429 });
  }

  try {
    const payload = {
      user_id: userId,
      login_type: loginType,
      password,
      second_auth_type: secondAuthType,
      second_auth: otp ?? "",
      api_key: ServerConfig.apiKey,
      source: ServerConfig.source,
      UDID: ServerConfig.udid,
      version: ServerConfig.version,
      build_version: "22.11.01",
      deviceinfo: { UDID: ServerConfig.udid, DevicePlatform: "desktop" },
    };

    // Never write credentials, API-key material, tenant identifiers, or login
    // payloads to logs. Production log retention is outside the user's control.
    console.log("[AveonTrade] Login request started.");

    const res = await fetch(`${ServerConfig.baseUrl}${Endpoints.auth.session}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        tenantid: ServerConfig.tenantId,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const rawText = await res.text();
    // eslint-disable-next-line no-console
    console.log("[AveonTrade] Login response status:", res.status);
    const json = rawText ? JSON.parse(rawText) : null;
    const status = String(json?.status ?? "").toLowerCase();

    if (!res.ok || status !== "success") {
      return NextResponse.json(
        { success: false, message: json?.message ?? json?.error_message ?? "Login failed." },
        { status: res.status || 401 }
      );
    }

    const data = json?.data ?? {};
    const others = data.others && typeof data.others === "object" ? data.others : {};

    const accessToken = firstToken(
      data.access_token, data.accessToken, data.jToken, data.jtoken,
      json?.access_token, json?.accessToken, json?.jToken, json?.jtoken,
      others.access_token, others.accessToken, others.jToken, others.jtoken,
      res.headers.get("access_token"), res.headers.get("access-token"),
      res.headers.get("jtoken"), res.headers.get("j-token"),
      res.headers.get("authorization")
    );

    const sessionToken = firstToken(
      data.session_token, data.sessionToken, data.session_id, data.sessionId,
      data.session_key, data.sessionKey, data.sid, data.sToken, data.stoken,
      json?.session_token, json?.sessionToken, json?.session_id, json?.sessionId,
      json?.session_key, json?.sessionKey, json?.sid, json?.sToken, json?.stoken,
      others.session_token, others.sessionToken, others.session_id, others.sessionId,
      others.session_key, others.sessionKey, others.sid, others.sToken, others.stoken,
      res.headers.get("session_token"), res.headers.get("session-token"),
      res.headers.get("sessiontoken"), res.headers.get("x-session-token"),
      res.headers.get("sid"), res.headers.get("stoken")
    );

    const broadcastToken = firstToken(
      data.broadcast_access_token, data.broadcastAccessToken, data.broadcast_token,
      data.broadcastToken, data.bcast_token, data.bcastToken,
      json?.broadcast_access_token, json?.broadcastAccessToken, json?.broadcast_token,
      json?.broadcastToken, json?.bcast_token, json?.bcastToken,
      others.broadcast_access_token, others.broadcastAccessToken, others.broadcast_token,
      others.broadcastToken, others.bcast_token, others.bcastToken,
      res.headers.get("broadcast_access_token"), res.headers.get("broadcast-token"),
      res.headers.get("broadcasttoken"), res.headers.get("bcast_token"),
      res.headers.get("bcast-token"), sessionToken, accessToken
    );

    // Server-only custom URL takes precedence. The NEXT_PUBLIC_ variable remains
    // supported for compatibility; otherwise use the URL returned by broker login.
    const configuredBroadcastUrl =
      process.env.AVEON_BROADCAST_URL?.trim() ||
      process.env.NEXT_PUBLIC_BROADCAST_URL?.trim();
    const brokerBroadcastUrl = others.broadCastSocket ?? others.broadcastSocket;

    const broadcast = configuredBroadcastUrl
      ? parseBroadcastSocket(configuredBroadcastUrl)
      : parseBroadcastSocket(brokerBroadcastUrl);

    if (configuredBroadcastUrl && !broadcast) {
      console.error("[AveonTrade] Configured broadcast URL is invalid.");
      return NextResponse.json(
        {
          success: false,
          message: "The configured broadcast URL is invalid. Please check the server configuration.",
        },
        { status: 500 }
      );
    }

    // eslint-disable-next-line no-console
    console.log(
      "[AveonTrade] Login broadcast socket ->",
      configuredBroadcastUrl ? "Using configured broadcast URL" : "Using broker login response",
      "| resolved:",
      broadcast ? `${broadcast.host}:${broadcast.port} ssl=${broadcast.ssl}` : "(not provided)"
    );

    await writeSession(
      {
        accessToken,
        sessionToken,
        broadcastToken,
        userId: data.user_id ?? data.userid ?? userId,
        clientId: data.client_id ?? data.clientId,
        groupId: others.groupId ?? others.group_id ?? "HO",
        broadcastHost: broadcast?.host,
        broadcastPort: broadcast?.port,
        broadcastSsl: broadcast?.ssl,
        messageSocketUrl:
          toSafeSocketUrl(others.messageSocket ?? others.messageSocketURL) ?? undefined,
      },
      Boolean(remember)
    );

    const exchanges: string[] = Array.isArray(data.exchanges)
      ? Array.from(
          new Set(
            data.exchanges
              .map((e: unknown) => String(e ?? "").trim().toUpperCase())
              .filter(Boolean)
          )
        )
      : [];

    const productTypesByExchange: Record<string, string[]> = {};
    if (data.product_types_exchange && typeof data.product_types_exchange === "object") {
      for (const [exchange, products] of Object.entries(
        data.product_types_exchange as Record<string, unknown>
      )) {
        if (Array.isArray(products)) {
          productTypesByExchange[exchange.toUpperCase()] = products.map((p) =>
            String(p).toUpperCase()
          );
        }
      }
    }

    if (exchanges.length) {
      await writeProfile({ exchanges, productTypesByExchange }, Boolean(remember));
    } else {
      await clearProfile();
    }

    // Never echo raw tokens back to the browser.
    const {
      access_token, accessToken: _a, jToken: _j, jtoken: _jt,
      session_token, sessionToken: _s, session_id, sessionId: _sI,
      broadcast_access_token, broadcastAccessToken: _ba,
      broadcast_token, broadcastToken: _bt,
      ...safeData
    } = data;

    return NextResponse.json({
      success: true,
      message: json?.message ?? "Login successful.",
      data: safeData,
    });
  } catch (error) {
    console.error(
      "[AveonTrade] Login request failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
    return NextResponse.json(
      { success: false, message: "Unable to reach the broker. Check your connection and retry." },
      { status: 502 }
    );
  }
}
