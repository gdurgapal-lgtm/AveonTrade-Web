"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { Badge, Card } from "@/components/ui/Primitives";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useAuthStore } from "@/lib/authStore";
import {
  BANK_KNOWN_KEYS,
  DASH,
  DP_KNOWN_KEYS,
  PROFILE_KNOWN_KEYS,
  displayValue,
  extraEntries,
  humanize,
  initials,
  isSensitiveKey,
  listOf,
  maskDeep,
  maskMobile,
  maskPan,
  maskTail,
  maskValueForKey,
  text,
  type ProfileBank,
  type ProfileDp,
} from "@/types/profile";

export default function ProfilePage() {
  const { profile, raw, loading, refreshing, error, reload } = useUserProfile();
  const userId = useAuthStore((s) => s.userId);
  const [reveal, setReveal] = useState(false);

  const banks = listOf<ProfileBank>(profile?.bank_details);
  const dps = listOf<ProfileDp>(profile?.dp_details);
  const name = text(profile?.user_name) || text(userId);

  // Anything the API sends that this page doesn't have a dedicated spot for.
  const otherFields = useMemo(() => extraEntries(profile, PROFILE_KNOWN_KEYS), [profile]);
  const bankExtraKeys = useMemo(
    () => Array.from(new Set(banks.flatMap((b) => extraEntries(b, BANK_KNOWN_KEYS).map(([k]) => k)))),
    [banks]
  );
  const mfEntries = useMemo(() => {
    const mf = profile?.mf_details;
    if (!mf || typeof mf !== "object") return [] as [string, unknown][];
    return Array.isArray(mf) ? mf.map((v, i): [string, unknown] => [`Item ${i + 1}`, v]) : Object.entries(mf as Record<string, unknown>);
  }, [profile?.mf_details]);
  const rawJson = useMemo(() => JSON.stringify(maskDeep(raw, reveal), null, 2), [raw, reveal]);

  /** Shows an arbitrary value; sensitive-looking keys stay masked until "Show sensitive details". */
  const shown = (key: string, value: unknown) => {
    const display = profileDisplayValue(key, value);
    if (!display) return "";
    return !reveal && isSensitiveKey(key) && typeof value !== "object" ? maskValueForKey(key, value) : display;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Profile</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-pressed={reveal}
            className="flex h-9 items-center gap-1.5 rounded-md border border-aveon-border px-3 text-xs text-aveon-text hover:bg-aveon-panel2"
          >
            {reveal ? <EyeOff size={14} /> : <Eye size={14} />} {reveal ? "Hide" : "Show"} sensitive details
          </button>
          <button
            type="button"
            onClick={() => void reload()}
            aria-label="Refresh profile"
            title="Refresh"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-aveon-border text-aveon-muted hover:bg-aveon-panel2 hover:text-aveon-text"
          >
            <RefreshCw size={14} className={loading || refreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {loading ? (
        <Card><p className="text-xs text-aveon-muted">Loading profile…</p></Card>
      ) : error ? (
        <Card>
          <div className="flex flex-col items-start gap-2">
            <p className="text-xs text-aveon-sell">{error}</p>
            <button type="button" onClick={() => void reload()} className="rounded-md border border-aveon-border px-3 py-1.5 text-xs text-aveon-text hover:bg-aveon-panel2">Try again</button>
          </div>
        </Card>
      ) : !profile ? (
        <Card><p className="text-xs text-aveon-muted">No profile details were returned.</p></Card>
      ) : (
        <>
          {/* Identity header */}
          <Card>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-aveon-primary/15 text-lg font-bold text-aveon-primary" aria-hidden>
                {initials(name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold text-aveon-text">{name || DASH}</p>
                <p className="text-xs text-aveon-muted">{userId ? `User ID ${userId}` : ""}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-aveon-muted">
                <span className="flex items-center gap-1.5">MPIN <Badge tone={profile.mpin_enabled ? "buy" : "neutral"}>{profile.mpin_enabled ? "Enabled" : "Off"}</Badge></span>
                <span className="flex items-center gap-1.5">Fingerprint <Badge tone={profile.fingerprint_enabled ? "buy" : "neutral"}>{profile.fingerprint_enabled ? "Enabled" : "Off"}</Badge></span>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <SectionTitle>Personal details</SectionTitle>
              <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-3 text-sm">
                <Field label="User name" value={text(profile.user_name)} />
                <Field label="Email" value={text(profile.email)} />
                <Field label="Mobile" value={reveal ? text(profile.mobile_no) : maskMobile(profile.mobile_no)} />
                <Field label="PAN" value={reveal ? text(profile.pan) : maskPan(profile.pan)} mono />
                <Field label="Date of birth" value={text(profile.dob)} />
                <Field label="Gender" value={text(profile.gender)} />
                <Field label="Address" value={text(profile.address)} />
                <Field label="MPIN enabled" value={displayValue(profile.mpin_enabled)} />
                <Field label="Fingerprint enabled" value={displayValue(profile.fingerprint_enabled)} />
                <Field label="Product allowed" value={displayValue(profile.productAllowed)} mono />
              </dl>
            </Card>

            <Card>
              <SectionTitle>Demat accounts{dps.length ? ` (${dps.length})` : ""}</SectionTitle>
              {dps.length === 0 ? (
                <p className="text-xs text-aveon-muted">No demat accounts on file.</p>
              ) : (
                <ul className="space-y-3">
                  {dps.map((dp, index) => (
                    <li key={`${dp.dpId}-${dp.clientBeneficiaryId}-${index}`} className="rounded-lg border border-aveon-border p-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-aveon-text">{text(dp.dpName) || "Demat account"}</span>
                        {text(dp.dpType) && <Badge tone="neutral">{text(dp.dpType)}</Badge>}
                        {dp.defaultDP && <Badge tone="buy">Default</Badge>}
                      </div>
                      <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-2 text-xs">
                        <Field label="DP name" value={text(dp.dpName)} />
                        <Field label="DP type" value={text(dp.dpType)} />
                        <Field label="DP ID" value={text(dp.dpId)} mono />
                        <Field label="Beneficiary ID" value={reveal ? text(dp.clientBeneficiaryId) : maskTail(dp.clientBeneficiaryId)} mono />
                        <Field label="Holding type" value={text(dp.holdingType)} />
                        <Field label="Default DP" value={displayValue(dp.defaultDP)} />
                        {extraEntries(dp, DP_KNOWN_KEYS).map(([key, value]) => (
                          <Field key={key} label={humanize(key)} value={shown(key, value)} mono={isSensitiveKey(key)} />
                        ))}
                      </dl>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card className="overflow-hidden p-0">
            <div className="px-4 pt-4"><SectionTitle>Bank accounts{banks.length ? ` (${banks.length})` : ""}</SectionTitle></div>
            {banks.length === 0 ? (
              <p className="px-4 pb-4 text-xs text-aveon-muted">No bank accounts on file.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-xs">
                  <thead>
                    <tr className="border-b border-aveon-border text-left text-[11px] text-aveon-muted">
                      <th className="px-4 py-2 font-medium">Bank</th>
                      <th className="px-4 py-2 font-medium">Branch</th>
                      <th className="px-4 py-2 font-medium">City</th>
                      <th className="px-4 py-2 font-medium">Account no.</th>
                      <th className="px-4 py-2 font-medium">Account type</th>
                      <th className="px-4 py-2 font-medium">Default</th>
                      {bankExtraKeys.map((key) => <th key={key} className="whitespace-nowrap px-4 py-2 font-medium">{humanize(key)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {banks.map((bank, index) => (
                      <tr key={`${bank.account_no}-${index}`} className="border-b border-aveon-border/60 last:border-0">
                        <td className="px-4 py-2.5 font-medium text-aveon-text">{text(bank.bank_name) || DASH}</td>
                        <td className="px-4 py-2.5">{text(bank.branch_name) || DASH}</td>
                        <td className="px-4 py-2.5">{text(bank.branch_city) || DASH}</td>
                        <td className="px-4 py-2.5 font-mono tabular-nums">{(reveal ? text(bank.account_no) : maskTail(bank.account_no)) || DASH}</td>
                        <td className="px-4 py-2.5 tabular-nums">{profileDisplayValue("account_type", bank.account_type) || DASH}</td>
                        <td className="px-4 py-2.5">{bank.is_default ? <Badge tone="buy">Yes</Badge> : <span className="text-aveon-muted">No</span>}</td>
                        {bankExtraKeys.map((key) => (
                          <td key={key} className="whitespace-nowrap px-4 py-2.5">{shown(key, bank[key]) || DASH}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <SectionTitle>Mutual funds</SectionTitle>
            {mfEntries.length === 0 ? (
              <p className="text-xs text-aveon-muted">No mutual fund details on file.</p>
            ) : (
              <dl className="grid grid-cols-[160px_1fr] gap-x-3 gap-y-2 text-sm">
                {mfEntries.map(([key, value]) => (
                  <Field key={key} label={humanize(key)} value={shown(key, value)} mono={typeof value === "object"} />
                ))}
              </dl>
            )}
          </Card>

          {otherFields.length > 0 && (
            <Card>
              <SectionTitle>Other details</SectionTitle>
              <dl className="grid grid-cols-[160px_1fr] gap-x-3 gap-y-2 text-sm">
                {otherFields.map(([key, value]) => key === "others" && value && typeof value === "object" && !Array.isArray(value) ? (
                  <div key={key} className="col-span-full rounded-lg border border-aveon-border p-3">
                    <h3 className="mb-2 text-xs font-semibold text-aveon-text">Additional settings</h3>
                    <dl className="grid grid-cols-[160px_1fr] gap-x-3 gap-y-2 text-xs">
                      {Object.entries(value as Record<string, unknown>).map(([nestedKey, nestedValue]) => (
                        <Field key={nestedKey} label={humanize(nestedKey)} value={shown(nestedKey, nestedValue)} mono={isSensitiveKey(nestedKey)} />
                      ))}
                    </dl>
                  </div>
                ) : (
                  <Field key={key} label={humanize(key)} value={shown(key, value)} mono={typeof value === "object"} />
                ))}
              </dl>
            </Card>
          )}

          <Card>
            <details>
              <summary className="cursor-pointer select-none text-sm font-semibold text-aveon-text">Complete profile response</summary>
              <p className="mt-2 text-[11px] text-aveon-muted">
                Every field exactly as the broker sent it{reveal ? "" : " (sensitive identifiers masked — use “Show sensitive details” to reveal them)"}.
              </p>
              <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-aveon-bg/60 p-3 text-[11px] text-aveon-muted">{rawJson}</pre>
            </details>
          </Card>
        </>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-sm font-semibold text-aveon-text">{children}</h2>;
}

function Field({ label, value, mono = false }: { label: string; value?: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-aveon-muted">{label}</dt>
      <dd className={`min-w-0 break-words text-aveon-text ${mono ? "font-mono tabular-nums" : ""}`}>{value || DASH}</dd>
    </>
  );
}

/** Convert documented API enum values into human-readable labels for the UI.
 * The complete response panel intentionally keeps the broker's original raw values.
 */
function profileDisplayValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  const raw = String(value).trim();

  if (normalizedKey === "poa") {
    if (raw === "0") return "POA";
    if (raw === "2") return "Non-POA";
  }
  if (normalizedKey === "accounttype") {
    if (raw === "1") return "Current";
    if (raw === "2") return "Savings";
  }
  return displayValue(value);
}
