"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";
import { usePolledData } from "@/hooks/usePolledData";
import { apiClient } from "@/lib/apiClient";
import { useAuthStore } from "@/lib/authStore";
import { Endpoints, ipoDetailsPath, ipoOrderPath } from "@/lib/endpoints";
import {
  IPO_FIELD,
  UPI_ID_PATTERN,
  buildIpoOrderPayload,
  cutoffAllowed,
  formatRupees,
  pickText,
  priceBand,
  readIpoDetails,
  readOrderBids,
  readOrderMeta,
  resolveBid,
  toNumber,
  validateBid,
  type BidDraft,
  type BidRules,
} from "@/types/ipo";

const INPUT =
  "h-9 w-full rounded-lg border border-aveon-border bg-aveon-panel2 px-3 text-sm text-aveon-text outline-none focus:border-sky-500/80 disabled:opacity-60 read-only:opacity-80";
const LABEL = "mb-1 block text-[11px] font-medium text-aveon-muted";

function Frame({ title, subtitle, onClose, busy, children, footer }: { title: string; subtitle?: string; onClose: () => void; busy: boolean; children: ReactNode; footer: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => { if (!busy) onClose(); }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-aveon-border bg-aveon-panel shadow-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-aveon-border bg-aveon-panel2 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-aveon-text">{title}</p>
            {subtitle && <p className="mt-0.5 truncate text-[11px] text-aveon-muted">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="rounded-md p-1.5 text-aveon-muted hover:bg-aveon-panel hover:text-aveon-text disabled:opacity-40">
            <X size={17} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">{children}</div>
        <div className="grid shrink-0 grid-cols-[1fr_2fr] gap-3 border-t border-aveon-border bg-aveon-panel p-3">{footer}</div>
      </div>
    </div>
  );
}

/* ------------------------------- Cancel ------------------------------- */

export function IpoCancelDialog({ order, onClose, onDone }: { order: Record<string, any>; onClose: () => void; onDone: (message: string) => void }) {
  const meta = readOrderMeta(order);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);

  async function cancel() {
    if (busyRef.current) return;
    if (!meta.transactionNo) {
      setError("This order has no transaction number, so it can’t be cancelled from here.");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    const res = await apiClient.delete(ipoOrderPath(meta.transactionNo));
    busyRef.current = false;
    setBusy(false);
    if (res.success) onDone(res.message || "IPO order cancelled.");
    else setError(res.message || "The IPO order could not be cancelled.");
  }

  return (
    <Frame
      title="Cancel IPO application"
      subtitle={meta.name || meta.ipoCode}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="h-10 rounded-lg border border-aveon-border bg-aveon-panel2 text-sm font-semibold text-aveon-text hover:bg-aveon-panel disabled:opacity-50">Keep order</button>
          <button type="button" onClick={cancel} disabled={busy} className="flex h-10 items-center justify-center gap-2 rounded-lg bg-aveon-sell text-sm font-bold text-white hover:opacity-90 disabled:opacity-60">
            {busy ? <><Loader2 size={15} className="animate-spin" /> Cancelling…</> : "Cancel order"}
          </button>
        </>
      }
    >
      <p className="text-sm text-aveon-text">
        Cancel your application for <span className="font-semibold">{meta.name || meta.ipoCode || "this IPO"}</span>?
      </p>
      <dl className="grid grid-cols-2 gap-3 rounded-lg border border-aveon-border p-3 text-xs">
        <div><dt className="text-[11px] text-aveon-muted">Transaction no.</dt><dd className="font-semibold text-aveon-text">{meta.transactionNo || "—"}</dd></div>
        {meta.referenceNo && <div><dt className="text-[11px] text-aveon-muted">Reference no.</dt><dd className="font-semibold text-aveon-text">{meta.referenceNo}</dd></div>}
      </dl>
      {error && <p role="alert" className="rounded-lg border border-aveon-sell/40 bg-aveon-sell/10 px-3 py-2 text-xs text-aveon-sell">{error}</p>}
    </Frame>
  );
}

/* ------------------------------- Modify ------------------------------- */

export function IpoModifyModal({ order, onClose, onDone }: { order: Record<string, any>; onClose: () => void; onDone: (message: string) => void }) {
  const userId = useAuthStore((s) => s.userId) ?? "";
  const groupId = useAuthStore((s) => s.groupId) ?? "HO";

  const meta = readOrderMeta(order);
  const categoryCode = pickText(order, [...IPO_FIELD.category]);
    const existingBids = useMemo(() => readOrderBids(order), [order]);

  const details = usePolledData(meta.ipoCode ? ipoDetailsPath(meta.ipoCode) : "", 0, Boolean(meta.ipoCode));
  const info = useMemo(() => readIpoDetails(details.data), [details.data]);
  const category = (info?.CategoryWise ?? []).find((c) => c.AppCategoryCode === categoryCode);

  const lotSize = Math.max(1, toNumber(info?.LotSize) ?? 1);
  const minQty = Math.max(1, toNumber(info?.MinOrderQty) ?? lotSize);
  const priceMin = toNumber(category?.MinPrice) || toNumber(info?.MinPrice) || 0;
  const priceMax = toNumber(category?.MaxPrice) || toNumber(info?.MaxPrice) || 0;
  const rules: BidRules = {
    lotSize,
    minQty,
    priceMin,
    priceMax,
    maxLots: toNumber(category?.MaxBidLots) || null,
    minAmount: toNumber(category?.MinAmount) || null,
    maxAmount: toNumber(category?.MaxAmount) || null,
    tickSize: toNumber(info?.TickSize) || null,
  };
  const fixedPrice = priceMax > 0 && priceMin === priceMax;
  const canCutoff = priceMax > 0 && !fixedPrice && cutoffAllowed(category);

  const [drafts, setDrafts] = useState<BidDraft[]>([]);
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || details.loading) return;
    seeded.current = true;
    setDrafts(existingBids.map((b) => ({ lots: String(Math.max(1, Math.round(b.qty / lotSize))), price: String(b.price || priceMax || ""), cutoff: b.cutoff })));
  }, [details.loading, existingBids, lotSize, priceMax]);

  const [dpId, setDpId] = useState(() => pickText(order, [...IPO_FIELD.dpId]));
  const [beneficiaryId, setBeneficiaryId] = useState(() => pickText(order, [...IPO_FIELD.beneficiary]));
  const [upiId, setUpiId] = useState(() => pickText(order, [...IPO_FIELD.upi]));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);

  const missing: string[] = [];
  if (!meta.transactionNo) missing.push("transaction number");
  if (!meta.referenceNo) missing.push("reference number");
  if (!meta.ipoCode) missing.push("IPO code");
  if (!categoryCode) missing.push("application category");
  if (!existingBids.length) missing.push("bid details");

  function validateAll(): string {
    if (!userId) return "Your session isn’t ready. Refresh the page and try again.";
    for (const draft of drafts) {
      const message = validateBid(draft, rules);
      if (message) return message;
    }
    if (!dpId.trim()) return "Enter your DP ID.";
    if (!beneficiaryId.trim()) return "Enter your beneficiary (demat) ID.";
    if (!UPI_ID_PATTERN.test(upiId.trim())) return "Enter a valid UPI ID, for example name@bank.";
    return "";
  }

  async function submit() {
    if (busyRef.current) return;
    const message = validateAll();
    setError(message);
    if (message) return;
    busyRef.current = true;
    setBusy(true);
    const payload = buildIpoOrderPayload({
      userId,
      groupId,
      ipoCode: meta.ipoCode,
      series: pickText(order, [...IPO_FIELD.series]) || info?.Series || "EQ",
      categoryCode,
      dpId: dpId.trim(),
      beneficiaryId: beneficiaryId.trim(),
      upiId: upiId.trim(),
      transactionNo: meta.transactionNo,
      referenceNo: meta.referenceNo,
      bids: drafts.map((draft, index) => {
        const { qty, price } = resolveBid(draft, rules);
        return { activityType: "M" as const, bidNo: existingBids[index].bidNo, qty, price, cutoff: draft.cutoff };
      }),
    });
    const res = await apiClient.post(Endpoints.ipo.orders, payload);
    busyRef.current = false;
    setBusy(false);
    if (res.success) onDone(res.message || "IPO order modified.");
    else setError(res.message || "The IPO order could not be modified.");
  }

  const loading = Boolean(meta.ipoCode) && details.loading && !details.data;
  const blocked = missing.length > 0;

  return (
    <Frame
      title="Modify IPO application"
      subtitle={`${meta.name || meta.ipoCode} · Txn ${meta.transactionNo || "—"}`}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="h-10 rounded-lg border border-aveon-border bg-aveon-panel2 text-sm font-semibold text-aveon-text hover:bg-aveon-panel disabled:opacity-50">Close</button>
          <button type="button" onClick={submit} disabled={busy || loading || blocked} className="flex h-10 items-center justify-center gap-2 rounded-lg bg-aveon-primary text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
            {busy ? <><Loader2 size={15} className="animate-spin" /> Modifying…</> : "Modify application"}
          </button>
        </>
      }
    >
      {blocked && (
        <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          This order can’t be modified from here because its details don’t include the {missing.join(", ")}.
        </p>
      )}

      {loading ? (
        <p className="py-6 text-center text-xs text-aveon-muted">Loading IPO details…</p>
      ) : (
        !blocked && (
          <>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><p className={LABEL}>Category</p><p className="font-semibold text-aveon-text">{category?.AppCategoryName ? `${category.AppCategoryName} (${categoryCode})` : categoryCode}</p></div>
              <div><p className={LABEL}>Price band</p><p className="font-semibold text-aveon-text">{priceBand(priceMin, priceMax)}</p></div>
            </div>

            {drafts.map((draft, index) => {
              const current = existingBids[index];
              const { qty, price } = resolveBid(draft, rules);
              return (
                <div key={current.bidNo} className="rounded-lg border border-aveon-border p-3">
                  <p className="mb-2 flex items-center justify-between text-xs font-semibold text-aveon-text">
                    <span>Bid {current.bidNo}</span>
                    <span className="font-normal text-aveon-muted">Now: {current.qty.toLocaleString("en-IN")} × {current.cutoff ? "cut-off" : formatRupees(current.price)}</span>
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={LABEL} htmlFor={`mod-lots-${index}`}>Lots (1 lot = {lotSize.toLocaleString("en-IN")})</label>
                      <input id={`mod-lots-${index}`} type="number" min={1} step={1} className={INPUT} value={draft.lots} onChange={(e) => setDrafts((all) => all.map((d, i) => (i === index ? { ...d, lots: e.target.value } : d)))} />
                      <p className="mt-1 text-[11px] text-aveon-muted">Quantity {qty.toLocaleString("en-IN")}</p>
                    </div>
                    <div>
                      <label className={LABEL} htmlFor={`mod-price-${index}`}>Price (₹)</label>
                      <input id={`mod-price-${index}`} type="number" min={0} step={rules.tickSize ?? "0.01"} className={INPUT} value={draft.cutoff ? String(priceMax) : draft.price} readOnly={draft.cutoff || fixedPrice} onChange={(e) => setDrafts((all) => all.map((d, i) => (i === index ? { ...d, price: e.target.value } : d)))} />
                    </div>
                  </div>
                  {canCutoff && (
                    <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-aveon-text">
                      <input type="checkbox" className="h-3.5 w-3.5 accent-blue-500" checked={draft.cutoff} onChange={(e) => setDrafts((all) => all.map((d, i) => (i === index ? { ...d, cutoff: e.target.checked } : d)))} />
                      Bid at cut-off price
                    </label>
                  )}
                  <p className="mt-2 text-right text-[11px] text-aveon-muted">Amount <span className="font-bold tabular-nums text-aveon-text">{qty > 0 && price > 0 ? formatRupees(qty * price, false) : "—"}</span></p>
                </div>
              );
            })}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL} htmlFor="mod-dp">DP ID</label>
                <input id="mod-dp" className={INPUT} value={dpId} onChange={(e) => setDpId(e.target.value.trim())} autoComplete="off" />
              </div>
              <div>
                <label className={LABEL} htmlFor="mod-bo">Beneficiary (demat) ID</label>
                <input id="mod-bo" className={INPUT} value={beneficiaryId} onChange={(e) => setBeneficiaryId(e.target.value.trim())} autoComplete="off" />
              </div>
              <div className="col-span-2">
                <label className={LABEL} htmlFor="mod-upi">UPI ID</label>
                <input id="mod-upi" className={INPUT} value={upiId} placeholder="name@bank" onChange={(e) => setUpiId(e.target.value.trim())} autoComplete="off" />
              </div>
            </div>
          </>
        )
      )}

      {error && <p role="alert" className="rounded-lg border border-aveon-sell/40 bg-aveon-sell/10 px-3 py-2 text-xs text-aveon-sell">{error}</p>}
    </Frame>
  );
}
