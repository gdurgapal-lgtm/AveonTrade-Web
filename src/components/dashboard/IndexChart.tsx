"use client";

import { useEffect, useState } from "react";
import { AreaChart, Area, ResponsiveContainer, YAxis } from "recharts";
import { formatNumber, pnlTone } from "@/lib/format";
import type { WatchlistQuote } from "@/types/trading";

interface Point {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * Real NIFTY 50 intraday chart — reuses the same Yahoo history route the
 * Market Watch chart falls back to (Yahoo maps NIFTY/NSE_INDICES to ^NSEI,
 * see src/app/api/market-data/history/route.ts).
 */
export default function IndexChart({
  name = "NIFTY 50",
  symbol = "NIFTY",
  exchange = "NSE_INDICES",
  liveQuote,
  historyEnabled = true,
}: {
  name?: string;
  symbol?: string;
  exchange?: string;
  liveQuote?: WatchlistQuote;
  historyEnabled?: boolean;
}) {
  const [points, setPoints] = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!historyEnabled || !exchange) {
      setLoading(false);
      setPoints([]);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/market-data/history?symbol=${encodeURIComponent(symbol)}&exchange=${encodeURIComponent(exchange)}&interval=5m&range=1d`
        );
        const json = await res.json();
        if (!cancelled && json.success) {
          setPoints(
            (json.data ?? []).map((c: any) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }))
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbol, exchange, historyEnabled]);

  const historyLast = points[points.length - 1]?.close;
  const last = liveQuote?.ltp ?? historyLast;
  const first = points[0]?.close;
  const change = liveQuote?.change ?? (last && first ? last - first : 0);
  const changePercent = liveQuote?.change_percent ?? (first ? (change / first) * 100 : 0);
  const tone = pnlTone(change);
  const stroke = tone === "buy" ? "rgb(var(--aveon-buy))" : tone === "sell" ? "rgb(var(--aveon-sell))" : "rgb(var(--aveon-muted))";

  const dayOpen = liveQuote?.open || points[0]?.open;
  const dayHigh = liveQuote?.high || (points.length ? Math.max(...points.map((p) => p.high)) : undefined);
  const dayLow = liveQuote?.low || (points.length ? Math.min(...points.map((p) => p.low)) : undefined);
  const dayClose = liveQuote?.close;

  return (
    <div className="card p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <div>
          <p className="text-sm font-semibold">{name}</p>
          {last !== undefined && (
            <p className="text-lg font-semibold">
              {formatNumber(last)}{" "}
              <span className={`text-xs ${tone === "buy" ? "text-aveon-buy" : "text-aveon-sell"}`}>
                {change >= 0 ? "+" : ""}
                {formatNumber(change)} ({formatNumber(changePercent)}%)
              </span>
            </p>
          )}
        </div>
      </div>
      <div className="h-24">
        {loading ? (
          <p className="text-xs text-aveon-muted">Loading…</p>
        ) : points.length === 0 ? (
          <p className="text-xs text-aveon-muted">No data available.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="indexFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis domain={["dataMin", "dataMax"]} hide />
              <Area
                type="monotone"
                dataKey="close"
                stroke={stroke}
                strokeWidth={1.5}
                fill="url(#indexFill)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {dayOpen !== undefined && (
        <div className="mt-2 grid grid-cols-4 gap-1 border-t border-aveon-border pt-2 text-center text-[11px]">
          <OhlcStat label="Open" value={dayOpen} />
          <OhlcStat label="High" value={dayHigh} />
          <OhlcStat label="Low" value={dayLow} />
          <OhlcStat label="Close" value={dayClose} />
        </div>
      )}
    </div>
  );
}

function OhlcStat({ label, value }: { label: string; value?: number }) {
  return (
    <div>
      <p className="text-aveon-muted">{label}</p>
      <p className="font-medium text-aveon-text">{value !== undefined ? formatNumber(value) : "—"}</p>
    </div>
  );
}
