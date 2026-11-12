import { NextRequest, NextResponse } from "next/server";
import { ServerConfig } from "@/lib/serverConfig";
import { brokerFetch } from "@/lib/brokerFetch";
import { readSession } from "@/lib/session";

/**
 * Scrips banned in F&O for the day (Synapsewave CloudRest > Market > Banned Scrips).
 *
 *   GET /nontransactional/{tenantId}/v1/BannedScrips[?exchange=NSE_FO][&token=53751]
 *
 * Response: { status:"success", code, message, data:[{ exchange, token, symbol }] }
 */
export async function GET(req: NextRequest) {
  if (!readSession()) {
    return NextResponse.json({ success: false, statusCode: 401, message: "Not authenticated.", data: null }, { status: 401 });
  }

  const query = new URLSearchParams();
  const exchange = req.nextUrl.searchParams.get("exchange")?.trim();
  const token = req.nextUrl.searchParams.get("token")?.trim();
  if (exchange && /^[A-Za-z_]{2,16}$/.test(exchange)) query.set("exchange", exchange.toUpperCase());
  if (token && /^\d{1,12}$/.test(token)) query.set("token", token);

  const qs = query.toString();
  const endpoint = `/nontransactional/${encodeURIComponent(ServerConfig.tenantId)}/v1/BannedScrips${qs ? `?${qs}` : ""}`;

  const result = await brokerFetch("GET", endpoint);
  return NextResponse.json(result, { status: result.statusCode || 200 });
}
