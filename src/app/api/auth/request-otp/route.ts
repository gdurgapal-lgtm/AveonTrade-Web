import { NextRequest, NextResponse } from "next/server";
import { ServerConfig } from "@/lib/serverConfig";
import { Endpoints } from "@/lib/endpoints";
import { takeRateLimit } from "@/lib/requestRateLimit";

/**
 * Mirrors the confirmed-working Python reference client's login flow
 * (send_otp -> login), which itself mirrors AuthService.sendOtp() from
 * lib/features/auth/services/auth_service.dart:
 *
 *   POST /authentication/v1/user/password/reset/send-otp
 *     { user_id, api_key, source }
 *
 * No discovery/"checkLoginOptions" call beforehand — that extra call isn't
 * part of the working flow and was likely the source of the earlier
 * "contact Administrator" error.
 */
export async function POST(req: NextRequest) {
  const { userId } = await req.json();

  if (!userId) {
    return NextResponse.json({ success: false, message: "User ID is required." }, { status: 400 });
  }
  if (!takeRateLimit("login-otp", String(userId), 3, 5 * 60 * 1000)) {
    return NextResponse.json({ success: false, message: "Too many OTP requests. Please wait and try again." }, { status: 429 });
  }

  try {
    const payload = { user_id: userId, api_key: ServerConfig.apiKey, source: ServerConfig.source };

    console.log("[AveonTrade] OTP request started.");

    const res = await fetch(`${ServerConfig.baseUrl}${Endpoints.auth.sendOtp}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        tenantid: ServerConfig.tenantId,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const rawText = await res.text();
    // eslint-disable-next-line no-console
    console.log("[AveonTrade] OTP response status:", res.status);
    const json = rawText ? JSON.parse(rawText) : null;
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
