"use client";

import { useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { Badge, Card, EmptyState } from "@/components/ui/Primitives";
import { usePolledData } from "@/hooks/usePolledData";
import { extractList } from "@/types/trading";

type BannedScrip = { exchange?: string; token?: number | string; symbol?: string };

export default function BannedScripsPage() {
  // The ban list is per trading day, so a slow refresh is plenty.
  const { data, loading, error, reload } = usePolledData<unknown>("/banned-scrips", 10 * 60_000);
  const [query, setQuery] = useState("");
  const [exchange, setExchange] = useState("ALL");

  const rows = useMemo(
    () =>
      extractList<BannedScrip>(data, ["data", "result"])
        .filter((r) => r && (r.symbol || r.token !== undefined))
        .sort((a, b) => String(a.symbol ?? "").localeCompare(String(b.symbol ?? ""))),
    [data]
  );
  const exchanges = useMemo(() => Array.from(new Set(rows.map((r) => r.exchange).filter(Boolean) as string[])).sort(), [rows]);

  const needle = query.trim().toLowerCase();
  const visible = rows.filter(
    (r) =>
      (exchange === "ALL" || r.exchange === exchange) &&
      (!needle || String(r.symbol ?? "").toLowerCase().includes(needle) || String(r.token ?? "").includes(needle))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-aveon-text">Banned Scrips</h1>
          <p className="text-xs text-aveon-muted">Scrips banned in F&amp;O for today. Fresh positions in these are not allowed.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-aveon-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search symbol or token"
              className="w-52 rounded-md border border-aveon-border bg-aveon-panel2 py-1.5 pl-8 pr-3 text-xs text-aveon-text outline-none focus:border-aveon-primary"
            />
          </div>
          {exchanges.length > 1 && (
            <select
              value={exchange}
              onChange={(e) => setExchange(e.target.value)}
              className="rounded-md border border-aveon-border bg-aveon-panel2 px-3 py-1.5 text-xs text-aveon-text outline-none focus:border-aveon-primary"
            >
              <option value="ALL">All exchanges</option>
              {exchanges.map((x) => (
                <option key={x} value={x}>{x.replace("_", " ")}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => reload()}
            className="flex items-center gap-1.5 rounded-md border border-aveon-border bg-aveon-panel2 px-3 py-1.5 text-xs font-medium text-aveon-text hover:bg-aveon-panel"
            title="Refresh"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        {loading && rows.length === 0 ? (
          <p className="p-6 text-xs text-aveon-muted">Loading banned scrips...</p>
        ) : error && rows.length === 0 ? (
          <p className="p-6 text-xs text-aveon-sell">{error}</p>
        ) : rows.length === 0 ? (
          <EmptyState title="No scrips are banned today." subtitle="The exchange has not published any F&O ban for this day." />
        ) : visible.length === 0 ? (
          <EmptyState title="No banned scrips match your filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-aveon-border bg-aveon-panel2 text-left text-aveon-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Symbol</th>
                  <th className="px-4 py-2 font-medium">Exchange</th>
                  <th className="px-4 py-2 font-medium">Token</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-aveon-border/40">
                {visible.map((r, i) => (
                  <tr key={`${r.exchange}-${r.token}-${i}`} className="table-row-hover">
                    <td className="px-4 py-2.5 font-semibold text-aveon-text">{r.symbol || "—"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-aveon-muted">{r.exchange ? r.exchange.replace("_", " ") : "—"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap font-mono text-aveon-muted">{r.token ?? "—"}</td>
                    <td className="px-4 py-2.5"><Badge tone="sell">Banned</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-aveon-border px-4 py-2 text-[11px] text-aveon-muted">
              {visible.length === rows.length ? `${rows.length} banned scrip${rows.length === 1 ? "" : "s"}` : `${visible.length} of ${rows.length} banned scrips`}
              {error && <span className="ml-3 text-amber-500">Last refresh failed: {error}</span>}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
