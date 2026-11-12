"use client";

import type { ReactNode } from "react";
import { Button, Input, Select } from "@/components/ui/Primitives";
import { orderDisplaySymbol, type OrderModel } from "@/types/trading";

export type ModifyState = {
  order: OrderModel;
  qty: number;
  price: string;
  trigger: string;
  disclosed: number;
  validity: string;
  validityDays: number;
  orderType: string;
} | null;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="text-[11px] text-aveon-muted">
      {label}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

const inputClass =
  "w-full rounded-md border border-aveon-border bg-aveon-panel2 px-2 py-2 text-sm text-aveon-text outline-none focus:border-aveon-primary disabled:cursor-not-allowed disabled:opacity-50";

export default function OrderModifyDialog({
  state, setState, onClose, onSubmit, busy, message,
}: {
  state: NonNullable<ModifyState>;
  setState: (s: ModifyState) => void;
  onClose: () => void;
  onSubmit: () => void;
  busy: boolean;
  message: string;
}) {
  const type = String(state.orderType).trim().toUpperCase();
  const isMarket = type.includes("MKT") || type === "MARKET";
  const isStop = type === "SL" || type === "SL-MKT" || type.includes("STOP");
  const isBse = String(state.order.exchange ?? "").toUpperCase().includes("BSE");

  const invalid =
    !Number.isFinite(state.qty) || state.qty <= 0 ||
    state.disclosed < 0 || state.disclosed > state.qty ||
    (!isMarket && !(Number(state.price) > 0)) ||
    (isStop && !(Number(state.trigger) > 0)) ||
    (state.validity === "GTD" && state.validityDays < 1);

  return (
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/65 p-4">
      <div className="w-full max-w-lg rounded-xl border border-aveon-border bg-aveon-panel p-4 shadow-2xl">
        <div className="mb-3 flex justify-between">
          <div>
            <h3 className="text-sm font-semibold">Modify Order</h3>
            <p className="text-[11px] text-aveon-muted">{orderDisplaySymbol(state.order)} · {state.order.exchange}</p>
          </div>
          <button onClick={onClose} className="text-aveon-muted" aria-label="Close dialog">×</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Order Type">
            <Select
              value={state.orderType}
              onChange={(e) =>
                setState({
                  ...state,
                  orderType: e.target.value,
                  price: e.target.value.includes("MKT") ? "" : state.price,
                  trigger: e.target.value.startsWith("SL") ? state.trigger : "",
                })
              }
            >
              <option value="RL">Limit</option>
              <option value="RL-MKT">Market</option>
              <option value="SL">Stop Limit</option>
              <option value="SL-MKT">Stop Market</option>
            </Select>
          </Field>
          <Field label="Quantity">
            <Input className={inputClass} type="number" min={1} value={state.qty} onChange={(e) => setState({ ...state, qty: Number(e.target.value) })} />
          </Field>
          <Field label="Price">
            <Input className={inputClass} type="number" min={0} disabled={isMarket} value={state.price} onChange={(e) => setState({ ...state, price: e.target.value })} />
          </Field>
          <Field label="Trigger Price">
            <Input className={inputClass} type="number" min={0} disabled={!isStop} value={state.trigger} onChange={(e) => setState({ ...state, trigger: e.target.value })} />
          </Field>
          <Field label="Disclosed Qty">
            <Input className={inputClass} type="number" min={0} max={state.qty} value={state.disclosed} onChange={(e) => setState({ ...state, disclosed: Number(e.target.value) })} />
          </Field>
          <Field label="Validity">
            <Select value={state.validity} onChange={(e) => setState({ ...state, validity: e.target.value })}>
              {isBse && <option>EOS</option>}
              <option>DAY</option>
              <option>IOC</option>
              <option>GTD</option>
            </Select>
          </Field>
          {state.validity === "GTD" && (
            <Field label="Validity Days">
              <Input className={inputClass} type="number" min={1} value={state.validityDays} onChange={(e) => setState({ ...state, validityDays: Number(e.target.value) })} />
            </Field>
          )}
        </div>

        <p className="mt-2 text-[10px] text-aveon-muted">Market orders do not use a limit price. Trigger price is available for stop orders.</p>
        {message && <div className="mt-3 rounded-lg border border-aveon-border bg-aveon-panel2 p-2 text-xs text-aveon-sell">{message}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || invalid} onClick={onSubmit}>{busy ? "Submitting…" : "Modify Order"}</Button>
        </div>
      </div>
    </div>
  );
}
