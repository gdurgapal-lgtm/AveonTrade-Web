"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card, Input } from "@/components/ui/Primitives";

type Step = "userId" | "otp" | "password" | "done";

/**
 * Ports the real 3-call reset flow from AuthService:
 *   1. send-otp   -> POST /authentication/v1/user/password/reset/send-otp
 *   2. verify-otp -> POST /authentication/v1/user/otp/verify
 *   3. reset      -> PUT  /authentication/v1/user/password/reset
 */
export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("userId");
  const [userId, setUserId] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.message ?? "Unable to send OTP.");
        return;
      }
      setInfo(json.message || "OTP sent to your registered mobile/email.");
      setStep("otp");
    } catch {
      setError("Network error while sending OTP.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, otp }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.message ?? "Invalid OTP.");
        return;
      }
      setInfo(null);
      setStep("password");
    } catch {
      setError("Network error while verifying OTP.");
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password/reset", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, otp, newPassword }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.message ?? "Failed to update password.");
        return;
      }
      setStep("done");
    } catch {
      setError("Network error while updating password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-aveon-bg px-4">
      <Card className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-2xl font-bold">
            AVEON<span className="text-aveon-accent">TRADE</span>
          </p>
          <p className="mt-1 text-xs text-aveon-muted">Reset your password</p>
        </div>

        {step === "userId" && (
          <form onSubmit={sendOtp} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-aveon-muted">User ID</label>
              <Input
                value={userId}
                onChange={(e) => setUserId(e.target.value.toUpperCase())}
                className="uppercase placeholder:normal-case"
                required
                autoFocus
              />
            </div>
            {error && <p className="text-xs text-aveon-sell">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending…" : "Send OTP"}
            </Button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={verifyOtp} className="space-y-3">
            <p className="text-xs text-aveon-muted">
              Verifying <span className="text-aveon-text">{userId}</span>.{" "}
              <button
                type="button"
                onClick={() => {
                  setStep("userId");
                  setOtp("");
                  setError(null);
                }}
                className="text-aveon-primary hover:underline"
              >
                Not you?
              </button>
            </p>
            {info && <p className="text-xs text-aveon-buy">{info}</p>}
            <div>
              <label className="mb-1 block text-xs text-aveon-muted">OTP</label>
              <Input value={otp} onChange={(e) => setOtp(e.target.value)} required autoFocus />
            </div>
            {error && <p className="text-xs text-aveon-sell">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Verifying…" : "Verify OTP"}
            </Button>
            <button
              type="button"
              onClick={sendOtp as unknown as () => void}
              disabled={loading}
              className="w-full text-center text-xs text-aveon-primary hover:underline"
            >
              Resend OTP
            </button>
          </form>
        )}

        {step === "password" && (
          <form onSubmit={resetPassword} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-aveon-muted">New Password</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-aveon-muted">Confirm Password</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-xs text-aveon-sell">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Updating…" : "Update Password"}
            </Button>
          </form>
        )}

        {step === "done" && (
          <div className="space-y-3 text-center">
            <p className="text-sm text-aveon-buy">Password updated successfully.</p>
            <Link href="/login">
              <Button className="w-full">Back to Sign In</Button>
            </Link>
          </div>
        )}

        {step !== "done" && (
          <p className="mt-4 text-center text-xs text-aveon-muted">
            <Link href="/login" className="text-aveon-primary hover:underline">
              Back to Sign In
            </Link>
          </p>
        )}
      </Card>
    </div>
  );
}
