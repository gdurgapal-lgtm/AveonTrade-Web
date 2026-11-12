"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/Primitives";
import { usePolledData } from "@/hooks/usePolledData";
import { useUserProfile } from "@/hooks/useUserProfile";
import { apiClient } from "@/lib/apiClient";
import { useAuthStore } from "@/lib/authStore";
import { Endpoints, ipoDetailsPath } from "@/lib/endpoints";
import { extractList } from "@/types/trading";
import { listOf } from "@/types/profile";
import {
  EMPTY,
  UPI_ID_PATTERN,
  buildIpoOrderPayload,
  cutoffAllowed,
  defaultCategory,
  defaultLots,
  formatRupees,
  ipoStatus,
  priceBand,
  readDpOptions,
  readIpoDetails,
  readUpiOptions,
  resolveBid,
  toNumber,
  validateBid,
  type BidDraft,
  type BidRules,
  type IpoListItem,
} from "@/types/ipo";

const INPUT =
  "h-9 w-full rounded-lg border border-aveon-border bg-aveon-panel2 px-3 text-sm text-aveon-text outline-none focus:border-sky-500/80 disabled:cursor-not-allowed disabled:opacity-60 read-only:opacity-80";
const LABEL = "mb-1 block text-[11px] font-medium text-aveon-muted";

export default function IpoApplyModal({
  item,
  onClose,
  onPlaced,
}: {
  item: IpoListItem;
  onClose: () => void;
  onPlaced: (message: string) => void;
}) {
  const userId = useAuthStore((s) => s.userId) ?? "";
  const groupId = useAuthStore((s) => s.groupId) ?? "HO";

  const details = usePolledData(ipoDetailsPath(item.IPOCode), 0, true);
  // Demat accounts come from the shared user profile (dp_details); UPI IDs from the funds UPI endpoint.
  const { profile } = useUserProfile();
  const upiData = usePolledData(Endpoints.funds.upiDetails, 0, true);

  const info = useMemo(() => readIpoDetails(details.data), [details.data]);
  const categories = useMemo(() => (info?.CategoryWise ?? []).filter((c) => c.AppCategoryCode), [info]);
  const dpOptions = useMemo(() => readDpOptions(listOf<Record<string, any>>(profile?.dp_details)), [profile]);
  const upiOptions = useMemo(() => readUpiOptions(extractList(upiData.data)), [upiData.data]);

  const [categoryCode, setCategoryCode] = useState("");
  // Retail is pre-selected whenever the IPO offers it.
  const effectiveCategory = categoryCode || defaultCategory(categories)?.AppCategoryCode || "";
  const category = categories.find((c) => c.AppCategoryCode === effectiveCategory);

  // ---- bid rules (category values win over the IPO-level ones) ----
  const lotSize = Math.max(1, toNumber(info?.LotSize ?? item.LotSize) ?? 1);
  const minQty = Math.max(1, toNumber(info?.MinOrderQty ?? item.MinOrderQty) ?? lotSize);
  const priceMin = toNumber(category?.MinPrice) || toNumber(info?.MinPrice) || toNumber(item.MinPrice) || 0;
  const priceMax = toNumber(category?.MaxPrice) || toNumber(info?.MaxPrice) || toNumber(item.MaxPrice) || 0;
  const rules: BidRules = {
    lotSize,
    minQty,
    priceMin,
    priceMax,
    maxLots: toNumber(category?.MaxBidLots) || null,
    minAmount: toNumber(category?.MinAmount) || (categories.length ? null : toNumber(item.MinAmount)) || null,
    maxAmount: toNumber(category?.MaxAmount) || null,
    tickSize: toNumber(info?.TickSize) || null,
  };
  const fixedPrice = priceMax > 0 && priceMin === priceMax;
  const canCutoff = priceMax > 0 && !fixedPrice && cutoffAllowed(category);

  const [bid, setBid] = useState<BidDraft>({ lots: "1", price: "", cutoff: false });
  const bidInitialised = useRef(false);
  useEffect(() => {
    if (bidInitialised.current || details.loading) return;
    bidInitialised.current = true;
    setBid({ lots: String(defaultLots(rules, priceMax)), price: priceMax > 0 ? String(priceMax) : "", cutoff: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details.loading, minQty, lotSize, priceMax]);

  // When the category changes the rules change: re-seed an out-of-band price, the lot count
  // (unless the user typed their own) and switch cut-off off where the category doesn't allow it.
  const lotsTouched = useRef(false);
  useEffect(() => {
    if (!bidInitialised.current) return;
    setBid((b) => {
      const p = Number(b.price);
      const outOfBand = priceMax > 0 && (!(p > 0) || p > priceMax || (priceMin > 0 && p < priceMin));
      const price = outOfBand ? String(priceMax) : b.price;
      const lots = lotsTouched.current ? b.lots : String(defaultLots(rules, Number(price) || priceMax));
      return { lots, price, cutoff: b.cutoff && canCutoff };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveCategory, priceMin, priceMax, canCutoff]);

  // ---- demat / UPI (prefilled from the account, always editable) ----
  const [dpId, setDpId] = useState("");
  const [beneficiaryId, setBeneficiaryId] = useState("");
  const [upiId, setUpiId] = useState("");
  const dpTouched = useRef(false);
  const upiTouched = useRef(false);
  useEffect(() => {
    if (dpTouched.current || !dpOptions[0]) return;
    setDpId(dpOptions[0].dpId);
    setBeneficiaryId(dpOptions[0].beneficiaryId);
  }, [dpOptions]);
  useEffect(() => {
    if (upiTouched.current || !upiOptions[0]) return;
    setUpiId(upiOptions[0]);
  }, [upiOptions]);

  // ---- flow ----
  const [step, setStep] = useState<"form" | "review">("form");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submittingRef.current) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const resolved = resolveBid(bid, rules);
  const amount = resolved.qty * resolved.price;
  const status = ipoStatus(item.bidStatus);

  function validateAll(): string {
    if (!userId) return "Your session isn’t ready. Refresh the page and try again.";
    if (!effectiveCategory) return "Select an application category.";
    const bidError = validateBid(bid, rules);
    if (bidError) return bidError;
    if (!dpId.trim()) return "Enter your DP ID.";
    if (!beneficiaryId.trim()) return "Enter your beneficiary (demat) ID.";
    if (!UPI_ID_PATTERN.test(upiId.trim())) return "Enter a valid UPI ID, for example name@bank.";
    return "";
  }

  function onContinue() {
    const message = validateAll();
    setError(message);
    if (!message) setStep("review");
  }

  async function onSubmit() {
    if (submittingRef.current) return;
    const message = validateAll();
    if (message) {
      setError(message);
      setStep("form");
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    const payload = buildIpoOrderPayload({
      userId,
      groupId,
      ipoCode: item.IPOCode,
      series: info?.Series || "EQ",
      categoryCode: effectiveCategory,
      dpId: dpId.trim(),
      beneficiaryId: beneficiaryId.trim(),
      upiId: upiId.trim(),
      bids: [{ activityType: "N", bidNo: 0, qty: resolved.qty, price: resolved.price, cutoff: bid.cutoff }],
    });
    const res = await apiClient.post(Endpoints.ipo.orders, payload);
    submittingRef.current = false;
    setSubmitting(false);
    if (res.success) {
      onPlaced(res.message || "IPO application submitted.");
    } else {
      setError(res.message || "The IPO application could not be placed.");
    }
  }

  const loadingSetup = details.loading && !details.data;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => { if (!submitting) onClose(); }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Apply for ${item.OfferName}`}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-aveon-border bg-aveon-panel shadow-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-aveon-border bg-aveon-panel2 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-aveon-text">Apply · {item.OfferName}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-aveon-muted">
              <span>{item.IPOCode}</span>
              <Badge tone={status.tone}>{status.label}</Badge>
              <span>Price band {priceBand(item.MinPrice, item.MaxPrice)}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} aria-label="Close" className="rounded-md p-1.5 text-aveon-muted hover:bg-aveon-panel hover:text-aveon-text disabled:opacity-40">
            <X size={17} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {loadingSetup ? (
            <p className="py-8 text-center text-xs text-aveon-muted">Loading IPO details…</p>
          ) : step === "form" ? (
            <>
              {details.error && !details.data && (
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-400">
                  Couldn’t load the category details ({details.error}). You can still enter the category code manually.
                </p>
              )}

              {/* Category */}
              <div>
                <label className={LABEL} htmlFor="ipo-category">Category</label>
                {categories.length > 0 ? (
                  <select id="ipo-category" className={INPUT} value={effectiveCategory} onChange={(e) => setCategoryCode(e.target.value)}>
                    {categories.map((c) => (
                      <option key={c.AppCategoryCode} value={c.AppCategoryCode}>
                        {c.AppCategoryName && c.AppCategoryName !== c.AppCategoryCode ? `${c.AppCategoryName} (${c.AppCategoryCode})` : c.AppCategoryCode}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input id="ipo-category" className={INPUT} value={categoryCode} onChange={(e) => setCategoryCode(e.target.value.trim())} placeholder="Category code, e.g. Retail" />
                    <div className="mt-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-400">
                      <p>The broker returned no categories for this IPO, so the category code has to be typed in.</p>
                      <details className="mt-1">
                        <summary className="cursor-pointer select-none underline-offset-2 hover:underline">Show what the broker returned</summary>
                        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-aveon-bg/60 p-2 text-[10px] text-aveon-muted">{JSON.stringify(details.data, null, 2)?.slice(0, 3000) ?? "(empty response)"}</pre>
                      </details>
                    </div>
                  </>
                )}
              </div>

              {category && (
                <p className="-mt-1 text-[11px] text-aveon-muted">
                  {[
                    rules.minAmount ? `Min amount ${formatRupees(rules.minAmount)}` : "",
                    rules.maxAmount ? `Max amount ${formatRupees(rules.maxAmount)}` : "",
                    rules.maxLots ? `Max ${rules.maxLots.toLocaleString("en-IN")} lots` : "",
                    canCutoff ? "Cut-off allowed" : priceMax > 0 && !fixedPrice ? "Cut-off not allowed" : "",
                  ].filter(Boolean).join(" · ") || " "}
                </p>
              )}

              {/* Bid */}
              <div className="rounded-lg border border-aveon-border p-3">
                <p className="mb-2 text-xs font-semibold text-aveon-text">Bid</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL} htmlFor="ipo-lots">Lots (1 lot = {lotSize.toLocaleString("en-IN")} shares)</label>
                    <input
                      id="ipo-lots"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      className={INPUT}
                      value={bid.lots}
                      onChange={(e) => { lotsTouched.current = true; setBid((b) => ({ ...b, lots: e.target.value })); }}
                    />
                    <p className="mt-1 text-[11px] text-aveon-muted">
                      Quantity {resolved.qty.toLocaleString("en-IN")}
                      {rules.maxLots ? ` · max ${rules.maxLots.toLocaleString("en-IN")} lots` : ""}
                    </p>
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="ipo-price">Price (₹){fixedPrice ? " · fixed" : ""}</label>
                    <input
                      id="ipo-price"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={rules.tickSize ?? "0.01"}
                      className={INPUT}
                      value={bid.cutoff ? String(priceMax) : bid.price}
                      readOnly={bid.cutoff || fixedPrice}
                      onChange={(e) => setBid((b) => ({ ...b, price: e.target.value }))}
                    />
                    <p className="mt-1 text-[11px] text-aveon-muted">Band {priceBand(priceMin, priceMax)}</p>
                  </div>
                </div>

                {canCutoff && (
                  <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-aveon-text">
                    <input type="checkbox" className="h-3.5 w-3.5 accent-blue-500" checked={bid.cutoff} onChange={(e) => setBid((b) => ({ ...b, cutoff: e.target.checked }))} />
                    Bid at cut-off price ({formatRupees(priceMax)})
                  </label>
                )}

                <div className="mt-3 flex items-center justify-between rounded-md bg-aveon-panel2 px-3 py-2 text-xs">
                  <span className="text-aveon-muted">Bid amount</span>
                  <span className="font-bold tabular-nums text-aveon-text">{amount > 0 ? formatRupees(amount, false) : EMPTY}</span>
                </div>
              </div>

              {/* Demat */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className={LABEL} htmlFor="ipo-dp">DP ID</label>
                  <input id="ipo-dp" className={INPUT} value={dpId} onChange={(e) => { dpTouched.current = true; setDpId(e.target.value.trim()); }} autoComplete="off" />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className={LABEL} htmlFor="ipo-bo">Beneficiary (demat) ID</label>
                  <input id="ipo-bo" className={INPUT} value={beneficiaryId} onChange={(e) => { dpTouched.current = true; setBeneficiaryId(e.target.value.trim()); }} autoComplete="off" />
                </div>
                {dpOptions.length > 1 && (
                  <div className="col-span-2">
                    <label className={LABEL} htmlFor="ipo-dp-pick">Saved demat accounts</label>
                    <select
                      id="ipo-dp-pick"
                      className={INPUT}
                      value={`${dpId}|${beneficiaryId}`}
                      onChange={(e) => {
                        const [d, b] = e.target.value.split("|");
                        dpTouched.current = true;
                        setDpId(d);
                        setBeneficiaryId(b);
                      }}
                    >
                      {!dpOptions.some((o) => `${o.dpId}|${o.beneficiaryId}` === `${dpId}|${beneficiaryId}`) && <option value={`${dpId}|${beneficiaryId}`}>Custom</option>}
                      {dpOptions.map((o) => (
                        <option key={`${o.dpId}|${o.beneficiaryId}`} value={`${o.dpId}|${o.beneficiaryId}`}>{o.dpId} · {o.beneficiaryId}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Payment */}
              <div>
                <label className={LABEL} htmlFor="ipo-upi">UPI ID (payment mode: UPI)</label>
                <input
                  id="ipo-upi"
                  className={INPUT}
                  value={upiId}
                  list="ipo-upi-options"
                  placeholder="name@bank"
                  onChange={(e) => { upiTouched.current = true; setUpiId(e.target.value.trim()); }}
                  autoComplete="off"
                />
                <datalist id="ipo-upi-options">{upiOptions.map((v) => <option key={v} value={v} />)}</datalist>
              </div>
            </>
          ) : (
            <div className="space-y-3 text-xs">
              <p className="text-aveon-muted">Please review your application before submitting.</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-aveon-border p-3">
                {([
                  ["IPO", `${item.OfferName} (${item.IPOCode})`],
                  ["Category", category?.AppCategoryName ? `${category.AppCategoryName} (${effectiveCategory})` : effectiveCategory],
                  ["Quantity", `${resolved.qty.toLocaleString("en-IN")} (${bid.lots} lot${Number(bid.lots) === 1 ? "" : "s"})`],
                  ["Price", bid.cutoff ? `${formatRupees(resolved.price)} (cut-off)` : formatRupees(resolved.price)],
                  ["Amount", formatRupees(amount, false)],
                  ["DP ID", dpId],
                  ["Beneficiary ID", beneficiaryId],
                  ["UPI ID", upiId],
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="text-[11px] text-aveon-muted">{k}</dt>
                    <dd className="break-words font-semibold text-aveon-text">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-[11px] text-aveon-muted">You may need to approve a UPI mandate request in your UPI app for the bid to be confirmed.</p>
            </div>
          )}

          {error && <p role="alert" className="rounded-lg border border-aveon-sell/40 bg-aveon-sell/10 px-3 py-2 text-xs text-aveon-sell">{error}</p>}
        </div>

        <div className="grid shrink-0 grid-cols-[1fr_2fr] gap-3 border-t border-aveon-border bg-aveon-panel p-3">
          {step === "form" ? (
            <>
              <button type="button" onClick={onClose} className="h-10 rounded-lg border border-aveon-border bg-aveon-panel2 text-sm font-semibold text-aveon-text hover:bg-aveon-panel">Cancel</button>
              <button type="button" onClick={onContinue} disabled={loadingSetup} className="h-10 rounded-lg bg-aveon-primary text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">Review application</button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => { setError(""); setStep("form"); }} disabled={submitting} className="h-10 rounded-lg border border-aveon-border bg-aveon-panel2 text-sm font-semibold text-aveon-text hover:bg-aveon-panel disabled:opacity-50">Back</button>
              <button type="button" onClick={onSubmit} disabled={submitting} className="flex h-10 items-center justify-center gap-2 rounded-lg bg-aveon-buy text-sm font-bold text-white hover:opacity-90 disabled:opacity-60">
                {submitting ? <><Loader2 size={15} className="animate-spin" /> Submitting…</> : "Place application"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
