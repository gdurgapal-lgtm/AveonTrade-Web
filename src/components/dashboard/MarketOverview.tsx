"use client";

import { Card } from "@/components/ui/Primitives";
import { formatNumber, pnlTone } from "@/lib/format";

export interface IndexQuote {
  name: string;
  value: number;
  change: number;
  change_percent: number;
}

/**
 * Renders index chips (Nifty 50, Sensex, Bank Nifty, ...). `indices` is
 * plumbed in as a prop rather than fetched here on purpose: your broker's
 * index-quote endpoint hasn't been confirmed yet (it isn't one of the paths
 * in src/lib/endpoints.ts). Once you have it, fetch it in
 * app/(app)/dashboard/page.tsx and pass the array down — this component
 * doesn't need to change.
 */
export default function MarketOverview({ indices }: { indices: IndexQuote[] | null }) {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Market Overview</h2>
        {indices && <span className="text-xs text-aveon-primary">View all</span>}
      </div>

      {!indices ? (
        <p className="rounded-lg border border-dashed border-aveon-border p-4 text-xs text-aveon-muted">
          Index quotes need a market-data endpoint that isn&apos;t mapped yet in{" "}
          <code className="rounded bg-aveon-panel2 px-1">src/lib/endpoints.ts</code>. Add it, fetch it in{" "}
          <code className="rounded bg-aveon-panel2 px-1">dashboard/page.tsx</code>, and pass the results here.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {indices.map((idx) => (
            <div key={idx.name} className="rounded-lg border border-aveon-border p-3">
              <p className="text-xs text-aveon-muted">{idx.name}</p>
              <p className="mt-1 text-base font-semibold">{formatNumber(idx.value)}</p>
              <p className={`text-xs ${pnlTone(idx.change) === "buy" ? "text-aveon-buy" : "text-aveon-sell"}`}>
                {idx.change >= 0 ? "+" : ""}
                {formatNumber(idx.change)} ({formatNumber(idx.change_percent)}%)
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
