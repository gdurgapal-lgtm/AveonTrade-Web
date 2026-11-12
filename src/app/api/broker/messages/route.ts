import { NextRequest, NextResponse } from "next/server";
import { ServerConfig } from "@/lib/serverConfig";
import { brokerFetch, type BrokerApiResponse } from "@/lib/brokerFetch";
import { readSession } from "@/lib/session";

/**
 * Messages Hub proxy (Broker / Order / Exchange messages + Recommendations).
 *
 * The Synapsewave docs list `tenantid` as a PATH parameter for these calls, and
 * every working nontransactional call in this app embeds it:
 *   /nontransactional/{tenantId}/v1/<name>
 * The old page called /nontransactional/v1/<name> (no tenant) and the broker
 * answered 404 "An invalid request url was provided."
 *
 * The docs page text does not expose the exact <name>. Put the confirmed name
 * FIRST in each list below; the others are fallbacks. The first candidate that
 * does not answer 404 is remembered and logged:
 *   [AveonTrade] messages(order) resolved -> /nontransactional/1404/v1/...
 * After you see that line, delete the other candidates.
 */
type Kind = "order" | "broker" | "exchange" | "recommendations";

const CANDIDATES: Record<Kind, string[]> = {
  order: ["orderMessages", "getOrderMessages", "ordermessages", "getOrderMessage"],
  broker: ["brokerMessages", "getBrokerMessages", "brokermessages", "getBrokerMessage"],
  exchange: ["exchangeMessages", "getExchangeMessages", "exchangemessages", "getExchangeMessage"],
  recommendations: ["recommendation", "recommendations", "getRecommendations", "getRecommendation"],
};

const resolved = new Map<Kind, string>();

function pathFor(kind: Kind, name: string, segmentId: string): string {
  const tenant = encodeURIComponent(ServerConfig.tenantId);
  const base = `/nontransactional/${tenant}/v1/${name}`;
  return kind === "exchange" ? `${base}/${encodeURIComponent(segmentId)}` : base;
}

function rowCount(res: BrokerApiResponse): number {
  const body = res.data as any;
  const rows = Array.isArray(body) ? body : body?.result ?? body?.data;
  return Array.isArray(rows) ? rows.length : 0;
}

export async function GET(req: NextRequest) {
  if (!readSession()) {
    return NextResponse.json({ success: false, statusCode: 401, message: "Not authenticated.", data: null }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const kind = sp.get("type") as Kind;
  if (!kind || !(kind in CANDIDATES)) {
    return NextResponse.json({ success: false, statusCode: 400, message: "Unknown message type.", data: null }, { status: 400 });
  }

  const query = new URLSearchParams();
  query.set("pageNo", sp.get("pageNo") || "1");
  query.set("pageSize", sp.get("pageSize") || "10");
  if (kind === "exchange") query.set("noofhrs", sp.get("noofhrs") || "1");
  if (kind === "recommendations") {
    query.set("allowedNewsCat", sp.get("allowedNewsCat") || "25014,25033,25000,25035,25034,25039");
  }
  const segmentId = sp.get("segmentId") || "NSE_EQ";
  // Numeric segment id (1, 2, 8, ...). The docs example uses the name in the
  // path but the catalog/response use numbers, so we retry with the number if
  // the name form errors or returns nothing.
  const segmentNo = sp.get("segmentNo") || "";

  const names = resolved.has(kind)
    ? [resolved.get(kind)!]
    : CANDIDATES[kind];

  const tried: string[] = [];
  let last: BrokerApiResponse | null = null;
  for (const name of names) {
    const endpoint = `${pathFor(kind, name, segmentId)}?${query.toString()}`;
    tried.push(endpoint.split("?")[0]);
    const result = await brokerFetch("GET", endpoint);
    last = result;
    if (result.statusCode !== 404) {
      if (!resolved.has(kind)) {
        resolved.set(kind, name);
        // eslint-disable-next-line no-console
        console.log(`[AveonTrade] messages(${kind}) resolved -> ${pathFor(kind, name, segmentId)} (status ${result.statusCode})`);
      }
      if (kind === "exchange" && segmentNo && segmentNo !== segmentId && (!result.success || rowCount(result) === 0)) {
        const alt = await brokerFetch("GET", `${pathFor(kind, name, segmentNo)}?${query.toString()}`);
        if (alt.success && rowCount(alt) > 0) {
          // eslint-disable-next-line no-console
          console.log(`[AveonTrade] messages(exchange) ${segmentId}: name form empty/failed, numeric id ${segmentNo} returned data`);
          return NextResponse.json(alt, { status: alt.statusCode || 200 });
        }
      }
      return NextResponse.json(result, { status: result.statusCode || 200 });
    }
  }

  // eslint-disable-next-line no-console
  console.warn(`[AveonTrade] messages(${kind}) all candidates returned 404:`, tried);
  return NextResponse.json(
    {
      ...(last ?? { success: false, statusCode: 404, data: null, failureKind: "validation" }),
      message: `Broker returned 404 for: ${tried.join(", ")}`,
    },
    { status: 404 }
  );
}
