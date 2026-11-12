import { NextRequest, NextResponse } from "next/server";
import { ServerConfig } from "@/lib/serverConfig";
import { Endpoints } from "@/lib/endpoints";

/**
 * Ports AuthService.setPassword():
 *   PUT /authentication/v1/user/password/reset
 *   { user_id, api_key, source, otp, new_password }
 */
export async function PUT(req: NextRequest) {
  const { userId, otp, newPassword } = await req.json();
  if (!userId || !otp || !newPassword) {
    return NextResponse.json(
      { success: false, message: "User ID, OTP, and new password are required." },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${ServerConfig.baseUrl}${Endpoints.auth.passwordReset}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        tenantid: ServerConfig.tenantId,
      },
      body: JSON.stringify({
        user_id: userId,
        api_key: ServerConfig.apiKey,
        source: ServerConfig.source,
        otp,
        new_password: newPassword,
      }),
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    const status = String(json?.status ?? "").toLowerCase();
    const success = res.ok && status === "success";
    return NextResponse.json(
      { success, message: json?.message ?? (success ? "Password updated." : "Failed to update password.") },
      { status: res.status || 200 }
    );
  } catch {
    return NextResponse.json(
      { success: false, message: "Unable to reach the broker. Check your connection and retry." },
      { status: 502 }
    );
  }
}
