import { NextResponse } from "next/server";
import { ServerConfig } from "@/lib/serverConfig";
import { brokerFetch } from "@/lib/brokerFetch";

/** Server-side proxy for SynapseWave Index Details. */
export async function GET() {
  try {
    const tenantId = ServerConfig.tenantId;
    if (!tenantId) {
      return NextResponse.json(
        { status: false, message: "Broker tenant ID is not configured." },
        { status: 500 },
      );
    }

    const endpoint = `/nontransactional/${encodeURIComponent(tenantId)}/v1/getIndexDetails`;
    const result = await brokerFetch("GET", endpoint);

    return NextResponse.json(result, {
      status: result?.statusCode || 200,
    });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Unable to fetch index details.";
    return NextResponse.json({ status: false, message }, { status: 500 });
  }
}
