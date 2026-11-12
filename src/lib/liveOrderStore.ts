"use client";

import { create } from "zustand";
import { normalizeOrder, isOpenOrder, normalizeTrade, type OrderModel, type TradeModel, type RawOrderModel, type RawTradeModel } from "@/types/trading";

interface LiveOrderState {
  orders: OrderModel[];
  allOrders: OrderModel[];
  allOrdersInitialized: boolean;
  trades: TradeModel[];
  initialized: boolean;
  setOrders: (orders: OrderModel[]) => void;
  setTrades: (trades: TradeModel[]) => void;
  upsertOrder: (raw: RawOrderModel) => void;
  addTrade: (raw: RawTradeModel) => void;
  reconcileOrders: (rawOrders: RawOrderModel[], requestedAt: number) => void;
  reconcileAllOrders: (rawOrders: RawOrderModel[], requestedAt: number) => void;
  reconcileTrades: (rawTrades: RawTradeModel[], requestedAt: number) => void;
  reset: () => void;
}

const orderEventAt = new Map<string, number>();
const tradeEventAt = new Map<string, number>();

export const useLiveOrderStore = create<LiveOrderState>((set) => ({
  orders: [],
  allOrders: [],
  allOrdersInitialized: false,
  trades: [],
  initialized: false,
  
  setOrders: (newOrders) => set((state) => {
    const normalized = newOrders.map(normalizeOrder);
    
    // Explicitly keep only orders that are verified open AND have valid pending quantities
    const activeOrders = normalized.filter((o) => {
      const isOpen = isOpenOrder(o);
      const pendingQty = o.pending_quantity ?? Math.max(0, o.quantity - (o.filled_quantity ?? 0));
      return isOpen && pendingQty > 0;
    });

    // Deduplicate by order_id
    const uniqueOrders = Array.from(
      new Map(activeOrders.map((o) => [o.order_id, o])).values()
    );

    return { orders: uniqueOrders, initialized: true };
  }),

  setTrades: (trades) => set({ trades }),

  upsertOrder: (raw) => set((state) => {
    const updated = normalizeOrder(raw);
    if (!updated.order_id && !updated.order_identifier) return state;
    const eventAt = Date.now();
    if (updated.order_id) orderEventAt.set(updated.order_id, eventAt);
    if (updated.order_identifier) orderEventAt.set(updated.order_identifier, eventAt);

    // Some ODIN lifecycle packets first carry OrderNumber=0 and later carry
    // the OMS number. UniqueCode remains stable, so match by either reference
    // and replace the earlier provisional row rather than leaving it Pending.
    const matches = (order: OrderModel) =>
      (!!updated.order_id && order.order_id === updated.order_id) ||
      (!!updated.order_identifier && order.order_identifier === updated.order_identifier);
    const allIndex = state.allOrders.findIndex(matches);
    const mergedOrder = allIndex >= 0
      ? { ...state.allOrders[allIndex], ...updated }
      : updated;
    const allOrders = allIndex >= 0
      ? [mergedOrder, ...state.allOrders.filter((o, i) => i !== allIndex && !matches(o))]
      : [mergedOrder, ...state.allOrders.filter((o) => !matches(o))];

    const isOpen = isOpenOrder(mergedOrder);
    const orders = isOpen
      ? [mergedOrder, ...state.orders.filter((o) => !matches(o))]
      : state.orders.filter((o) => !matches(o));

    return { orders, allOrders, allOrdersInitialized: state.allOrdersInitialized };
  }),

  addTrade: (raw) => set((state) => {
    const updated = normalizeTrade(raw);
    if (!updated.trade_id) return state;
    const eventAt = Date.now();
    const key = updated.trade_id;
    tradeEventAt.set(key, eventAt);
    const index = state.trades.findIndex((trade) => trade.trade_id === updated.trade_id);
    if (index < 0) return { trades: [updated, ...state.trades] };
    const existing = state.trades[index];
    const merged = { ...existing, ...updated, raw: { ...(existing.raw ?? {}), ...(updated.raw ?? {}) } };
    return { trades: state.trades.map((trade, i) => i === index ? merged : trade) };
  }),

  reconcileOrders: (rawOrders, requestedAt) => set((state) => {
    const snapshot = rawOrders.map(normalizeOrder).filter((order) => isOpenOrder(order));
    const snapshotById = new Map(snapshot.filter((o) => o.order_id).map((o) => [o.order_id, o]));
    // A WebSocket event received after this REST request began always wins,
    // including terminal events that removed an order from the active list.
    for (const [id, eventAt] of orderEventAt) {
      if (eventAt > requestedAt) snapshotById.delete(id);
    }
    const merged = new Map(snapshotById);
    for (const current of state.orders) {
      if (orderEventAt.get(current.order_id) && (orderEventAt.get(current.order_id) as number) > requestedAt) {
        merged.set(current.order_id, current);
      }
    }
    return { orders: Array.from(merged.values()), initialized: true };
  }),

  reconcileAllOrders: (rawOrders, requestedAt) => set((state) => {
    const snapshot = rawOrders.map(normalizeOrder).filter((order) => order.order_id);
    const snapshotById = new Map(snapshot.map((order) => [order.order_id, order]));

    // A WebSocket event received after the REST request began wins over the snapshot.
    for (const [id, eventAt] of orderEventAt) {
      if (eventAt > requestedAt) snapshotById.delete(id);
    }

    const merged = new Map(snapshotById);
    for (const current of state.allOrders) {
      const eventAt = orderEventAt.get(current.order_id) ?? 0;
      if (eventAt > requestedAt) merged.set(current.order_id, current);
    }

    const allOrders = Array.from(merged.values());
    const orders = allOrders.filter((order) => {
      const pendingQty = order.pending_quantity ?? Math.max(0, order.quantity - (order.filled_quantity ?? 0));
      return isOpenOrder(order) && pendingQty > 0;
    });
    return { allOrders, allOrdersInitialized: true, orders, initialized: true };
  }),

  reconcileTrades: (rawTrades, requestedAt) => set((state) => {
    const keyOf = (trade: TradeModel) => String(trade.trade_id ?? "");
    const merged = new Map<string, TradeModel>();
    for (const raw of rawTrades) {
      const trade = normalizeTrade(raw);
      if (!trade.trade_id) continue;
      const key = keyOf(trade);
      const eventAt = tradeEventAt.get(key) ?? 0;
      // A socket update received after this REST request began must win.
      if (eventAt > requestedAt) continue;
      merged.set(key, trade);
    }
    for (const current of state.trades) {
      const key = keyOf(current);
      const eventAt = tradeEventAt.get(key) ?? 0;
      if (!merged.has(key) || eventAt > requestedAt) merged.set(key, current);
    }
    return { trades: Array.from(merged.values()) };
  }),

  reset: () => {
    orderEventAt.clear();
    set({ orders: [], allOrders: [], allOrdersInitialized: false, trades: [], initialized: false });
  },
}));