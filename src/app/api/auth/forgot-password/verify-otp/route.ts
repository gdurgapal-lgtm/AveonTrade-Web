import { NextRequest, NextResponse } from "next/server";
import { ServerConfig } from "@/lib/serverConfig";
import { Endpoints } from "@/lib/endpoints";

/**
 * Ports AuthService.verifyPasswordResetOtp():
 *   POST /authentication/v1/user/otp/verify
 *   { user_id, api_key, source, otp }
 */
export async function POST(req: NextRequest) {
  const { userId, otp } = await req.json();
  if (!userId || !otp) {
    return NextResponse.json({ success: false, message: "User ID and OTP are required." }, { status: 400 });
  }

  try {
    const res = await fetch(`${ServerConfig.baseUrl}${Endpoints.auth.verifyOtp}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        tenantid: ServerConfig.tenantId,
      },
      body: JSON.stringify({ user_id: userId, api_key: ServerConfig.apiKey, source: ServerConfig.source, otp }),
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    const status = String(json?.status ?? "").toLowerCase();
    const success = res.ok && status === "success";
    return NextResponse.json(
      { success, message: json?.message ?? (success ? "OTP verified." : "Invalid OTP.") },
      { status: res.status || 200 }
    );
  } catch {
    return NextResponse.json(
      { success: false, message: "Unable to reach the broker. Check your connection and retry." },
      { status: 502 }
    );
  }
}
