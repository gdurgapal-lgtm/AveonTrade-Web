"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, EmptyState, Badge } from "@/components/ui/Primitives";
import { apiClient } from "@/lib/apiClient";
import { extractList } from "@/types/trading";
import { RefreshCw } from "lucide-react";

const TABS = ["Order Messages", "Exchange Messages", "Broker Messages", "Recommendations"] as const;
type MessageTab = (typeof TABS)[number];

// Exchange segments from the Synapsewave Reference Catalog ("Exchange Segments").
// `code` is the name sent as the path parameter, `id` is the numeric segment id
// (also what the response returns in `SegmentId`).
const SEGMENTS = [
  { code: "NSE_EQ", id: 1, label: "NSE Equity" },
  { code: "NSE_FO", id: 2, label: "NSE F&O" },
  { code: "BSE_EQ", id: 8, label: "BSE Equity" },
  { code: "BSE_FO", id: 4, label: "BSE F&O" },
  { code: "MCX_FO", id: 16, label: "MCX Commodity" },
  { code: "NCDEX_FO", id: 64, label: "NCDEX Commodity" },
  { code: "NSE_CUR", id: 2048, label: "NSE Currency" },
  { code: "BSE_CUR", id: 268435456, label: "BSE Currency" },
  { code: "MSE_CUR", id: 1024, label: "MSE Currency" },
  { code: "NSE_COMM", id: 32768, label: "NSE Commodity" },
  { code: "BSE_COMM", id: 16384, label: "BSE Commodity" },
  { code: "NSE_EGR", id: 21, label: "NSE EGR" },
  { code: "NSE_OTS", id: 536870912, label: "NSE Odd Lot" },
] as const;
const DEFAULT_SEGMENT = "NSE_EQ";
const segmentById = (id: unknown) => SEGMENTS.find((s) => String(s.id) === String(id))?.code;

export default function MessagesPage() {
  const [tab, setTab] = useState<MessageTab>("Order Messages");
  const [exchangeSegment, setExchangeSegment] = useState<string>(DEFAULT_SEGMENT);

  // State data for each tab
  const [orderMessages, setOrderMessages] = useState<any[]>([]);
  const [exchangeMessages, setExchangeMessages] = useState<any[]>([]);
  const [brokerMessages, setBrokerMessages] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch function based on active tab (request-based on tab click/refresh)
  const fetchTabData = useCallback(async (activeTab: MessageTab, segment: string) => {
    setLoading(true);
    setError(null);
    try {
      let endpoint = "";
      // Served by app/api/broker/messages/route.ts, which puts the tenant id in
      // the broker path (/nontransactional/{tenantId}/v1/...).
      if (activeTab === "Order Messages") endpoint = "/messages?type=order&pageNo=1&pageSize=50";
      else if (activeTab === "Exchange Messages") {
        const seg = SEGMENTS.find((x) => x.code === segment) ?? SEGMENTS[0];
        endpoint = `/messages?type=exchange&segmentId=${encodeURIComponent(seg.code)}&segmentNo=${seg.id}&noofhrs=24&pageNo=1&pageSize=50`;
      }
      else if (activeTab === "Broker Messages") endpoint = "/messages?type=broker&pageNo=1&pageSize=50";
      else if (activeTab === "Recommendations") endpoint = "/messages?type=recommendations&pageNo=1&pageSize=10";

      // Same-origin call through the allow-listed /api/broker/[...path] proxy.
      const res = await apiClient.get<any>(endpoint);
      if (!res.success) {
        setError(res.message || `Request failed (${res.statusCode || "network"}).`);
        return;
      }
      // Broker body is { status, result: [...] }; the proxy puts it in res.data.
      const rows = extractList<any>(res.data, ["result", "data", "items"]);

      if (activeTab === "Order Messages") setOrderMessages(rows);
      else if (activeTab === "Exchange Messages") setExchangeMessages(rows);
      else if (activeTab === "Broker Messages") setBrokerMessages(rows);
      else if (activeTab === "Recommendations") setRecommendations(rows);
    } catch (err) {
      console.error("Failed to fetch messages:", err);
      setError("Failed to load messages.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Trigger fetch only when tab or exchange segment changes
  useEffect(() => {
    fetchTabData(tab, exchangeSegment);
  }, [tab, exchangeSegment, fetchTabData]);

  const currentData =
    tab === "Order Messages" ? orderMessages :
    tab === "Exchange Messages" ? exchangeMessages :
    tab === "Broker Messages" ? brokerMessages : recommendations;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-aveon-text">Messages Hub</h1>
          <p className="text-xs text-aveon-muted">Audit system notices, order logs, exchange circulars, and broker recommendations.</p>
        </div>

        <div className="flex items-center gap-3">
          {tab === "Exchange Messages" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-aveon-muted">Exchange:</span>
              <select
                value={exchangeSegment}
                onChange={(e) => setExchangeSegment(e.target.value)}
                className="rounded-md border border-aveon-border bg-aveon-panel2 px-3 py-1.5 text-xs text-aveon-text outline-none focus:border-aveon-primary"
              >
                {SEGMENTS.map((x) => (
                  <option key={x.code} value={x.code}>{x.label}</option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => fetchTabData(tab, exchangeSegment)}
            className="flex items-center gap-1.5 rounded-md border border-aveon-border bg-aveon-panel2 px-3 py-1.5 text-xs font-medium text-aveon-text hover:bg-aveon-panel"
            title="Refresh"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto border-b border-aveon-border pb-3">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md border px-4 py-2 text-xs font-semibold transition-colors ${
              tab === t
                ? "border-aveon-primary bg-aveon-primary text-white shadow-sm"
                : "border-aveon-border bg-aveon-panel2 text-aveon-muted hover:text-aveon-text"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <Card className="p-0 overflow-hidden">
        {loading && currentData.length === 0 ? (
          <p className="p-6 text-xs text-aveon-muted">Loading {tab.toLowerCase()}...</p>
        ) : error && currentData.length === 0 ? (
          <p className="p-6 text-xs text-aveon-sell">{error}</p>
        ) : currentData.length === 0 ? (
          <EmptyState title={`No ${tab.toLowerCase()} found.`} />
        ) : (
          <div className="overflow-x-auto">
            {tab === "Order Messages" && (
              <table className="w-full text-xs">
                <thead className="border-b border-aveon-border text-left text-aveon-muted bg-aveon-panel2">
                  <tr>
                    <th className="px-4 py-2 font-medium">Time / Date</th>
                    <th className="px-4 py-2 font-medium">Order ID</th>
                    <th className="px-4 py-2 font-medium">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-aveon-border/40">
                  {orderMessages.map((m, i) => (
                    <tr key={i} className="table-row-hover">
                      <td className="px-4 py-2.5 whitespace-nowrap text-aveon-muted">
                        {m.date} {m.time}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap font-mono">{m.cliOrdNo || "—"}</td>
                      <td className="px-4 py-2.5 leading-relaxed">{m.msg}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tab === "Exchange Messages" && (
              <table className="w-full text-xs">
                <thead className="border-b border-aveon-border text-left text-aveon-muted bg-aveon-panel2">
                  <tr>
                    <th className="px-4 py-2 font-medium">Segment</th>
                    <th className="px-4 py-2 font-medium">Time</th>
                    <th className="px-4 py-2 font-medium">Circular / Broadcast</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-aveon-border/40">
                  {exchangeMessages.map((m, i) => (
                    <tr key={i} className="table-row-hover">
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <Badge tone="neutral">{segmentById(m.SegmentId) ?? exchangeSegment}</Badge>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-aveon-muted">{m.Time}</td>
                      <td className="px-4 py-2.5 font-mono text-[11px] leading-relaxed">{m.Messages?.replace(/\u0000/g, "").trim()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tab === "Broker Messages" && (
              <table className="w-full text-xs">
                <thead className="border-b border-aveon-border text-left text-aveon-muted bg-aveon-panel2">
                  <tr>
                    <th className="px-4 py-2 font-medium">Time</th>
                    <th className="px-4 py-2 font-medium">Subject</th>
                    <th className="px-4 py-2 font-medium">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-aveon-border/40">
                  {brokerMessages.map((m, i) => (
                    <tr key={i} className="table-row-hover">
                      <td className="px-4 py-2.5 whitespace-nowrap text-aveon-muted">{m.SendMsgTime}</td>
                      <td className="px-4 py-2.5 font-semibold text-aveon-text">{m.Subject}</td>
                      <td className="px-4 py-2.5 text-aveon-muted leading-relaxed">{m.Message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tab === "Recommendations" && (
              <table className="w-full text-xs">
                <thead className="border-b border-aveon-border text-left text-aveon-muted bg-aveon-panel2">
                  <tr>
                    <th className="px-4 py-2 font-medium">Scrip</th>
                    <th className="px-4 py-2 font-medium">Details / Payload</th>
                    <th className="px-4 py-2 font-medium">Expiry</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-aveon-border/40">
                  {recommendations.map((r, i) => (
                    <tr key={i} className="table-row-hover">
                      <td className="px-4 py-2.5 whitespace-nowrap font-semibold">{r.sScripDesc}</td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-aveon-muted max-w-md truncate">{r.sRecoDetails}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-aveon-muted">
                        {r.nExpiryDate ? new Date(r.nExpiryDate).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}