"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import OrderTicketModal from "@/components/market/OrderTicketModal";
import type { Instrument, OrderKind, ProductType, TransactionType, WatchlistQuote } from "@/types/trading";

type SharedOrderRequest = {
  instrument: Instrument;
  cashOptions?: Instrument[];
  quotes?: Record<string, WatchlistQuote>;
  side?: TransactionType;
  productType?: ProductType;
  quantity?: number;
  price?: number;
  orderKind?: OrderKind;
  onOrderPlaced?: (omsId: string | null) => void;
};

type SharedOrderEntryApi = { openOrder: (request: SharedOrderRequest) => void };
const SharedOrderEntryContext = createContext<SharedOrderEntryApi | null>(null);

/** One application-level Normal OE instance shared by panels that opt into this controller. */
export function SharedOrderEntryProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<SharedOrderRequest | null>(null);
  const openOrder = useCallback((next: SharedOrderRequest) => setRequest(next), []);
  const api = useMemo(() => ({ openOrder }), [openOrder]);
  const close = useCallback(() => setRequest(null), []);

  return (
    <SharedOrderEntryContext.Provider value={api}>
      {children}
      <OrderTicketModal
        open={!!request}
        instrument={request?.instrument ?? null}
        cashOptions={request?.cashOptions}
        quotes={request?.quotes}
        initialSide={request?.side ?? "BUY"}
        initialProductType={request?.productType}
        initialQuantity={request?.quantity}
        initialPrice={request?.price}
        initialOrderKind={request?.orderKind}
        onClose={close}
        onOrderPlaced={(omsId) => { request?.onOrderPlaced?.(omsId); }}
      />
    </SharedOrderEntryContext.Provider>
  );
}

export function useSharedOrderEntry(): SharedOrderEntryApi {
  const value = useContext(SharedOrderEntryContext);
  if (!value) throw new Error("useSharedOrderEntry must be used inside SharedOrderEntryProvider");
  return value;
}
