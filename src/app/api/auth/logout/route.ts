import { NextResponse } from "next/server";
import { brokerFetch } from "@/lib/brokerFetch";
import { Endpoints } from "@/lib/endpoints";
import { clearSession, readSession } from "@/lib/session";

export async function POST() {
  // Match the mobile logout flow and invalidate the broker session too. A
  // local cookie is always cleared, even if the broker is temporarily down.
  const session = await readSession();
  if (session) await brokerFetch("DELETE", Endpoints.auth.session);
  await clearSession();
  return NextResponse.json({ success: true });
}