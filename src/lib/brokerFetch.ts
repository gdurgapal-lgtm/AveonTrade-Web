import { ServerConfig, isTrustedBrokerUrl } from "./serverConfig";
import { readSession } from "./session";

export interface BrokerApiResponse<T = unknown> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T | null;
  failureKind:
    | "none"
    | "network"
    | "timeout"
    | "unauthorized"
    | "forbidden"
    | "server"
    | "validation"
    | "configuration"
    | "malformedResponse";
}

const REQUEST_TIMEOUT_MS = 25_000;

function failureKindForStatus(status: number): BrokerApiResponse["failureKind"] {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status >= 500) return "server";
  return "validation";
}

/**
 * Server-side equivalent of `ApiClient` (lib/core/network/api_service.dart).
 * Adds tenantid / x-api-key / Authorization / session_token headers exactly
 * like the Flutter client did, then normalizes the broker's response shape.
 */
export async function brokerFetch<T = unknown>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  endpoint: string,
  body?: unknown
): Promise<BrokerApiResponse<T>> {
  const url = `${ServerConfig.baseUrl}${endpoint}`;

  if (!ServerConfig.hasTradingConfiguration || !isTrustedBrokerUrl(url)) {
    return {
      success: false,
      statusCode: 0,
      message: "Broker connection is not securely configured.",
      data: null,
      failureKind: "configuration",
    };
  }

  // Await readSession() since it is asynchronous in Next.js 16
  const session = await readSession();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    tenantid: ServerConfig.tenantId,
    "x-api-key": ServerConfig.apiKey,
  };
  if (session?.accessToken) headers["Authorization"] = `Bearer ${session.accessToken}`;
  if (session?.sessionToken) headers["session_token"] = session.sessionToken;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

    const text = await res.text();
    // eslint-disable-next-line no-console
    console.log(`[AveonTrade] ${method} ${endpoint} ->`, res.status);
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (json === null) {
      return {
        success: res.ok,
        statusCode: res.status,
        message: text || "Malformed response from broker.",
        data: null,
        failureKind: res.ok ? "malformedResponse" : failureKindForStatus(res.status),
      };
    }

    let success = res.ok;
    if (res.ok && json && typeof json === "object" && "status" in json) {
      const status = json.status;
      success = typeof status === "boolean" ? status : String(status).toLowerCase() === "success";
    }

    return {
      success,
      statusCode: res.status,
      message: (json?.message ?? json?.error_message ?? "").toString(),
      data: (json?.data ?? json) as T,
      failureKind: success ? "none" : failureKindForStatus(res.status),
    };
  } catch (error: any) {
    clearTimeout(timeout);
    const isTimeout = error?.name === "AbortError";
    return {
      success: false,
      statusCode: isTimeout ? 408 : 0,
      message: isTimeout
        ? "Request timed out. Check the order book before retrying."
        : "Unable to reach the broker. Check your connection and retry.",
      data: null,
      failureKind: isTimeout ? "timeout" : "network",
    };
  }
}