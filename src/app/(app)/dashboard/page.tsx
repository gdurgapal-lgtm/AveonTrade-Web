"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { Badge, Card } from "@/components/ui/Primitives";
import DashboardHero from "@/components/dashboard/DashboardHero";
import IndexChart from "@/components/dashboard/IndexChart";
import TodaysOrders from "@/components/dashboard/TodaysOrders";
import OpenPositions from "@/components/dashboard/OpenPositions";
import NewsPanel from "@/components/dashboard/NewsPanel";
import { usePolledData } from "@/hooks/usePolledData";
import { useAuthStore } from "@/lib/authStore";
import { formatCurrency, pnlTone } from "@/lib/format";
import { positionsPath, Endpoints } from "@/lib/endpoints";
import { normalizeHolding, type FundsSummary, type PositionModel, type RawHoldingModel } from "@/types/trading";
import { indexHistoryExchange, useIndexMarketData } from "@/hooks/useIndexMarketData";

export default function DashboardPage() {
  const { userId, refresh } = useAuthStore();
  useEffect(() => {
    refresh();
  }, [refresh]);

  const funds = usePolledData<FundsSummary>("/funds-summary", 30_000);
  const positions = usePolledData<PositionModel[]>(positionsPath("daily"), 5_000);
  const rawHoldings = usePolledData<RawHoldingModel[]>(Endpoints.holdings.list, 30_000);
  const holdings = useMemo(() => (rawHoldings.data ?? []).map(normalizeHolding), [rawHoldings.data]);
  const { selectedIndices, quotesByToken, loading: indicesLoading } = useIndexMarketData();

  const holdingsPnl = holdings.reduce((sum, h) => sum + (h.pnl ?? 0), 0);
  const holdingsValue = holdings.reduce((sum, h) => sum + (h.current_value ?? 0), 0);
  const positionsValue = (positions.data ?? []).reduce((sum, p) => sum + Math.abs(p.net_value ?? 0), 0);

  return (
    <div className="flex min-h-[calc(100vh-110px)] flex-col space-y-3 overflow-y-auto p-1 pb-6">
      <DashboardHero
        userName={userId ?? "Trader"}
        portfolioValue={holdingsValue + positionsValue}
        unrealizedPnl={holdingsPnl}
        availableBalance={funds.data?.available_margin ?? 0}
        usedMargin={funds.data?.used_margin ?? 0}
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {selectedIndices.slice(0, 2).map((index) => {
          const historyExchange = indexHistoryExchange(index);
          return (
            <IndexChart
              key={index.key}
              name={index.sIndexDesc || index.sIndex}
              symbol={index.sIndex}
              exchange={historyExchange ?? ""}
              historyEnabled={Boolean(historyExchange)}
              liveQuote={index.feedKey ? quotesByToken[index.feedKey] : undefined}
            />
          );
        })}
        {selectedIndices.length === 0 && (
          <Card>
            <p className="text-xs text-aveon-muted">
              {indicesLoading ? "Loading indices…" : "Add indices from the Topbar to display them here."}
            </p>
          </Card>
        )}
        <NewsPanel />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <OpenPositions data={positions.data} loading={positions.loading} error={positions.error} reload={positions.reload} />
        <TodaysOrders />
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Holdings</h2>
          <Link href="/holdings" className="text-xs text-aveon-primary">
            View all
          </Link>
        </div>
        {rawHoldings.loading ? (
          <p className="text-xs text-aveon-muted">Loading…</p>
        ) : holdings.length === 0 ? (
          <p className="text-xs text-aveon-muted">No holdings.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {holdings.slice(0, 10).map((h, i) => (
              <div key={i} className="rounded-lg border border-aveon-border p-3">
                <p className="truncate text-xs text-aveon-muted">{h.trading_symbol}</p>
                <Badge tone={pnlTone(h.pnl)}>{formatCurrency(h.pnl)}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
