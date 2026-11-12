import { NextRequest, NextResponse } from "next/server";
import { brokerFetch } from "@/lib/brokerFetch";
import { readSession } from "@/lib/session";
import { ServerConfig } from "@/lib/serverConfig";

function upstream(path: string) {
  return `/alert-nodeengine/${encodeURIComponent(ServerConfig.tenantId)}${path}`;
}

async function guard() {
  const session = await readSession();
  if (!session) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  return null;
}

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  const session = await readSession();
  const userId = encodeURIComponent(session?.userId ?? "");
  const result = await brokerFetch("GET", upstream(`/v1/alerts/getUserAlerts/${userId}`));
  return NextResponse.json(result, { status: result.statusCode || 200 });
}

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const session = await readSession();
  const payload = body && typeof body === "object" ? { ...(body as Record<string, any>) } : {};
  const data = payload.data && typeof payload.data === "object" ? { ...(payload.data as Record<string, any>) } : {};
  data.userid = session?.userId ?? "";
  data.tenantid = ServerConfig.tenantId;
  payload.data = data;
  const result = await brokerFetch("POST", upstream("/v1/alerts/setScripAlert"), payload);
  return NextResponse.json(result, { status: result.statusCode || 200 });
}