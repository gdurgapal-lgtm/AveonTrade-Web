"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/Primitives";
import { displayProductType, positionDisplaySymbol, type PositionModel } from "@/types/trading";

export type PositionAction = "close" | "increase";

export function positionActionSide(action: PositionAction, p: PositionModel): "BUY" | "SELL" {
  const long = p.net_quantity >= 0;
  if (action === "close") return long ? "SELL" : "BUY";
  return long ? "BUY" : "SELL";
}

const field =
  "mt-1 w-full rounded-lg border border-aveon-border bg-aveon-panel2 px-3 py-2 text-sm text-aveon-text outline-none focus:border-aveon-primary";

export default function PositionActionDialog({
  action, position, qty, setQty, orderType, setOrderType, price, setPrice, busy, message, onClose, onSubmit,
}: {
  action: PositionAction;
  position: PositionModel;
  qty: number;
  setQty: (n: number) => void;
  orderType: string;
  setOrderType: (s: string) => void;
  price: string;
  setPrice: (s: string) => void;
  busy: boolean;
  message: string;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const side = positionActionSide(action, position);
  const title = action === "close" ? "Close Position" : "Add to Position";

  return (
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/65 p-4">
      <div className="w-full max-w-sm rounded-xl border border-aveon-border bg-aveon-panel p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-aveon-text">{title}</h3>
            <p className="text-[11px] text-aveon-muted">
              {positionDisplaySymbol(position)} · {displayProductType(position.product_type, position.preferred_exchange || position.exchange, position.instrument)}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-aveon-muted hover:bg-aveon-panel2" aria-label="Close dialog"><X size={16} /></button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-aveon-muted">Quantity
              <input
                className={field}
                type="number"
                min={1}
                max={action === "close" ? Math.abs(position.net_quantity) : undefined}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
              />
            </label>
            <div className="rounded-lg border border-aveon-border bg-aveon-panel2 p-2 text-[11px]">
              <span className="text-aveon-muted">Direction</span>
              <p className={`mt-1 font-semibold ${side === "BUY" ? "text-aveon-buy" : "text-aveon-sell"}`}>{side}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-aveon-muted">Order Type
              <select value={orderType} onChange={(e) => setOrderType(e.target.value)} className={field}>
                <option value="RL-MKT">Market</option>
                <option value="RL">Limit</option>
              </select>
            </label>
            {orderType === "RL" ? (
              <label className="text-[11px] text-aveon-muted">Price
                <input className={field} type="number" min={0} step={0.05} placeholder="Limit price" value={price} onChange={(e) => setPrice(e.target.value)} />
              </label>
            ) : (
              <div className="rounded-lg border border-aveon-border bg-aveon-panel2 p-2 text-[11px]">
                <span className="text-aveon-muted">Execution</span>
                <p className="mt-1 font-semibold">At Market</p>
              </div>
            )}
          </div>
        </div>

        {message && <div className="mt-3 rounded-lg border border-aveon-border bg-aveon-panel2 p-2 text-xs text-aveon-text">{message}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant={side === "SELL" ? "sell" : "buy"}
            disabled={busy || qty <= 0 || (orderType === "RL" && !(Number(price) > 0))}
            onClick={onSubmit}
          >
            {busy ? "Processing…" : action === "close" ? `Close (${side})` : `Add (${side})`}
          </Button>
        </div>
      </div>
    </div>
  );
}
