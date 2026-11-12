import { NextResponse } from "next/server";
import { ServerConfig } from "@/lib/serverConfig";
import { brokerFetch, type BrokerApiResponse } from "@/lib/brokerFetch";
import { readSession } from "@/lib/session";

/**
 * Market status for all exchange segments (Synapsewave CloudRest > Market >
 * Market Status). The docs list `tenantid` as a PATH parameter, so the broker
 * path is /nontransactional/{tenantId}/v1/<name> like getScripLookUp.
 *
 * The docs page text does not expose <name>. Put the confirmed name FIRST; the
 * others are fallbacks. The first candidate that does not answer 404 is
 * remembered and logged:
 *   [AveonTrade] market-status resolved -> /nontransactional/1404/v1/...
 * Once you see that line, delete the other candidates.
 *
 * Response (per docs): { status:"success", code, message, data:[
 *   { exchangeSegment:"NSE_EQ", lastUpdatedTime:"24/06/2022 19:40:00", marketStatus:"Open" } ] }
 */
const CANDIDATES = ["marketStatus", "MarketStatus", "getMarketStatus", "marketstatus", "getmarketstatus"];
let resolved: string | null = null;

const pathFor = (name: string) =>
  `/nontransactional/${encodeURIComponent(ServerConfig.tenantId)}/v1/${name}`;

export async function GET() {
  if (!readSession()) {
    return NextResponse.json({ success: false, statusCode: 401, message: "Not authenticated.", data: null }, { status: 401 });
  }

  const tried: string[] = [];
  let last: BrokerApiResponse | null = null;
  for (const name of resolved ? [resolved] : CANDIDATES) {
    tried.push(pathFor(name));
    const result = await brokerFetch("GET", pathFor(name));
    last = result;
    if (result.statusCode !== 404) {
      if (!resolved) {
        resolved = name;
        // eslint-disable-next-line no-console
        console.log(`[AveonTrade] market-status resolved -> ${pathFor(name)} (status ${result.statusCode})`);
      }
      return NextResponse.json(result, { status: result.statusCode || 200 });
    }
  }

  // eslint-disable-next-line no-console
  console.warn("[AveonTrade] market-status: all candidates returned 404:", tried);
  return NextResponse.json(
    {
      ...(last ?? { success: false, statusCode: 404, data: null, failureKind: "validation" }),
      message: `Broker returned 404 for: ${tried.join(", ")}`,
    },
    { status: 404 }
  );
}
