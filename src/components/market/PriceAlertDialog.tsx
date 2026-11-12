"use client";

import { useEffect, useState } from "react";
import type { Instrument } from "@/types/trading";
import type { PriceAlert } from "@/types/alerts";
import { createPriceAlert } from "@/lib/alerts";

type AlertOperator = ">" | "<" | ">=" | "<=" | "=";

interface PriceAlertDialogProps {
  open: boolean;
  instrument: Instrument | null;

  // Used by Alerts page for edit mode.
  alert?: PriceAlert | null;

  // Used by Market Watch to provide current LTP.
  currentPrice?: number;

  onClose: () => void;

  // Existing Alerts page callback.
  onCreated?: () => void;

  // Optional callback used by other entry points.
  onSuccess?: () => void;
}

const OPERATORS: Array<{
  value: AlertOperator;
  label: string;
}> = [
  { value: ">", label: "Greater than" },
  { value: "<", label: "Less than" },
  { value: ">=", label: "Greater than or equal to" },
  { value: "<=", label: "Less than or equal to" },
  { value: "=", label: "Equal to" },
];

export default function PriceAlertDialog({
  open,
  instrument,
  alert,
  currentPrice = 0,
  onClose,
  onCreated,
  onSuccess,
}: PriceAlertDialogProps) {
  const [operator, setOperator] = useState<AlertOperator>(">");
  const [price, setPrice] = useState("");
  const [goodTillTrigger, setGoodTillTrigger] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    setError("");

    if (alert) {
      const alertObj = alert as unknown as Record<string, unknown>;
      const alertOperator = String(alertObj.operator ?? ">") as AlertOperator;

      setOperator(
        OPERATORS.some((item) => item.value === alertOperator)
          ? alertOperator
          : ">"
      );

      const alertPrice = alertObj.value ?? alertObj.price ?? "";
      setPrice(String(alertPrice));

      const gtt = alertObj.goodTillTrigger ?? alertObj.good_till_trigger;
      setGoodTillTrigger(gtt === undefined ? true : Boolean(gtt));
    } else {
      setOperator(">");
      setPrice(currentPrice > 0 ? String(currentPrice) : "");
      setGoodTillTrigger(true);
    }

    setSaving(false);
  }, [open, alert]); // Removed currentPrice from dependencies so live ticks won't overwrite user input

  if (!open) {
    return null;
  }

  const symbol =
    instrument?.tradingSymbol ||
    instrument?.symbol ||
    instrument?.displayName ||
    ";";

  const handleSubmit = async () => {
    setError("");

    if (!instrument) {
      setError("Please select a valid instrument.");
      return;
    }

    const numericPrice = Number(price);

    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      setError("Please enter a valid alert price.");
      return;
    }

    try {
      setSaving(true);

      await createPriceAlert({
        instrument,
        operator,
        price: numericPrice,
        goodTillTrigger,
      });

      onCreated?.();
      onSuccess?.();

      onClose();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to create price alert.";

      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-aveon-border bg-aveon-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-aveon-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-aveon-text">
              {alert ? "Edit Price Alert" : "Create Price Alert"}
            </h2>

            {symbol && (
              <p className="mt-1 text-xs text-aveon-muted">
                {symbol}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md px-2 py-1 text-lg text-aveon-muted hover:bg-aveon-bg hover:text-aveon-text"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-aveon-muted">
              Condition
            </label>

            <select
              value={operator}
              onChange={(e) =>
                setOperator(e.target.value as AlertOperator)
              }
              disabled={saving}
              className="w-full rounded-lg border border-aveon-border bg-aveon-bg px-3 py-2.5 text-sm text-aveon-text outline-none focus:border-aveon-primary"
            >
              {OPERATORS.map((item) => (
                <option
                  key={item.value}
                  value={item.value}
                >
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-aveon-muted">
              Alert Price
            </label>

            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Enter price"
              min="0"
              step="0.01"
              disabled={saving}
              className="w-full rounded-lg border border-aveon-border bg-aveon-bg px-3 py-2.5 text-sm text-aveon-text outline-none focus:border-aveon-primary"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-aveon-text">
            <input
              type="checkbox"
              checked={goodTillTrigger}
              onChange={(e) =>
                setGoodTillTrigger(e.target.checked)
              }
              disabled={saving}
              className="h-4 w-4"
            />

            Good Till Trigger
          </label>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-aveon-border px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-aveon-border px-4 py-2 text-sm text-aveon-text hover:bg-aveon-bg"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !instrument}
            className="rounded-lg bg-aveon-primary px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? "Saving…"
              : alert
                ? "Update Alert"
                : "Create Alert"}
          </button>
        </div>
      </div>
    </div>
  );
}