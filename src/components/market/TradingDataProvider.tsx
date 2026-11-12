"use client";

import { useEffect } from "react";
import { useOrderStreamStore } from "@/lib/orderStreamStore";
import { useLiveOrderStore } from "@/lib/liveOrderStore";
import { fetchShared } from "@/lib/sharedFetch";
import { orderBookPath, tradeBookPath, positionsPath } from "@/lib/endpoints";
import { extractList, type RawOrderModel, type RawTradeModel } from "@/types/trading";

/** Keeps one authenticated order/trade stream alive for the whole app session. */
export default function TradingDataProvider() {
  useEffect(() => {
    let active = true;
    let wasLive = false;
    let hasConnectedOnce = false;
    let reconciling = false;
    const stream = useOrderStreamStore.getState();

    const downloadPositions = async (reason: string) => {
      console.info(`[AveonTrade][TradingData DEBUG] Position API download started (${reason})`);
      const result = await fetchShared(positionsPath("daily", 1), reason === "reconnection");
      if (!active) return;
      console.info(`[AveonTrade][TradingData DEBUG] Position API download ${result.success ? "completed" : "failed"} (${reason})`, result.success ? { received: extractList(result.data, ["positions", "items", "records"]).length } : result.message);
    };

    const reconcileAfterConnection = async (reason: "initial connection" | "reconnection") => {
      if (reconciling) return;
      reconciling = true;
      const requestedAt = Date.now();
      console.info(`[AveonTrade][TradingData DEBUG] All-order reconciliation started (${reason})`);
      try {
        const ordersResult = await fetchShared(orderBookPath(1, 100, -1), true);
        if (!active) return;
        if (ordersResult.success) {
          const rows = extractList<RawOrderModel>(ordersResult.data, ["orders", "orderBook", "order_book", "items", "records"]);
          useLiveOrderStore.getState().reconcileAllOrders(rows, requestedAt);
          console.info("[AveonTrade][TradingData DEBUG] All-order reconciliation completed", { received: rows.length, reason });
        } else console.warn("[AveonTrade][TradingData DEBUG] All-order reconciliation failed", ordersResult.message);

        const tradesRequestedAt = Date.now();
        console.info(`[AveonTrade][TradingData DEBUG] Trade reconciliation started (${reason})`);
        const tradesResult = await fetchShared(tradeBookPath(1, 100), true);
        if (!active) return;
        if (tradesResult.success) {
          const rows = extractList<RawTradeModel>(tradesResult.data, ["trades", "tradeBook", "trade_book", "items", "records"]);
          useLiveOrderStore.getState().reconcileTrades(rows, tradesRequestedAt);
          console.info("[AveonTrade][TradingData DEBUG] Trade reconciliation completed", { received: rows.length, reason });
        } else console.warn("[AveonTrade][TradingData DEBUG] Trade reconciliation failed", tradesResult.message);

        if (reason === "reconnection") await downloadPositions("reconnection");
      } catch (error) {
        console.error("[AveonTrade][TradingData DEBUG] Reconciliation error", error);
      } finally {
        reconciling = false;
      }
    };

    // Initial login downloads positions; order and trade history are reconciled when the stream becomes live.
    void downloadPositions("login");
    const handleStreamStatus = (status: string) => {
      if (status === "live" && !wasLive) {
        void reconcileAfterConnection(hasConnectedOnce ? "reconnection" : "initial connection");
        wasLive = true;
        hasConnectedOnce = true;
      } else if (status !== "live" && wasLive) {
        wasLive = false;
        console.warn("[AveonTrade][TradingData DEBUG] WebSocket interrupted; automatic reconnection/reconciliation pending", { status });
      }
    };

    // Subscribe before acquiring. If another component already opened the SSE
    // connection, its status may already be live and no new status event follows.
    const unsubscribe = useOrderStreamStore.subscribe((state) => handleStreamStatus(state.status));
    useOrderStreamStore.getState().acquire();
    handleStreamStatus(useOrderStreamStore.getState().status);

    return () => {
      active = false;
      unsubscribe();
      useOrderStreamStore.getState().release();
    };
  }, []);

  return null;
}
