"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ChartNoAxesCombined, Eye, EyeOff, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";
import { Button, Card, Input } from "@/components/ui/Primitives";
import { useAuthStore } from "@/lib/authStore";
import ThemeToggle from "@/components/theme/ThemeToggle"; // Import your shared theme toggle component

/**
 * Ports the two-step login flow from
 * lib/features/auth/screens (password -> second factor) onto the web:
 * Step 1: POST /api/auth/login with user_id + password.
 * Step 2 (if the broker demands 2FA): POST /api/auth/login again including
 * the OTP/TOTP the user enters.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);

  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (params.get("expired") === "1") {
      setError("Your session has expired. Please sign in again.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Step 1: validate credentials, then trigger the broker to send an OTP. */
  async function requestOtp(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      let json: any;
      try {
        json = await res.json();
      } catch {
        setError(`Unexpected response from server (HTTP ${res.status}). Check the server console.`);
        return;
      }
      if (!json.success) {
        setError(json.message ?? "Unable to send OTP.");
        return;
      }
      setInfo(json.message || "OTP sent to your registered mobile/email.");
      setStep("otp");
    } catch (err: any) {
      setError(err?.message ?? "Network error while requesting OTP.");
    } finally {
      setLoading(false);
    }
  }

  /** Step 2: complete login with the OTP the broker just sent. */
  async function verifyAndLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, password, otp, remember }),
      });
      let json: any;
      try {
        json = await res.json();
      } catch {
        setError(`Unexpected response from server (HTTP ${res.status}). Check the server console.`);
        return;
      }

      if (!json.success) {
        setError(json.message ?? "Login failed.");
        return;
      }

      setAuthenticated(json.data?.user_id ?? userId, json.data?.client_id ?? null);
      router.push(params.get("next") || "/dashboard");
    } catch (err: any) {
      setError(err?.message ?? "Network error while signing in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative grid min-h-screen overflow-hidden bg-aveon-bg lg:grid-cols-[1.05fr_.95fr]">
      {/* Theme Toggle placed in the absolute top-right of the screen */}
      <div className="absolute right-6 top-6 z-20">
        <ThemeToggle />
      </div>

      <div className="pointer-events-none absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-aveon-primary/10 blur-3xl" />
      <section className="relative hidden border-r border-aveon-border p-10 lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-aveon-primary text-xl font-bold text-white">A</div><div><p className="text-lg font-bold tracking-tight">AVEON<span className="text-aveon-accent">TRADE</span></p><p className="text-xs text-aveon-muted">Professional Web Terminal</p></div></div>
        <div className="max-w-lg"><div className="mb-6 inline-flex items-center gap-2 rounded-full border border-aveon-primary/30 bg-aveon-primary/10 px-3 py-1.5 text-xs font-medium text-aveon-primary"><ShieldCheck size={14} /> Secure broker sign-in</div><h1 className="text-4xl font-semibold leading-tight">Trade with clarity.<br /><span className="text-aveon-primary">Stay in control.</span></h1><p className="mt-5 max-w-md text-sm leading-6 text-aveon-muted">Your orders, holdings, funds and live market data in one focused AveonTrade workspace.</p><div className="mt-10 grid grid-cols-3 gap-3">{[[ChartNoAxesCombined, "Live markets"], [LockKeyhole, "Protected session"], [ShieldCheck, "Broker connected"]].map(([Icon, label]) => { const FeatureIcon = Icon as typeof ChartNoAxesCombined; return <div key={label as string} className="rounded-xl border border-aveon-border bg-aveon-panel/60 p-3"><FeatureIcon size={17} className="text-aveon-primary" /><p className="mt-3 text-xs font-medium">{label as string}</p></div>; })}</div></div>
        <p className="text-xs text-aveon-muted">© {new Date().getFullYear()} AveonTrade. Trading involves market risk.</p>
      </section>

      <section className="relative flex items-center justify-center px-4 py-10 sm:px-8">
      <Card className="w-full max-w-md border-aveon-border/80 bg-aveon-panel/95 p-6 shadow-2xl sm:p-8">
        <div className="mb-7">
          <div className="mb-5 flex items-center gap-2 lg:hidden"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-aveon-primary font-bold text-white">A</div><p className="font-bold">AVEON<span className="text-aveon-accent">TRADE</span></p></div>
          <p className="text-xl font-semibold">{step === "credentials" ? "Welcome to AveonTrade" : "Verify your sign-in"}</p>
          <p className="mt-1 text-sm text-aveon-muted">{step === "credentials" ? "Enter your trading account details to continue." : "Enter the code sent to your registered contact."}</p>
          <div className="mt-5 flex items-center gap-2 text-xs"><span className="flex items-center gap-1.5 text-aveon-primary"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-aveon-primary text-[10px] text-white">1</span> Account</span><span className="h-px flex-1 bg-aveon-border" /><span className={step === "otp" ? "flex items-center gap-1.5 text-aveon-primary" : "flex items-center gap-1.5 text-aveon-muted"}><span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${step === "otp" ? "bg-aveon-primary text-white" : "bg-aveon-panel2"}`}>2</span> Verify</span></div>
        </div>

        {step === "credentials" ? (
          <form onSubmit={requestOtp} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-aveon-muted">Client ID / User ID</label>
              <Input
                value={userId}
                onChange={(e) => setUserId(e.target.value.toUpperCase())}
                className="uppercase placeholder:normal-case"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-aveon-muted">Password</label>
              <div className="relative"><Input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required className="pr-10" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-aveon-muted hover:text-aveon-text">{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></div>
            </div>

            {error && <p className="text-xs text-aveon-sell">{error}</p>}

            <label className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-aveon-muted">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                Remember me
              </span>
              <Link href="/forgot-password" className="text-aveon-primary hover:underline">
                Forgot password?
              </Link>
            </label>

            <Button type="submit" className="w-full" disabled={loading}>
              <span className="inline-flex items-center gap-2">{loading ? "Checking account…" : "Continue securely"}<ArrowRight size={15} /></span>
            </Button>
          </form>
        ) : (
          <form onSubmit={verifyAndLogin} className="space-y-3">
            <p className="text-xs text-aveon-muted">
              Signing in as <span className="text-aveon-text">{userId}</span>.{" "}
              <button
                type="button"
                onClick={() => {
                  setStep("credentials");
                  setOtp("");
                  setError(null);
                  setInfo(null);
                }}
                className="text-aveon-primary hover:underline"
              >
                Not you?
              </button>
            </p>

            {info && <p className="text-xs text-aveon-buy">{info}</p>}

            <div>
              <label className="mb-1 block text-xs font-medium text-aveon-muted">OTP / TOTP</label>
              <Input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\s/g, ""))} inputMode="numeric" maxLength={8} required autoFocus className="tracking-[0.35em]" placeholder="••••••" />
            </div>

            {error && <p className="text-xs text-aveon-sell">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Verifying…" : "Verify & enter terminal"}
            </Button>

            <button
              type="button"
              onClick={() => requestOtp()}
              disabled={loading}
              className="w-full text-center text-xs text-aveon-primary hover:underline"
            >
              <span className="inline-flex items-center gap-1"><RefreshCw size={12} /> Resend OTP</span>
            </button>
          </form>
        )}
      </Card>
      <p className="absolute bottom-5 text-center text-[11px] text-aveon-muted lg:hidden">Secure access to your AveonTrade account</p>
      </section>
    </div>
  );
}