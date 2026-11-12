"use client";
/* eslint-disable react/no-unescaped-entities */

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, EmptyState, Input, Select } from "@/components/ui/Primitives";
import { usePolledData } from "@/hooks/usePolledData";
import { Endpoints } from "@/lib/endpoints";

type DpRecord = {
  sClientId?: string; sGroupId?: string; sClientCode?: string;
  nBeneficiaryAccountNumber?: string | number; sDpId?: string; sDPId?: string; sDepository?: string;
  nBeneficiaryStatus?: number | string; nPriority?: number | string; sDPBankId?: string;
};
type SummaryRecord = {
  sDealerCode?: string; sISINCode?: string; sSecurityDesc?: string;
  TotalFreeQty?: number | string; TodayFreeQty?: number | string; ApprovedQuantity?: number | string;
  ClosePrice?: number | string; eDISDPQty?: number | string; eDISCheckQty?: number | string;
  eDISRequestQty?: number | string; nSettlementType?: number | string;
  [key: string]: unknown;
};
type SummaryData = { edis_summary?: SummaryRecord[] | SummaryRecord; edis_config?: Record<string, unknown> | Record<string, unknown>[]; [key: string]: unknown };
type ApprovalStatus = "Waiting" | "Approved" | "Rejected" | "Pending" | "Unknown";
type ApprovalResult = { reqId: string; status: ApprovalStatus; message: string; receivedAt: string; raw?: unknown; perSecurity: Array<{ isin: string; name: string; status: ApprovalStatus; message: string; quantity?: number }> };

type ApiShape<T> = T | { data?: T; [key: string]: unknown };
function unwrap<T>(value: ApiShape<T> | null): T | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if ("data" in v && v.data && typeof v.data === "object") return v.data as T;
  return value as T;
}
function firstDp(value: ApiShape<DpRecord | DpRecord[]> | null): DpRecord | null {
  const raw = unwrap<DpRecord | DpRecord[]>(value);
  if (Array.isArray(raw)) return raw[0] ?? null;
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  for (const key of ["dpDetails", "dp_details", "details"]) {
    const nested = obj[key];
    if (Array.isArray(nested)) return (nested[0] as DpRecord) ?? null;
    if (nested && typeof nested === "object") return nested as DpRecord;
  }
  return raw as DpRecord;
}
function text(value: unknown): string { return value === undefined || value === null || value === "" ? "—" : String(value); }
function mask(value: unknown): string {
  const s = text(value); return s === "—" || s.length <= 4 ? s : `${"•".repeat(Math.min(8, s.length - 4))}${s.slice(-4)}`;
}
function isEmpty(value: object): boolean { return !Object.values(value).some((v) => v !== undefined && v !== null && v !== ""); }
function Field({ label, value, sensitive = false }: { label: string; value?: unknown; sensitive?: boolean }) {
  return <div className="min-w-0"><dt className="text-xs text-aveon-muted">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-aveon-text">{sensitive ? mask(value) : text(value)}</dd></div>;
}
export default function EdisPage() {
  const [section, setSection] = useState<"summary" | "dp" | "actions">("summary");
  const [segment, setSegment] = useState("");
  const [token, setToken] = useState("-1");
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [approvalMessage, setApprovalMessage] = useState("");
  const [revokeMessage, setRevokeMessage] = useState("");
  const [tpinPan, setTpinPan] = useState("");
  const [tpinBoid, setTpinBoid] = useState("");
  const [tpinLoading, setTpinLoading] = useState(false);
  const [tpinMessage, setTpinMessage] = useState("");
  const [tpinResponse, setTpinResponse] = useState<Record<string, unknown> | null>(null);
  const [revokeResult, setRevokeResult] = useState<ApprovalResult | null>(null);
  const pendingAction = useRef<"approval" | "revoke">("approval");
  const [approvalResult, setApprovalResult] = useState<ApprovalResult | null>(null);
  const [popupState, setPopupState] = useState<"idle" | "open" | "closed">("idle");
  const pendingReqId = useRef<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const popupOriginRef = useRef<string>("");
  const popupWatchRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const summaryRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dpResponse = usePolledData<ApiShape<DpRecord | DpRecord[]>>(Endpoints.edis.dpDetails);
  const summaryEndpoint = useMemo(() => {
    const query = new URLSearchParams({ mktSegID: segment, token: token.trim() || "-1" });
    return `${Endpoints.edis.summary}?${query.toString()}`;
  }, [segment, token]);
  const summaryResponse = usePolledData<ApiShape<SummaryData>>(summaryEndpoint);
  const dp = useMemo(() => firstDp(dpResponse.data), [dpResponse.data]);
  const summaryData = useMemo(() => unwrap<SummaryData>(summaryResponse.data), [summaryResponse.data]);
  const summaryRows = useMemo(() => {
    const value = summaryData?.edis_summary;
    if (Array.isArray(value)) return value;
    return value ? [value] : [];
  }, [summaryData]);
  const configValue = summaryData?.edis_config;
  const config = (Array.isArray(configValue) ? configValue[0] : configValue) ?? {};
  const selectedRows = summaryRows.filter((row) => Boolean(row.sISINCode && selected[row.sISINCode] > 0));
  const selectedValue = selectedRows.reduce((sum, row) => sum + (Number(selected[row.sISINCode ?? ""]) || 0) * (Number(row.ClosePrice) || 0), 0);
  function refreshSummaryAfterAction() {
    summaryResponse.reload();
    if (summaryRefreshTimeoutRef.current) clearTimeout(summaryRefreshTimeoutRef.current);
    // Depository updates can arrive slightly after the redirect callback.
    summaryRefreshTimeoutRef.current = setTimeout(() => {
      summaryResponse.reload();
      summaryRefreshTimeoutRef.current = null;
    }, 1800);
  }

  useEffect(() => {
    function asRecord(value: unknown): Record<string, unknown> | null {
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      return value as Record<string, unknown>;
    }
    function firstValue(obj: Record<string, unknown>, keys: string[]): unknown {
      for (const key of keys) if (obj[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key];
      return undefined;
    }
    function normalizeStatus(value: unknown): ApprovalStatus {
      const status = String(value ?? "").trim().toLowerCase();
      if (["success", "approved", "approve", "authorized", "authorised", "completed", "s-101", "s-100"].includes(status)) return "Approved";
      if (["failed", "failure", "rejected", "reject", "denied", "error", "cancelled", "canceled"].includes(status)) return "Rejected";
      if (["pending", "in progress", "processing", "initiated", "submitted"].includes(status)) return "Pending";
      return "Unknown";
    }
    function onMessage(event: MessageEvent) {
      const popupOrigin = popupOriginRef.current;
      if (!popupOrigin || event.origin !== popupOrigin || (popupRef.current && event.source !== popupRef.current)) return;
      const root = asRecord(event.data);
      if (!root) return;
      // Support common callback envelopes without treating arbitrary messages as a successful approval.
      const body = asRecord(root.data) ?? asRecord(root.result) ?? root;
      const receivedReqId = String(firstValue(body, ["ReqId", "ReqID", "reqId", "reqID", "requestId", "request_id"]) ?? firstValue(root, ["ReqId", "ReqID", "reqId", "reqID", "requestId", "request_id"]) ?? "");
      if (pendingReqId.current && receivedReqId && receivedReqId !== pendingReqId.current) return;
      const statusRaw = firstValue(body, ["status", "Status", "approvalStatus", "approval_status", "result"])
        ?? firstValue(root, ["status", "Status", "approvalStatus", "approval_status", "result"]);
      const status = normalizeStatus(statusRaw);
      const message = String(firstValue(body, ["message", "Message", "Remark", "remark", "remarks", "description"]) ?? firstValue(root, ["message", "Message", "Remark", "remark", "remarks", "description"]) ?? "Depository response received.");
      const itemsRaw = firstValue(body, ["ScripDetails", "scripDetails", "securities", "items", "results"]);
      let items: unknown[] = Array.isArray(itemsRaw) ? itemsRaw : [];
      if (typeof itemsRaw === "string") { try { const parsed: unknown = JSON.parse(itemsRaw); if (Array.isArray(parsed)) items = parsed; } catch { /* Keep raw callback visible if the broker returns malformed JSON. */ } }
      const perSecurity = items.map((item) => {
        const row = asRecord(item) ?? {};
        const itemStatus = normalizeStatus(firstValue(row, ["status", "Status", "result", "approvalStatus"]));
        return {
          isin: String(firstValue(row, ["ISIN", "isin", "sISINCode"]) ?? "—"),
          name: String(firstValue(row, ["ISINName", "isinName", "name", "sSecurityDesc"]) ?? "—"),
          status: itemStatus === "Unknown" ? normalizeStatus(firstValue(row, ["Status", "status"])) : itemStatus,
          message: String(firstValue(row, ["message", "Message", "remarks", "description", "ErrorDesc", "errorDesc"]) ?? ""),
          quantity: Number(firstValue(row, ["Quantity", "Qty", "quantity", "approvedQuantity"])) || undefined,
        };
      });
      const result: ApprovalResult = { reqId: receivedReqId || pendingReqId.current || "—", status, message, receivedAt: new Date().toLocaleString(), raw: event.data, perSecurity };
      if (pendingAction.current === "revoke") {
        setRevokeResult(result);
        setRevokeMessage(status === "Approved" ? "The callback reports that the revoke request succeeded. Refresh the summary to reconcile quantities." : status === "Rejected" ? "The callback reports that the revoke request failed or was rejected." : status === "Pending" ? "The revoke request is pending; final status is not confirmed." : "A callback was received, but its status was not recognized. Verify with the broker.");
      } else {
        setApprovalResult(result);
        setApprovalMessage(status === "Approved" ? "The callback reports approval. Refresh the summary to reconcile quantities." : status === "Rejected" ? "The callback reports that the request was rejected or failed." : status === "Pending" ? "The callback reports a pending request. Final approval is not confirmed." : "A callback was received, but its status was not recognized. Verify it with the broker before taking further action.");
      }
      // Refresh for every recognized callback: approvals and revocations can be partial or pending.
      refreshSummaryAfterAction();
      if (popupWatchRef.current) { clearInterval(popupWatchRef.current); popupWatchRef.current = null; }
      setPopupState("closed");
    }
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (popupWatchRef.current) clearInterval(popupWatchRef.current);
      if (summaryRefreshTimeoutRef.current) clearTimeout(summaryRefreshTimeoutRef.current);
    };
  }, [summaryResponse.reload]);
  async function launchConfiguredRedirect(action: "approval" | "revoke", requestId: string, scripDetails: Array<{ ISIN: string; Quantity: number; ISINName: string; SettlmtCycle?: string }>) {
    const payload = {
      action, requestId, depository: String(dp?.sDepository ?? "").toUpperCase(),
      dp: {
        dpId: String(dp?.sDPId ?? dp?.sDpId ?? ""),
        clientId: String(dp?.nBeneficiaryAccountNumber ?? ""),
        userId: String(dp?.sClientId ?? dp?.sClientCode ?? ""),
        groupId: String(dp?.sGroupId ?? ""),
      },
      scripDetails,
      options: {},
    };
    const popup = window.open("", action === "approval" ? "aveon-edis-approval" : "aveon-edis-revoke", "popup=yes,width=980,height=760,resizable=yes,scrollbars=yes");
    if (!popup) throw new Error("The browser blocked the pop-up. Allow pop-ups for AveonTradeWeb and try again.");
    popupRef.current = popup;
    try {
      const response = await fetch("/api/edis/redirect", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok || !result?.success || !result?.url) throw new Error(result?.message || "EDIS redirect configuration is incomplete.");
      popupOriginRef.current = new URL(result.url).origin;
      popup.location.href = result.url;
      setPopupState("open");
      if (popupWatchRef.current) clearInterval(popupWatchRef.current);
      popupWatchRef.current = setInterval(() => {
        if (popupRef.current?.closed) {
          if (popupWatchRef.current) clearInterval(popupWatchRef.current);
          popupWatchRef.current = null; setPopupState("closed");
          const msg = action === "approval"
            ? "The approval window closed without a recognized callback. Final status is unconfirmed; the summary has been refreshed, but verify with the broker."
            : "The revoke window closed without a recognized callback. Final status is unconfirmed; the summary has been refreshed, but verify with the broker.";
          if (action === "approval") setApprovalMessage(msg); else setRevokeMessage(msg);
          refreshSummaryAfterAction();
        }
      }, 700);
    } catch (error) { popup.close(); throw error; }
  }

  async function launchApproval() {
    setApprovalMessage("");
    if (!selectedRows.length) { setApprovalMessage("Select at least one security and enter a quantity greater than zero."); return; }
    if (!dp?.sDepository || !(dp.sDPId ?? dp.sDpId) || !dp.nBeneficiaryAccountNumber) { setApprovalMessage("DP details are incomplete. Refresh DP Details before continuing."); return; }
    const requestId = `EDIS-${Date.now()}`;
    const scripDetails = selectedRows.map((row) => ({ ISIN: String(row.sISINCode), Quantity: Number(selected[String(row.sISINCode)]), ISINName: String(row.sSecurityDesc ?? row.sISINCode) }));
    pendingReqId.current = requestId; pendingAction.current = "approval"; setApprovalResult(null); setPopupState("idle");
    try { await launchConfiguredRedirect("approval", requestId, scripDetails); setApprovalMessage(`Approval window opened for ${selectedRows.length} security item(s). Request ID: ${requestId}. Waiting for a recognized depository callback.`); }
    catch (error) { setApprovalMessage(error instanceof Error ? error.message : "Unable to open the approval workflow."); }
  }

  async function launchRevoke() {
    setRevokeMessage("");
    if (!selectedRows.length) { setRevokeMessage("Select at least one security and enter a quantity greater than zero."); return; }
    if (!dp?.sDepository || !(dp.sDPId ?? dp.sDpId) || !dp.nBeneficiaryAccountNumber) { setRevokeMessage("DP details are incomplete. Refresh DP Details before continuing."); return; }
    const depository = String(dp.sDepository).toUpperCase();
    if (depository !== "CDSL" && depository !== "NSDL") { setRevokeMessage(`Unsupported depository value: ${depository}. Expected CDSL or NSDL.`); return; }
    const requestId = `EDIS-REVOKE-${Date.now()}`;
    const scripDetails = selectedRows.map((row) => ({ ISIN: String(row.sISINCode), Quantity: Number(selected[String(row.sISINCode)]), ISINName: String(row.sSecurityDesc ?? row.sISINCode) }));
    pendingReqId.current = requestId; pendingAction.current = "revoke"; setRevokeResult(null); setPopupState("idle");
    try { await launchConfiguredRedirect("revoke", requestId, scripDetails); setRevokeMessage(`Revoke window opened for ${selectedRows.length} security item(s). Request ID: ${requestId}. Waiting for a recognized depository callback.`); }
    catch (error) { setRevokeMessage(error instanceof Error ? error.message : "Unable to open the revoke workflow."); }
  }
  async function generateTpin() {
    setTpinMessage("");
    setTpinResponse(null);
    if (String(dp?.sDepository ?? "").toUpperCase() !== "CDSL") {
      setTpinMessage("TPIN generation is available for CDSL accounts only.");
      return;
    }
    const dpid = String(dp?.sDPId ?? dp?.sDpId ?? "").trim();
    const boid = tpinBoid.trim();
    const pan = tpinPan.trim().toUpperCase();
    if (!dpid || !boid || !pan) {
      setTpinMessage("Enter the DP ID, full BOID and PAN before generating a TPIN.");
      return;
    }
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
      setTpinMessage("Enter a valid 10-character PAN.");
      return;
    }
    setTpinLoading(true);
    try {
      const response = await fetch("/api/edis/generate-tpin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ dpid, boid, dp_type: "CDSL", pan }),
      });
      const payload = await response.json() as Record<string, unknown>;
      const data = payload.data && typeof payload.data === "object" ? payload.data as Record<string, unknown> : {};
      if (!response.ok || payload.success !== true) {
        setTpinMessage(String(payload.message ?? "TPIN generation request failed. Please verify the account details and try again."));
        setTpinResponse(data && Object.keys(data).length ? data : null);
        return;
      }
      setTpinResponse(data);
      const status = String(data.Status ?? data.status ?? "");
      const errorCode = String(data.ErrorCode ?? data.errorCode ?? "").trim();
      const message = String(payload.message ?? "TPIN request submitted.");
      if (status === "00" && !errorCode) setTpinMessage(`${message} Check your registered contact details for the depository's TPIN communication.`);
      else setTpinMessage(`${message}${status ? ` Status: ${status}.` : ""}${errorCode ? ` Error code: ${errorCode}.` : ""}`);
    } catch {
      setTpinMessage("Unable to contact the TPIN service. Check your connection and retry.");
    } finally {
      setTpinLoading(false);
    }
  }

  const nav = [
    { id: "summary", label: "EDIS Summary" },
    { id: "dp", label: "DP Details" },
    { id: "actions", label: "Approval / Revoke / TPIN" },
  ] as const;


  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-xl font-semibold">EDIS</h1><p className="mt-1 text-xs text-aveon-muted">Electronic Delivery Instruction Slip · Summary, depository details and approval workflows</p></div>
      <Button variant="ghost" onClick={() => { dpResponse.reload(); summaryResponse.reload(); }} disabled={dpResponse.loading || summaryResponse.loading}>Refresh all</Button>
    </div>
    <div className="flex flex-wrap gap-2 border-b border-aveon-border pb-3">
      {nav.map((item) => <Button key={item.id} variant={section === item.id ? "primary" : "ghost"} onClick={() => setSection(item.id)}>{item.label}</Button>)}
    </div>

    {section === "summary" && <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-40 flex-1"><label className="mb-1 block text-xs text-aveon-muted">Market Segment</label><Select value={segment} onChange={(e) => setSegment(e.target.value)}><option value="">All segments (default)</option><option value="NSE_EQ">NSE Equity</option><option value="BSE_EQ">BSE Equity</option><option value="NSE_FO">NSE F&amp;O</option><option value="BSE_FO">BSE F&amp;O</option></Select></div>
          <div className="min-w-32 flex-1"><label className="mb-1 block text-xs text-aveon-muted">Scrip Token</label><Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="-1 for all" /></div>
          <Button variant="ghost" onClick={() => summaryResponse.reload()} disabled={summaryResponse.loading}>{summaryResponse.loading ? "Loading…" : "Refresh summary"}</Button>
        </div>
      </Card>
      <Card>
        <div><h2 className="text-sm font-semibold">Today’s EDIS Summary</h2><p className="mt-1 text-xs text-aveon-muted">Daily security availability, approval quantities and EDIS configuration.</p></div>
        {summaryResponse.loading ? <p className="py-8 text-xs text-aveon-muted">Loading EDIS summary…</p> : summaryResponse.error ? <div className="pt-4"><EmptyState title="Unable to load EDIS summary" subtitle={summaryResponse.error} /></div> : summaryRows.length === 0 ? <div className="pt-4"><EmptyState title="No EDIS summary available" subtitle="The API returned no summary rows for the selected filters." /></div> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[1040px] text-left text-xs"><thead><tr className="border-y border-aveon-border text-aveon-muted">{["Approve", "Security", "ISIN", "Free Qty", "Today Free", "Approved", "DP Qty", "Check Qty", "Request Qty", "Close Price", "Quantity", "Settlement"].map((h) => <th key={h} className="px-3 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{summaryRows.map((r, i) => { const isin = String(r.sISINCode ?? ""); const maxQty = Math.max(0, Number(r.eDISDPQty ?? r.TotalFreeQty ?? 0) || 0); const chosen = selected[isin] ?? 0; return <tr key={`${isin || "row"}-${i}`} className="border-b border-aveon-border/70"><td className="px-3 py-3"><input aria-label={`Select ${text(r.sSecurityDesc)} for EDIS approval`} type="checkbox" checked={chosen > 0} disabled={!isin || maxQty <= 0} onChange={(e) => setSelected((current) => { const next = { ...current }; if (e.target.checked) next[isin] = Math.min(maxQty, Math.max(1, Number(r.eDISRequestQty) || 1)); else delete next[isin]; return next; })} /></td><td className="px-3 py-3 font-medium">{text(r.sSecurityDesc)}</td><td className="px-3 py-3">{text(isin)}</td><td className="px-3 py-3">{text(r.TotalFreeQty)}</td><td className="px-3 py-3">{text(r.TodayFreeQty)}</td><td className="px-3 py-3">{text(r.ApprovedQuantity)}</td><td className="px-3 py-3">{text(r.eDISDPQty)}</td><td className="px-3 py-3">{text(r.eDISCheckQty)}</td><td className="px-3 py-3">{text(r.eDISRequestQty)}</td><td className="px-3 py-3">{text(r.ClosePrice)}</td><td className="px-3 py-3"><Input className="w-24" type="number" min="0" max={maxQty} value={chosen || ""} disabled={!isin || maxQty <= 0} onChange={(e) => setSelected((current) => { const next = { ...current }; const qty = Math.floor(Number(e.target.value)); if (qty > 0) next[isin] = Math.min(maxQty, qty); else delete next[isin]; return next; })} placeholder={`Max ${maxQty}`} /></td><td className="px-3 py-3">{String(r.nSettlementType ?? "—") === "1" ? "Regular" : String(r.nSettlementType ?? "—") === "2" ? "Auction" : text(r.nSettlementType)}</td></tr>; })}</tbody></table></div>}
      </Card>
      <Card><h2 className="text-sm font-semibold">EDIS Configuration</h2><dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">{[["DP Check", config.DPCheck === 1 || String(config.DPCheck) === "1" ? "Enabled" : config.DPCheck === 0 || String(config.DPCheck) === "0" ? "Disabled" : config.DPCheck], ["Max Transactions", config.MaxTranCount], ["Single Transaction Limit", config.Singletrans], ["Transactions Used", config.UserTranCount], ["Value Utilized", config.ValueUtilized], ["Daily Value Limit", config.PerDayTransactionvalue]].map(([label, value]) => <Field key={String(label)} label={String(label)} value={value} />)}</dl></Card>
    </div>}

    {section === "dp" && <Card>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Depository Participant (DP) Details</h2><p className="mt-1 text-xs text-aveon-muted">DP and beneficiary account details used for EDIS.</p></div><Button variant="ghost" onClick={() => dpResponse.reload()} disabled={dpResponse.loading}>{dpResponse.loading ? "Refreshing…" : "Refresh"}</Button></div>
      {dpResponse.loading ? <p className="py-8 text-xs text-aveon-muted">Loading DP details…</p> : dpResponse.error ? <div className="pt-4"><EmptyState title="Unable to load DP details" subtitle={dpResponse.error} /></div> : !dp || isEmpty(dp) ? <div className="pt-4"><EmptyState title="No DP details available" subtitle="No depository or beneficiary account details were returned for this session." /></div> : <><div className="mt-4 flex items-center gap-2"><Badge tone={String(dp.nBeneficiaryStatus) === "1" ? "buy" : "neutral"}>Beneficiary status: {text(dp.nBeneficiaryStatus)}</Badge><Badge>Priority {text(dp.nPriority)}</Badge></div><dl className="mt-5 grid grid-cols-1 gap-x-8 gap-y-4 border-t border-aveon-border pt-4 sm:grid-cols-2 lg:grid-cols-3"><Field label="Client ID" value={dp.sClientId}/><Field label="Client Code" value={dp.sClientCode}/><Field label="Group ID" value={dp.sGroupId}/><Field label="Depository" value={dp.sDepository}/><Field label="DP ID" value={dp.sDPId ?? dp.sDpId}/><Field label="Beneficiary Account" value={dp.nBeneficiaryAccountNumber} sensitive/><Field label="DP Bank ID" value={dp.sDPBankId}/></dl></>}
    </Card>}

    {section === "actions" && <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold">EDIS Approval</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-aveon-muted">Review the selected securities, confirm the depository details and open the configured depository authorization page. No approval is considered successful merely because the pop-up opens.</p></div><Badge tone="warn">User confirmation required</Badge></div>
        <p className="mt-4 text-xs text-aveon-muted">Broker integration settings are managed centrally. Review the selected securities and quantities before continuing.</p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-aveon-border p-3"><div className="text-xs text-aveon-muted">Selected: <span className="font-semibold text-aveon-text">{selectedRows.length} security(s)</span> · Total quantity: <span className="font-semibold text-aveon-text">{selectedRows.reduce((sum, row) => sum + (Number(selected[String(row.sISINCode)]) || 0), 0)}</span> · Approx. value: <span className="font-semibold text-aveon-text">{selectedValue.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 })}</span></div><Button onClick={launchApproval}>Review &amp; open approval</Button></div>
        {approvalMessage && <p role="status" className="mt-3 rounded-lg border border-aveon-border p-3 text-xs leading-5 text-aveon-muted">{approvalMessage}</p>}
        {popupState === "open" && <p className="mt-2 text-xs text-aveon-muted">Authorization window: open · Waiting for response</p>}
        {popupState === "closed" && !approvalResult && <p className="mt-2 text-xs text-aveon-muted">Authorization window: closed · Status not confirmed</p>}
        {approvalResult && <Card className="mt-4 border-aveon-border">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">Approval response</h3><p className="mt-1 text-xs text-aveon-muted">Request ID: {approvalResult.reqId} · Received: {approvalResult.receivedAt}</p></div><Badge tone={approvalResult.status === "Approved" ? "buy" : approvalResult.status === "Rejected" ? "sell" : "warn"}>{approvalResult.status}</Badge></div>
          <p className="mt-3 text-sm">{approvalResult.message}</p>
          {approvalResult.perSecurity.length > 0 && <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs"><thead><tr className="border-y border-aveon-border text-aveon-muted">{["Security", "ISIN", "Quantity", "Status", "Message"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead><tbody>{approvalResult.perSecurity.map((item, index) => <tr key={`${item.isin}-${index}`} className="border-b border-aveon-border/70"><td className="px-3 py-2">{item.name}</td><td className="px-3 py-2">{item.isin}</td><td className="px-3 py-2">{text(item.quantity)}</td><td className="px-3 py-2"><Badge tone={item.status === "Approved" ? "buy" : item.status === "Rejected" ? "sell" : "warn"}>{item.status}</Badge></td><td className="px-3 py-2">{text(item.message)}</td></tr>)}</tbody></table></div>}
          <p className="mt-3 text-xs leading-5 text-aveon-muted">Only a recognized callback status is shown here. If no callback arrives, closing the pop-up is not treated as approval. Confirm the broker's exact callback payload before relying on per-security results.</p>
        </Card>}
        <p className="mt-3 text-xs leading-5 text-aveon-muted">Broker endpoints and integration parameters are managed centrally. The request is securely prepared by the server and opened in the depository authorization window. The depository callback/webhook must be configured separately to record final per-security results.</p>
      </Card>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold">EDIS Revoke</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-aveon-muted">Revoke authorization for the selected securities using the DP's depository. Revoke is a separate, consequential action; review the selected ISINs and quantities before continuing.</p></div><Badge tone="warn">User confirmation required</Badge></div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-aveon-border p-3"><div className="text-xs text-aveon-muted">Depository: <span className="font-semibold text-aveon-text">{text(dp?.sDepository)}</span> · Selected: <span className="font-semibold text-aveon-text">{selectedRows.length} security(s)</span> · Quantity: <span className="font-semibold text-aveon-text">{selectedRows.reduce((sum, row) => sum + (Number(selected[String(row.sISINCode)]) || 0), 0)}</span></div><Button variant="ghost" onClick={launchRevoke}>Review &amp; open revoke</Button></div>
        {revokeMessage && <p role="status" className="mt-3 rounded-lg border border-aveon-border p-3 text-xs leading-5 text-aveon-muted">{revokeMessage}</p>}
        {revokeResult && <div className="mt-4 rounded-lg border border-aveon-border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Revoke response</h3><Badge tone={revokeResult.status === "Approved" ? "buy" : revokeResult.status === "Rejected" ? "sell" : "warn"}>{revokeResult.status}</Badge></div><p className="mt-2 text-xs text-aveon-muted">Request ID: {revokeResult.reqId} · Received: {revokeResult.receivedAt}</p><p className="mt-2 text-sm">{revokeResult.message}</p>{revokeResult.perSecurity.length > 0 && <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[480px] text-left text-xs"><thead><tr className="border-y border-aveon-border text-aveon-muted">{["Security", "ISIN", "Quantity", "Status", "Message"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead><tbody>{revokeResult.perSecurity.map((item, index) => <tr key={`${item.isin}-${index}`} className="border-b border-aveon-border/70"><td className="px-3 py-2">{item.name}</td><td className="px-3 py-2">{item.isin}</td><td className="px-3 py-2">{text(item.quantity)}</td><td className="px-3 py-2"><Badge tone={item.status === "Approved" ? "buy" : item.status === "Rejected" ? "sell" : "warn"}>{item.status}</Badge></td><td className="px-3 py-2">{text(item.message)}</td></tr>)}</tbody></table></div>}<p className="mt-3 text-xs text-aveon-muted">Popup closure alone does not confirm revocation. Verify the configured broker callback/webhook and refresh the summary.</p></div>}
      </Card>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold">Generate TPIN</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-aveon-muted">Request a CDSL transaction PIN. This submits a generation request; the PIN itself is not displayed in AveonTradeWeb.</p></div><Badge tone={String(dp?.sDepository ?? "").toUpperCase() === "CDSL" ? "buy" : "neutral"}>CDSL only</Badge></div>
        {String(dp?.sDepository ?? "").toUpperCase() !== "CDSL" ? <p className="mt-4 rounded-lg border border-aveon-border p-3 text-xs text-aveon-muted">TPIN generation is available only for CDSL. The current DP details show {text(dp?.sDepository)}.</p> : <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div><label className="mb-1 block text-xs text-aveon-muted">DP ID</label><Input value={String(dp?.sDPId ?? dp?.sDpId ?? "")} readOnly /></div>
            <div><label className="mb-1 block text-xs text-aveon-muted">Beneficial Owner ID (BOID)</label><Input value={tpinBoid} onChange={(e) => setTpinBoid(e.target.value.replace(/\s/g, ""))} placeholder="Enter full CDSL BOID" autoComplete="off" /></div>
            <div><label className="mb-1 block text-xs text-aveon-muted">PAN</label><Input value={tpinPan} onChange={(e) => setTpinPan(e.target.value.toUpperCase().slice(0, 10))} placeholder="ABCDE1234F" autoComplete="off" maxLength={10} /></div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-aveon-border p-3"><p className="text-xs text-aveon-muted">Verify the BOID and PAN against your depository records before submitting.</p><Button onClick={generateTpin} disabled={tpinLoading || !dp?.sDPId && !dp?.sDpId}>{tpinLoading ? "Submitting…" : "Generate TPIN"}</Button></div>
          {tpinMessage && <p role="status" className="mt-3 rounded-lg border border-aveon-border p-3 text-xs leading-5 text-aveon-muted">{tpinMessage}</p>}
          {tpinResponse && <dl className="mt-4 grid grid-cols-1 gap-4 rounded-lg border border-aveon-border p-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Request ID" value={tpinResponse.ReqId ?? tpinResponse.reqId}/><Field label="Response ID" value={tpinResponse.ResId ?? tpinResponse.resId}/><Field label="Response Time" value={tpinResponse.ResTime ?? tpinResponse.resTime}/><Field label="Service Status" value={tpinResponse.Status ?? tpinResponse.status}/><Field label="Error Code" value={tpinResponse.ErrorCode ?? tpinResponse.errorCode}/></dl>}
        </>}
      </Card>
    </div>}
  </div>;
}
