import { NextRequest, NextResponse } from "next/server";
import { brokerFetch } from "@/lib/brokerFetch";
import { ServerConfig } from "@/lib/serverConfig";
import { readSession } from "@/lib/session";

/**
 * Generate a CDSL TPIN using the documented tenant-specific SynapseWave API.
 * The tenant ID and broker credentials stay server-side.
 */
export async function POST(req: NextRequest) {
  if (!readSession()) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON request." }, { status: 400 });
  }

  const dpid = String(body.dpid ?? "").trim();
  const boid = String(body.boid ?? "").trim();
  const dp_type = String(body.dp_type ?? "").trim().toUpperCase();
  const pan = String(body.pan ?? "").trim().toUpperCase();

  if (!dpid || !boid || !pan || dp_type !== "CDSL") {
    return NextResponse.json({ success: false, message: "DP ID, BOID, PAN and CDSL depository type are required." }, { status: 400 });
  }
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
    return NextResponse.json({ success: false, message: "Enter a valid 10-character PAN." }, { status: 400 });
  }
  if (!ServerConfig.tenantId.trim()) {
    return NextResponse.json({ success: false, message: "Tenant ID is not configured." }, { status: 500 });
  }

  const endpoint = `/nontransactional/${encodeURIComponent(ServerConfig.tenantId)}/v1/generateTPIN`;
  const result = await brokerFetch("POST", endpoint, { dpid, boid, dp_type, pan });
  return NextResponse.json(result, { status: result.statusCode || (result.success ? 200 : 502) });
}
