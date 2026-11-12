"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Card } from "@/components/ui/Primitives";
import OrderModifyDialog, { type ModifyState } from "@/components/dashboard/OrderModifyDialog";
import { LIVE_ORDERS, usePolledData } from "@/hooks/usePolledData";
import { apiClient } from "@/lib/apiClient";
import { orderBookPath, orderCancelPath, orderModifyPath } from "@/lib/endpoints";
import { formatCurrency } from "@/lib/format";
import {
  normalizeOrder, orderDisplaySymbol, orderStatusTone, isOpenOrder, validityFromApi, validityToApi,
  type OrderModel, type RawOrderModel,
} from "@/types/trading";

type Notice = { tone: "ok" | "error"; text: string } | null;

// Same helpers the Orders page uses.
function orderFamily(o: OrderModel): "regular" | "cover" | "bracket" {
  const p = String(o.product_type).toUpperCase();
  return p === "COVER" ? "cover" : p === "BRACKET" ? "bracket" : "regular";
}
function isCancellable(o: OrderModel) {
  const s = String(o.status).toUpperCase();
  const pending = o.pending_quantity ?? Math.max(0, o.quantity - (o.filled_quantity ?? 0));
  return pending > 0 && !/COMPLETE|EXECUT|FILLED|CANCEL|REJECT|ERROR/.test(s);
}

export default function TodaysOrders() {
  const raw = usePolledData<RawOrderModel[]>(orderBookPath(), 10_000, true, LIVE_ORDERS);
  const orders = useMemo(() => (raw.data ?? []).map(normalizeOrder).filter(isOpenOrder), [raw.data]);

  const [modify, setModify] = useState<ModifyState>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dialogMessage, setDialogMessage] = useState("");
  const [notice, setNotice] = useState<Notice>(null);

  function flash(next: NonNullable<Notice>) {
    setNotice(next);
    setTimeout(() => setNotice(null), 6000);
  }

  async function cancel(order: OrderModel) {
    if (!order.order_id || !order.exchange) return;
    setBusyId(order.order_id);
    const res = await apiClient.delete(
      orderCancelPath(orderFamily(order), order.exchange, order.order_id, String(order.validity || "DAY"), order.validity_days ?? 0),
      {}
    );
    setBusyId(null);
    if (res.success) flash({ tone: "ok", text: "Cancellation request sent to OMS." });
    else flash({ tone: "error", text: res.message || "Unable to cancel order." });
    raw.reload();
  }

  function startModify(o: OrderModel) {
    setDialogMessage("");
    setModify({
      order: o,
      qty: Math.max(1, o.quantity),
      price: o.price ? String(o.price) : "",
      trigger: o.trigger_price ? String(o.trigger_price) : "",
      disclosed: o.disclosed_quantity ?? 0,
      validity: validityFromApi(String(o.validity || "DAY")),
      validityDays: o.validity_days ?? 0,
      orderType: String(o.order_type || "RL-MKT"),
    });
  }

  async function submitModify() {
    if (!modify) return;
    const { order, qty, price, trigger, disclosed, validity, validityDays, orderType } = modify;
    if (!order.exchange || !order.order_id || qty <= 0) return;
    setBusy(true);
    setDialogMessage("");
    const family = orderFamily(order);
    let body: Record<string, any>;
    if (family === "cover") {
      body = {
        main_leg: { order_type: orderType, quantity: qty, traded_quantity: order.filled_quantity ?? 0, price: Number(price) || 0 },
        stoploss_leg: { legs: [{ quantity: 0, price: Number(order.raw?.stoploss_price ?? order.trigger_price ?? 0), trigger_price: Number(trigger) || 0 }] },
      };
    } else if (family === "bracket") {
      body = {
        main_leg: { order_type: orderType, quantity: qty, price: Number(price) || 0, trigger_price: 0, traded_quantity: order.filled_quantity ?? 0 },
        stoploss_leg: {
          legs: [{ quantity: 0, price: Number(order.raw?.stoploss_price ?? order.trigger_price ?? 0), trigger_price: Number(trigger) || 0 }],
          trail: { ltp_jump_price: Number(order.raw?.ltp_jump_price ?? 0), stoploss_jump_price: Number(order.raw?.stoploss_jump_price ?? 0) },
        },
        profit_leg: { legs: [{ quantity: 0, price: Number(order.raw?.target_price ?? 0) }] },
        order_identifier: order.order_identifier ?? "",
        fields_modified: { main_leg_price: true, main_leg_qty: true, stoploss_leg_price: true, stoploss_trail_price: true, profit_leg_price: true },
      };
    } else {
      body = {
        order_type: orderType,
        quantity: qty,
        traded_quantity: order.filled_quantity ?? 0,
        price: Number(price) || 0,
        trigger_price: Number(trigger) || 0,
        disclosed_quantity: disclosed,
        validity: validityToApi(validity, order.exchange),
        validity_days: validityDays,
      };
      if (validity.toUpperCase() === "GTD" && order.order_timestamp) body.order_time = order.order_timestamp;
    }
    const res = await apiClient.put(orderModifyPath(family, order.exchange, order.order_id), body);
    setBusy(false);
    if (res.success) {
      setModify(null);
      flash({ tone: "ok", text: "Order modification request sent to OMS." });
      raw.reload();
    } else {
      setDialogMessage(res.message || "Unable to modify order.");
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Today&apos;s Orders</h2>
        <Link href="/orders" className="text-xs text-aveon-primary">View all</Link>
      </div>

      {notice && (
        <div className={`mb-3 rounded-lg border px-3 py-2 text-xs ${notice.tone === "ok" ? "border-aveon-buy/40 text-aveon-buy" : "border-aveon-sell/40 text-aveon-sell"}`}>
          {notice.text}
        </div>
      )}

      {raw.loading ? (
        <p className="text-xs text-aveon-muted">Loading…</p>
      ) : orders.length === 0 ? (
        <p className="text-xs text-aveon-muted">No pending orders.</p>
      ) : (
        <div className="overflow-x-auto">
          <ul className="min-w-[520px] space-y-2">
            {orders.slice(0, 6).map((o, i) => (
              <li key={o.order_id || i} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <Badge tone={o.transaction_type === "BUY" ? "buy" : "sell"}>{o.transaction_type}</Badge>
                  <span className="truncate">{orderDisplaySymbol(o) || "—"}</span>
                  <span className="shrink-0 text-xs text-aveon-muted">{o.filled_quantity ?? 0}/{o.quantity}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-aveon-muted">{formatCurrency(o.price)}</span>
                  <Badge tone={orderStatusTone(o.status)}>{o.status}</Badge>
                  {isCancellable(o) ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => startModify(o)}
                        disabled={busyId === o.order_id}
                        title="Modify order"
                        className="rounded border border-aveon-border px-2 py-0.5 text-xs text-aveon-text hover:bg-aveon-panel2 disabled:opacity-50"
                      >
                        Modify
                      </button>
                      <button
                        onClick={() => cancel(o)}
                        disabled={busyId === o.order_id}
                        title="Cancel order"
                        className="rounded border border-aveon-border px-2 py-0.5 text-xs text-aveon-sell hover:bg-aveon-panel2 disabled:opacity-50"
                      >
                        {busyId === o.order_id ? "…" : "Cancel"}
                      </button>
                    </div>
                  ) : (
                    <span className="w-[102px]" />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {modify && (
        <OrderModifyDialog
          state={modify}
          setState={setModify}
          onClose={() => setModify(null)}
          onSubmit={submitModify}
          busy={busy}
          message={dialogMessage}
        />
      )}
    </Card>
  );
}
