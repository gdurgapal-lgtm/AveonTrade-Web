"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2 } from "lucide-react";
import OrderTicket from "./OrderTicket";
import type { Instrument, OrderKind, ProductType, TransactionType, WatchlistQuote } from "@/types/trading";

function OrderTicketPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

export type OrderTicketModalProps = {
  open: boolean;
  instrument: Instrument | null;
  onClose: () => void;
  cashOptions?: Instrument[];
  quotes?: Record<string, WatchlistQuote>;
  initialSide?: TransactionType;
  initialProductType?: ProductType;
  initialQuantity?: number;
  initialPrice?: number;
  initialOrderKind?: OrderKind;
  onOrderPlaced?: (omsId: string | null) => void;
  onSuccessClose?: () => void;
};

function OrderTicketModal({
  open,
  instrument,
  onClose,
  cashOptions = [],
  quotes = {},
  initialSide = "BUY",
  initialProductType,
  initialQuantity,
  initialPrice,
  initialOrderKind,
  onOrderPlaced,
  onSuccessClose,
}: OrderTicketModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [ticketInstrument, setTicketInstrument] = useState<Instrument | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [omsId, setOmsId] = useState<string | null>(null);
  const doneButtonRef = useRef<HTMLButtonElement>(null);
  const onSuccessCloseRef = useRef(onSuccessClose);
  onSuccessCloseRef.current = onSuccessClose;

  const closeSuccess = useCallback(() => {
    setSuccessOpen(false);
    onSuccessCloseRef.current?.();
  }, []);

  useEffect(() => {
    if (!open) {
      previousFocusRef.current?.focus?.();
      return;
    }
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFirst = () => {
      const root = dialogRef.current;
      if (!root) return;
      const first = root.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex="0"]');
      first?.focus();
    };
    const timer = window.setTimeout(focusFirst, 0);
    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter((el) => el.offsetParent !== null);
      if (!items.length) { event.preventDefault(); root.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleTab, true);
    return () => { window.clearTimeout(timer); document.removeEventListener("keydown", handleTab, true); };
  }, [open]);

  useEffect(() => {
    if (open) {
      setTicketInstrument(instrument);
      setSuccessOpen(false);
      setOmsId(null);
    }
  }, [open, instrument, initialPrice, initialSide, initialOrderKind]);

  useEffect(() => {
    if (!successOpen) return;
    const openedAt = Date.now();
    doneButtonRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== "Escape") return;
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat || Date.now() - openedAt < 300) return;
      closeSuccess();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [successOpen, closeSuccess]);

  if (!open && !successOpen) return null;

  const handleOrderPlaced = (id: string | null) => {
    setOmsId(id);
    onOrderPlaced?.(id);
    onClose();
    setSuccessOpen(true);
  };

  return (
    <OrderTicketPortal>
      <>
        {open && (
          <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/65 p-4" onClick={onClose}>
            <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Order entry" className="flex max-h-[94vh] w-full max-w-[540px] flex-col overflow-hidden rounded-xl border border-aveon-border bg-aveon-panel shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <OrderTicket
                instrument={ticketInstrument}
                onOrderPlaced={handleOrderPlaced}
                initialSide={initialSide}
                initialProductType={initialProductType}
                initialQuantity={initialQuantity}
                initialPrice={initialPrice}
                initialOrderKind={initialOrderKind}
                cashOptions={cashOptions}
                quotes={quotes}
                onCashInstrumentChange={setTicketInstrument}
                onClose={onClose}
              />
            </div>
          </div>
        )}

        {successOpen && (
          <div className="fixed inset-0 z-[2147483648] flex items-center justify-center bg-black/65 p-4">
            <div role="dialog" aria-modal="true" aria-label="Order placed successfully" className="w-full max-w-md rounded-xl border border-aveon-border bg-aveon-panel text-center shadow-2xl">
              <div className="p-6">
                <CheckCircle2 size={46} className="mx-auto mb-3 text-aveon-buy" />
                <p className="text-lg font-semibold text-aveon-text">Order placed successfully</p>
                <p className="mt-1 text-xs text-aveon-muted">{(ticketInstrument ?? instrument) ? instrumentDisplayNameFallback((ticketInstrument ?? instrument) as Instrument) : "Order"}</p>
                {omsId ? (
                  <div className="mt-4 rounded-lg border border-aveon-border bg-aveon-panel2 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-aveon-muted">OMS Order ID</p>
                    <p className="mt-1 break-all text-lg font-bold text-aveon-text">{omsId}</p>
                  </div>
                ) : (
                  <p className="mt-4 rounded-lg border border-aveon-border bg-aveon-panel2 p-3 text-xs text-aveon-muted">Order accepted. OMS ID was not included in the returned response.</p>
                )}
              </div>
              <div className="border-t border-aveon-border p-4">
                <button ref={doneButtonRef} type="button" className="w-full rounded-lg bg-aveon-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-600" onClick={closeSuccess}>Done</button>
                <p className="mt-2 text-center text-[11px] text-aveon-muted">Press Enter or Esc to close</p>
              </div>
            </div>
          </div>
        )}
      </>
    </OrderTicketPortal>
  );
}

function instrumentDisplayNameFallback(instrument: Instrument): string {
  const name = instrument.tradingSymbol || instrument.symbol || "Order";
  const segment = (instrument.exchangeSegment ?? instrument.exchange ?? "").toUpperCase();
  const isCash = segment.includes("NSE_EQ") || segment.includes("BSE_EQ") ||
    segment === "NSE" || segment === "BSE";
  if (!isCash) return name;
  return `${name} - ${segment.includes("BSE") ? "BSE" : "NSE"}`;
}

export default memo(OrderTicketModal, (previous, next) => {
  if (previous.open && next.open) {
    return previous.instrument === next.instrument && previous.onClose === next.onClose && previous.cashOptions === next.cashOptions && previous.quotes === next.quotes && previous.initialSide === next.initialSide && previous.initialProductType === next.initialProductType && previous.initialQuantity === next.initialQuantity && previous.initialPrice === next.initialPrice && previous.initialOrderKind === next.initialOrderKind && previous.onOrderPlaced === next.onOrderPlaced && previous.onSuccessClose === next.onSuccessClose;
  }
  return previous.open === next.open && previous.instrument === next.instrument && previous.onClose === next.onClose && previous.cashOptions === next.cashOptions && previous.quotes === next.quotes && previous.initialSide === next.initialSide && previous.initialProductType === next.initialProductType && previous.initialQuantity === next.initialQuantity && previous.initialPrice === next.initialPrice && previous.initialOrderKind === next.initialOrderKind && previous.onOrderPlaced === next.onOrderPlaced && previous.onSuccessClose === next.onSuccessClose;
});