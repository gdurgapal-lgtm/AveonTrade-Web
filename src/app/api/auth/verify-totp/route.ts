import { NextRequest, NextResponse } from "next/server";
import { brokerFetch } from "@/lib/brokerFetch";
import { Endpoints } from "@/lib/endpoints";

/** Mirrors the verifytotp call used by AuthService for 2FA. */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = await brokerFetch("POST", Endpoints.auth.verifyTotp, body);
  return NextResponse.json(result, { status: result.statusCode || 200 });
}
