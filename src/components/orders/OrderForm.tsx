"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Select } from "@/components/ui/Primitives";
import { apiClient } from "@/lib/apiClient";
import { Endpoints } from "@/lib/endpoints";
import type {
  OrderType,
  ProductType,
  RegularOrderRequest,
  TransactionType,
  Validity,
} from "@/types/trading";

const initial: RegularOrderRequest = {
  exchange: "NSE",
  trading_symbol: "",
  transaction_type: "BUY",
  product_type: "CNC",
  order_type: "MARKET",
  quantity: 1,
  price: undefined,
  trigger_price: undefined,
  validity: "DAY",
  disclosed_quantity: 0,
  is_amo: false,
};

/**
 * Ports the regular order entry sheet from
 * lib/features/orders/models/regular_order_request.dart +
 * order_service.dart -> POST /transactional/v1/orders/regular.
 */
export default function OrderForm() {
  const router = useRouter();
  const [form, setForm] = useState<RegularOrderRequest>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  function update<K extends keyof RegularOrderRequest>(key: K, value: RegularOrderRequest[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const res = await apiClient.post(Endpoints.orders.regular, form);
      setResult({ success: res.success, message: res.message || (res.success ? "Order placed." : "Order failed.") });
      if (res.success) {
        setTimeout(() => router.push("/orders"), 900);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const needsPrice = form.order_type === "LIMIT" || form.order_type === "SL";
  const needsTrigger = form.order_type === "SL" || form.order_type === "SL-M";

  return (
    <Card className="max-w-xl">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Exchange">
            <Select value={form.exchange} onChange={(e) => update("exchange", e.target.value)}>
              <option value="NSE">NSE</option>
              <option value="BSE">BSE</option>
              <option value="NFO">NFO</option>
              <option value="MCX">MCX</option>
            </Select>
          </Field>
          <Field label="Trading Symbol">
            <Input
              value={form.trading_symbol}
              onChange={(e) => update("trading_symbol", e.target.value.toUpperCase())}
              placeholder="RELIANCE-EQ"
              required
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex overflow-hidden rounded-lg border border-aveon-border">
            {(["BUY", "SELL"] as TransactionType[]).map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => update("transaction_type", t)}
                className={`flex-1 py-2 text-sm font-medium ${
                  form.transaction_type === t
                    ? t === "BUY"
                      ? "bg-aveon-buy text-white"
                      : "bg-aveon-sell text-white"
                    : "bg-transparent text-aveon-text"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <Field label="Product">
            <Select value={form.product_type} onChange={(e) => update("product_type", e.target.value as ProductType)}>
              <option value="CNC">CNC</option>
              <option value="MIS">MIS</option>
              <option value="NRML">NRML</option>
              <option value="CO">CO</option>
              <option value="BO">BO</option>
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Order Type">
            <Select value={form.order_type} onChange={(e) => update("order_type", e.target.value as OrderType)}>
              <option value="MARKET">Market</option>
              <option value="LIMIT">Limit</option>
              <option value="SL">SL</option>
              <option value="SL-M">SL-M</option>
            </Select>
          </Field>
          <Field label="Validity">
            <Select value={form.validity} onChange={(e) => update("validity", e.target.value as Validity)}>
              <option value="DAY">Day</option>
              <option value="IOC">IOC</option>
              <option value="GTD">GTD</option>
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Quantity">
            <Input
              type="number"
              min={1}
              value={form.quantity}
              onChange={(e) => update("quantity", Number(e.target.value))}
              required
            />
          </Field>
          {needsPrice && (
            <Field label="Price">
              <Input
                type="number"
                step="0.05"
                value={form.price ?? ""}
                onChange={(e) => update("price", Number(e.target.value))}
              />
            </Field>
          )}
          {needsTrigger && (
            <Field label="Trigger Price">
              <Input
                type="number"
                step="0.05"
                value={form.trigger_price ?? ""}
                onChange={(e) => update("trigger_price", Number(e.target.value))}
              />
            </Field>
          )}
        </div>

        {result && (
          <p className={`text-sm ${result.success ? "text-aveon-buy" : "text-aveon-sell"}`}>{result.message}</p>
        )}

        <Button
          type="submit"
          variant={form.transaction_type === "BUY" ? "buy" : "sell"}
          className="w-full"
          disabled={submitting}
        >
          {submitting ? "Placing…" : `${form.transaction_type} ${form.trading_symbol || ""}`}
        </Button>
      </form>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-aveon-muted">{label}</label>
      {children}
    </div>
  );
}
