import { NextRequest, NextResponse } from "next/server";
import { brokerFetch } from "@/lib/brokerFetch";
import { Endpoints } from "@/lib/endpoints";
import { readSession } from "@/lib/session";

/**
 * Generic, allow-listed pass-through to the AveonTrade broker API.
 *
 * The client never talks to pre-prod.odinwave.com directly (that would leak
 * the api-key/tokens and hit CORS). Instead it calls same-origin
 * `/api/broker/<logical-path>`, this route maps that to the real broker
 * endpoint from Endpoints, attaches auth headers server-side, and forwards
 * the response. This is the web analogue of `ApiClient` in
 * lib/core/network/api_service.dart.
 */
const ALLOWED_ENDPOINTS = new Set<string>(
  Object.values(Endpoints).flatMap((group) => Object.values(group))
);

function resolveEndpoint(pathSegments: string[]): string | null {
  const endpoint = "/" + pathSegments.join("/");

  // Exact match.
  if (ALLOWED_ENDPOINTS.has(endpoint)) return endpoint;

  // Some broker resources have more than one dynamic path component.
  // For example order cancellation is:
  //    /transactional/v1/orders/regular/{exchange}/{orderId}
  // The old resolver only removed one trailing segment, so the exchange
  // component caused a valid cancel request to be rejected as
  // "Unknown broker endpoint." Keep the allow-list, but accept any
  // dynamic suffix below a known endpoint. Prefer the longest matching
  // base endpoint so overlapping endpoint names remain deterministic.
  const matchingBase = Array.from(ALLOWED_ENDPOINTS)
    .sort((a, b) => b.length - a.length)
    .find((base) => endpoint.startsWith(`${base}/`));

  return matchingBase ? endpoint : null;
}

async function handle(req: NextRequest, path: string[], method: "GET" | "POST" | "PUT" | "DELETE") {
  // readSession() is now async because cookies() is async in Next.js 16
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }

  const endpoint = resolveEndpoint(path);
  if (!endpoint) {
    return NextResponse.json({ success: false, message: "Unknown broker endpoint." }, { status: 404 });
  }

  const search = req.nextUrl.search;
  // Flutter's ApiClient permits DELETE bodies; retain them for parity with
  // broker endpoints such as alert deletion.
  const body = method === "GET" ? undefined : await req.json().catch(() => undefined);

  const result = await brokerFetch(method, `${endpoint}${search}`, body);
  return NextResponse.json(result, { status: result.statusCode || 200 });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params;
  return handle(req, resolvedParams.path, "GET");
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params;
  return handle(req, resolvedParams.path, "POST");
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params;
  return handle(req, resolvedParams.path, "PUT");
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params;
  return handle(req, resolvedParams.path, "DELETE");
}