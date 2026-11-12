"use client";

import { Card } from "@/components/ui/Primitives";
import { formatCurrency, formatNumber } from "@/lib/format";

export interface MoverQuote {
  trading_symbol: string;
  ltp: number;
  change_percent: number;
}

/** Same "plumb it in once you have the endpoint" pattern as MarketOverview. */
export default function GainersLosers({
  gainers,
  losers,
}: {
  gainers: MoverQuote[] | null;
  losers: MoverQuote[] | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <MoversCard title="Top Gainers" tone="buy" movers={gainers} />
      <MoversCard title="Top Losers" tone="sell" movers={losers} />
    </div>
  );
}

function MoversCard({ title, tone, movers }: { title: string; tone: "buy" | "sell"; movers: MoverQuote[] | null }) {
  const titleClass = tone === "buy" ? "text-aveon-buy" : "text-aveon-sell";
  return (
    <Card>
      <h3 className={`mb-3 text-sm font-semibold ${titleClass}`}>{title}</h3>
      {!movers ? (
        <p className="rounded-lg border border-dashed border-aveon-border p-4 text-xs text-aveon-muted">
          Needs a market-movers/scanner endpoint — not yet in{" "}
          <code className="rounded bg-aveon-panel2 px-1">src/lib/endpoints.ts</code>.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-aveon-muted">
            <tr>
              <th className="pb-2">Scrip</th>
              <th className="pb-2 text-right">LTP</th>
              <th className="pb-2 text-right">% Change</th>
            </tr>
          </thead>
          <tbody>
            {movers.map((m) => (
              <tr key={m.trading_symbol} className="border-t border-aveon-border/50">
                <td className="py-2">{m.trading_symbol}</td>
                <td className="py-2 text-right">{formatCurrency(m.ltp)}</td>
                <td className={`py-2 text-right ${titleClass}`}>
                  {m.change_percent >= 0 ? "+" : ""}
                  {formatNumber(m.change_percent)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
