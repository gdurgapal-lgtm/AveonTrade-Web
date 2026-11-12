import { NextRequest, NextResponse } from "next/server";
import { ServerConfig } from "@/lib/serverConfig";
import { brokerFetch } from "@/lib/brokerFetch";

/**
 * Ports MarketWatchService.searchInstrument() from
 * lib/features/market_watch/services/marketwatch_service.dart:
 *
 *   GET /nontransactional/{tenantId}/v1/getScripLookUp/{query}/-1
 *
 * Confirmed live in the reference Python client too. Response shape is an
 * Elasticsearch-style result: data.result.hits.hits[]._source.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim().toUpperCase();
  if (!q) {
    return NextResponse.json({ success: false, message: "Missing query.", data: null }, { status: 400 });
  }

  const endpoint = `/nontransactional/${encodeURIComponent(ServerConfig.tenantId)}/v1/getScripLookUp/${encodeURIComponent(
    q
  )}/-1`;

  const result = await brokerFetch("GET", endpoint);
  return NextResponse.json(result, { status: result.statusCode || 200 });
}
