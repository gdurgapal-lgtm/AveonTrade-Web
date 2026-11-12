import { NextResponse } from "next/server";
import { brokerFetch } from "@/lib/brokerFetch";
import { readSession } from "@/lib/session";
import { ServerConfig } from "@/lib/serverConfig";

export async function DELETE(_req: Request, { params }: { params: Promise<{ alertId: string }> }) {
  // 1. Await params and session since they are asynchronous in Next.js 16
  const resolvedParams = await params;
  const session = await readSession();
  
  if (!session) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }

  const userId = encodeURIComponent(session.userId ?? "");
  const alertId = encodeURIComponent(resolvedParams.alertId);
  const endpoint = `/alert-nodeengine/${encodeURIComponent(ServerConfig.tenantId)}/v1/alerts/setScripAlert/${userId}/${alertId}`;
  
  const result = await brokerFetch("DELETE", endpoint);
  return NextResponse.json(result, { status: result.statusCode || 200 });
}