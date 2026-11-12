import { NextRequest, NextResponse } from "next/server";
import { ServerConfig } from "@/lib/serverConfig";
import { Endpoints } from "@/lib/endpoints";
import { takeRateLimit } from "@/lib/requestRateLimit";

/**
 * Ports AuthService's password-reset send-otp call from
 * lib/features/auth/services/auth_service.dart — same endpoint the login
 * OTP flow uses:
 *   POST /authentication/v1/user/password/reset/send-otp
 *   { user_id, api_key, source }
 */
export async function POST(req: NextRequest) {
  const { userId } = await req.json();
  if (!userId) {
    return NextResponse.json({ success: false, message: "User ID is required." }, { status: 400 });
  }
  if (!takeRateLimit("reset-otp", String(userId), 3, 5 * 60 * 1000)) {
    return NextResponse.json({ success: false, message: "Too many OTP requests. Please wait and try again." }, { status: 429 });
  }

  try {
    const res = await fetch(`${ServerConfig.baseUrl}${Endpoints.auth.sendOtp}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        tenantid: ServerConfig.tenantId,
      },
      body: JSON.stringify({ user_id: userId, api_key: ServerConfig.apiKey, source: ServerConfig.source }),
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    const status = String(json?.status ?? "").toLowerCase();
    const success = res.ok && status === "success";
    return NextResponse.json(
      { success, message: json?.message ?? (success ? "OTP sent." : "Failed to send OTP.") },
      { status: res.status || 200 }
    );
  } catch {
    return NextResponse.json(
      { success: false, message: "Unable to reach the broker. Check your connection and retry." },
      { status: 502 }
    );
  }
}
