import { NextResponse } from "next/server";
import { readProfile, readSession } from "@/lib/session";

export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }
  const profile = await readProfile();
  return NextResponse.json({
    authenticated: true,
    userId: session.userId,
    clientId: session.clientId,
    groupId: session.groupId ?? "HO",
    exchanges: profile?.exchanges ?? [],
    productTypesByExchange: profile?.productTypesByExchange ?? {},
  });
}