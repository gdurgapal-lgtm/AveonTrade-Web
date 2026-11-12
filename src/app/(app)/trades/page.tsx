"use client";

import { useMemo } from "react";
import { Badge, Card, EmptyState } from "@/components/ui/Primitives";
import { LIVE_TRADES, usePolledData } from "@/hooks/usePolledData";
import { tradeBookPath } from "@/lib/endpoints";
import { useLiveOrderStore } from "@/lib/liveOrderStore";
import { formatCurrency } from "@/lib/format";
import { extractList, mergeTradeRows, normalizeTrade, orderDisplaySymbol, type RawTradeModel, type TradeModel } from "@/types/trading";

export default function TradesPage() {
  const trades = usePolledData<RawTradeModel[]>(tradeBookPath(1, 100), 10_000, true, LIVE_TRADES);
  const liveTrades = useLiveOrderStore((state) => state.trades);
  const rows = useMemo<TradeModel[]>(() => {
    const restRows = extractList<RawTradeModel>(trades.data, ["trades", "tradeBook", "trade_book", "items", "records"]).map(normalizeTrade);
    // Keep the downloaded trade history and overlay socket updates by trade ID.
    // mergeTradeRows fills gaps from both sources instead of overwriting them.
    return mergeTradeRows(restRows, liveTrades);
  }, [trades.data, liveTrades]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Trade Book</h1>
      <Card className="overflow-x-auto p-0">
        {trades.loading ? (
          <p className="p-6 text-xs text-aveon-muted">Loading trades…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="No trades today" />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-aveon-border text-left text-xs text-aveon-muted">
              <tr>
                <th className="px-4 py-3">Symbol</th>
                <th className="px-4 py-3">Side</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3">Trade ID</th>
                <th className="px-4 py-3">Order ID</th>
                <th className="px-4 py-3">Internal Order ID</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.trade_id} className="table-row-hover border-b border-aveon-border/50">
                  <td className="px-4 py-3">{orderDisplaySymbol(t)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={t.transaction_type === "BUY" ? "buy" : "sell"}>{t.transaction_type}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">{t.quantity}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(t.price)}</td>
                  <td className="px-4 py-3 text-xs text-aveon-muted">{t.trade_id}</td>
                  <td className="px-4 py-3 font-mono text-xs">{t.exchange_order_no || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{t.internal_order_id || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
