"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Loader2, Minus, Plus, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/Primitives";
import { apiClient } from "@/lib/apiClient";
import { Endpoints } from "@/lib/endpoints";
import { getOeDefaultsFor } from "@/lib/oeDefaults";
import { getDynamicProductTypes } from "@/lib/dynamicProductTypes";
import {
  buildOrderPayload,
  displayProductType,
  exchangeSegmentFor,
  instrumentDisplayName,
  orderKindRequiresLimitPrice,
  orderKindRequiresTriggerPrice,
  type Instrument,
  type OrderKind,
  type ProductType,
  type TransactionType,
  type Validity,
  type WatchlistQuote,
} from "@/types/trading";

function orderInstrumentDisplayName(instrument: Instrument): string {
  const name = instrumentDisplayName(instrument);
  const segment = (instrument.exchangeSegment ?? instrument.exchange ?? "").toUpperCase();
  const isCash = segment.includes("NSE_EQ") || segment.includes("BSE_EQ") ||
    segment === "NSE" || segment === "BSE";

  if (!isCash) return name;

  const exchange = segment.includes("BSE") ? "BSE" : "NSE";
  return `${name} - ${exchange}`;
}

function productDisplayName(productType: ProductType, segmentLike?: string): string {
  const label = displayProductType(productType, segmentLike);
  if (label === "Carry Forward") return "Carry Forward";
  if (label === "Cover") return "Cover Order";
  if (label === "Bracket") return "Bracket Order";
  return label;
}

function findOmsId(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findOmsId(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    const keys = [
      "oms_order_id", "omsOrderId", "oms_id", "omsId",
      "order_id", "orderId", "order_no", "orderNo", "nOmsOrderId",
    ];
    for (const key of keys) {
      const candidate = object[key];
      if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
        return String(candidate);
      }
    }
    for (const key of ["data", "result", "order", "response", "orders"]) {
      const found = findOmsId(object[key]);
      if (found) return found;
    }
  }
  return null;
}

function findMarginValue(value: unknown, keys: string[]): number | null {
  if (value == null) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findMarginValue(item, keys);
      if (found !== null) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;

  const object = value as Record<string, unknown>;
  const normalizedKeys = keys.map((key) => key.toLowerCase().replace(/[^a-z0-9]/g, ""));
  for (const [key, candidate] of Object.entries(object)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normalizedKeys.includes(normalized)) {
      const number = typeof candidate === "number" ? candidate : Number(candidate);
      if (Number.isFinite(number)) return number;
    }
  }

  for (const child of Object.values(object)) {
    const found = findMarginValue(child, keys);
    if (found !== null) return found;
  }
  return null;
}

function formatAmount(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const PRODUCT_API_HINT: Record<string, string> = {
  CNC: "DELIVERY – carried forward to holdings",
  MIS: "INTRADAY – auto-squared off before market close",
  NRML: "Carry Forward – derivatives position carried forward",
  CO: "COVER – market order + stop loss",
  BO: "BRACKET – entry + stop loss + profit booking",
};

const VALIDITY_HINT: Record<string, string> = {
  EOS: "EOS – valid for a specific trading session (BSE)",
  DAY: "DAY – valid for the current trading day only",
  IOC: "IOC – Immediate or Cancel",
  GTD: "GTD – Good Till Date, valid for the number of days entered",
};

const FIELD_LABEL = "mb-1 flex items-center justify-between text-[11px] font-medium text-aveon-muted";

function NumberField({
  value,
  onChange,
  onStep,
  disabled = false,
  placeholder,
  step,
  min,
  ariaLabel,
  inputRef,
}: {
  value: string | number;
  onChange: (value: string) => void;
  onStep: (direction: -1 | 1) => void;
  disabled?: boolean;
  placeholder?: string;
  step?: number;
  min?: number;
  ariaLabel: string;
  inputRef?: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div className={`flex h-9 overflow-hidden rounded-lg border bg-aveon-panel2 transition focus-within:border-sky-500/80 ${disabled ? "border-aveon-border opacity-50" : "border-aveon-border"}`}>
      <input
        ref={inputRef}
        type="number"
        aria-label={ariaLabel}
        min={min}
        step={step}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 bg-transparent px-2.5 text-sm font-semibold text-aveon-text outline-none placeholder:font-normal placeholder:text-aveon-muted disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button type="button" aria-label={`Decrease ${ariaLabel}`} disabled={disabled} onClick={() => onStep(-1)} className="flex w-8 items-center justify-center border-l border-aveon-border text-aveon-muted hover:bg-aveon-panel hover:text-aveon-text disabled:pointer-events-none"><Minus size={14} /></button>
      <button type="button" aria-label={`Increase ${ariaLabel}`} disabled={disabled} onClick={() => onStep(1)} className="flex w-8 items-center justify-center border-l border-aveon-border text-aveon-muted hover:bg-aveon-panel hover:text-aveon-text disabled:pointer-events-none"><Plus size={14} /></button>
    </div>
  );
}

function Pill({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={`h-8 rounded-lg border px-2 text-[11px] font-bold tracking-wide transition ${
        active
          ? "border-aveon-primary bg-aveon-primary text-white shadow-sm"
          : "border-aveon-border bg-aveon-panel2 text-aveon-muted hover:border-sky-500/60 hover:text-aveon-text"
      }`}
    >
      {children}
    </button>
  );
}

export default function OrderTicket({
  instrument,
  onOrderPlaced,
  initialSide = "BUY",
  initialProductType,
  initialQuantity,
  initialPrice,
  initialOrderKind,
  cashOptions = [],
  quotes = {},
  onCashInstrumentChange,
  onClose,
}: {
  instrument: Instrument | null;
  onOrderPlaced?: (omsId: string | null) => void;
  initialSide?: TransactionType;
  initialProductType?: ProductType;
  initialQuantity?: number;
  initialPrice?: number;
  initialOrderKind?: OrderKind;
  cashOptions?: Instrument[];
  quotes?: Record<string, WatchlistQuote>;
  onCashInstrumentChange?: (instrument: Instrument) => void;
  onClose?: () => void;
}) {
  const [side, setSide] = useState<TransactionType>(initialSide);
  const [productType, setProductType] = useState<ProductType>(initialProductType ?? "CNC");
  const [orderKind, setOrderKind] = useState<OrderKind>(initialOrderKind ?? "MARKET");
  const [quantity, setQuantity] = useState(initialQuantity ?? 1);
  const [price, setPrice] = useState(initialPrice && initialPrice > 0 ? String(initialPrice) : "");
  const [triggerPrice, setTriggerPrice] = useState("");
  const [disclosedQuantity, setDisclosedQuantity] = useState(0);
  const [validity, setValidity] = useState<Validity>("DAY");
  const [validityDays, setValidityDays] = useState(1);
  const [isAmo, setIsAmo] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [omsId, setOmsId] = useState<string | null>(null);
  const [marginRequested, setMarginRequested] = useState(false);
  const [marginLoading, setMarginLoading] = useState(false);
  const [marginResult, setMarginResult] = useState<{
    required: number | null;
    available: number | null;
    shortfall: number | null;
    brokerage: number | null;
    spanVar: number | null;
    exposure: number | null;
    premiumPayable: number | null;
    premiumReceivable: number | null;
  } | null>(null);
  const [dynamicProducts, setDynamicProducts] = useState<{ code: string }[]>([]);

  const qtyInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus quantity field on load/instrument change
  useEffect(() => {
    const timer = setTimeout(() => {
      qtyInputRef.current?.focus();
      qtyInputRef.current?.select();
    }, 60);
    return () => clearTimeout(timer);
  }, [instrument?.token]);

  const segment = (instrument?.exchangeSegment ?? instrument?.exchange ?? "").toUpperCase();
  const isBseSegment = segment.includes("BSE");
  const validityOptions: Validity[] = isBseSegment ? ["EOS", "DAY", "IOC", "GTD"] : ["DAY", "IOC", "GTD"];
  const isDerivative =
    segment.includes("FO") ||
    segment.includes("COMM") ||
    segment.includes("CUR") ||
    (instrument?.instrumentName ?? "").toUpperCase().includes("FUT") ||
    (instrument?.instrumentName ?? "").toUpperCase().includes("OPT") ||
    Boolean((instrument?.optionType ?? "").trim()) ||
    Boolean((instrument?.expiryDateText ?? "").trim());
  const lotSize = instrument?.regularLot && instrument.regularLot > 0 ? instrument.regularLot : 1;
  const actualQuantity = isDerivative ? quantity * lotSize : quantity;
  const fallbackProductOptions: ProductType[] = isDerivative ? ["MIS", "NRML"] : ["CNC", "MIS"];
  const supportedDynamicCodes = new Set(dynamicProducts.map((item) => item.code));
  const productOptions: ProductType[] = dynamicProducts.length
    ? fallbackProductOptions.filter((code) => supportedDynamicCodes.has(code))
    : fallbackProductOptions;
  const effectiveProductOptions = productOptions.length ? productOptions : fallbackProductOptions;
  const needsPrice = orderKindRequiresLimitPrice(orderKind);
  const needsTrigger = orderKindRequiresTriggerPrice(orderKind);
  const rawTickSize = instrument?.priceTick && instrument.priceTick > 0 ? instrument.priceTick : 0.05;
  const tickSize = rawTickSize >= 1 ? rawTickSize / 100 : rawTickSize;

  useEffect(() => {
    if (!instrument) return;
    setSide(initialSide);
    const initialProduct = String(initialProductType ?? "").trim().toUpperCase();
    const initialUiProduct: ProductType | undefined = isDerivative &&
      ["DELIVERY", "CARRYFORWARD"].includes(initialProduct)
      ? "NRML"
      : (initialProductType as ProductType | undefined);
    const oeDefaults = getOeDefaultsFor(exchangeSegmentFor(instrument) || segment);
    setProductType(initialUiProduct ?? oeDefaults.productType ?? (isDerivative ? "MIS" : "CNC"));
    if (oeDefaults.orderKind) setOrderKind(oeDefaults.orderKind);
    setQuantity(initialQuantity ?? 1);
    if (initialOrderKind) setOrderKind(initialOrderKind);
    setPrice(initialPrice && initialPrice > 0 ? String(initialPrice) : "");
    setTriggerPrice("");
    setDisclosedQuantity(0);
    setValidity(oeDefaults.validity ?? "DAY");
    setIsAmo(false);
    setResult(null);
    setConfirmOpen(false);
    setOmsId(null);
    setMarginRequested(false);
    setMarginLoading(false);
    setMarginResult(null);
  }, [instrument?.token, instrument?.marketSegmentId, instrument?.exchangeSegment, isDerivative, initialSide, initialProductType, initialQuantity, initialPrice, initialOrderKind]);

  const priceEdited = useRef(false);
  const hasInitializedPrice = useRef(false);

  const quoteOf = (inst: Instrument) => {
    const segmentId = inst.marketSegmentId ?? ((inst.exchangeSegment ?? inst.exchange ?? "").toUpperCase().includes("BSE") ? 3 : 1);
    return (segmentId ? quotes[`${segmentId}_${inst.token}`] : undefined) ?? quotes[`${inst.exchangeSegment ?? inst.exchange}:${inst.token}`] ?? quotes[inst.tradingSymbol] ?? quotes[inst.symbol] ?? quotes[inst.token];
  };

  const defaultPriceQuote = instrument ? quoteOf(instrument) : undefined;

  // Reset initialization lock when instrument or buy/sell side changes
  useEffect(() => {
    priceEdited.current = false;
    hasInitializedPrice.current = false;
  }, [instrument?.token, instrument?.marketSegmentId, instrument?.exchangeSegment, side]);

  // Initialize price EXACTLY ONCE per modal session / side toggle — stopping live stream overwrites
  useEffect(() => {
    if (hasInitializedPrice.current || priceEdited.current || (initialPrice && initialPrice > 0)) return;

    const askPrice = Number(defaultPriceQuote?.ask_price ?? 0);
    const bidPrice = Number(defaultPriceQuote?.bid_price ?? 0);
    const ltp = Number(defaultPriceQuote?.ltp ?? 0);
    const close = Number(defaultPriceQuote?.close ?? 0);

    // BUY picks Ask (Offer) price; SELL picks Bid price. Fallback to LTP / Close.
    const picked = 
      side === "BUY" 
        ? (askPrice > 0 ? askPrice : ltp > 0 ? ltp : close)
        : (bidPrice > 0 ? bidPrice : ltp > 0 ? ltp : close);

    if (picked > 0) {
      const tickDecimals = (String(tickSize).split(".")[1] ?? "").length;
      setPrice(picked.toFixed(Math.max(2, tickDecimals)));
      hasInitializedPrice.current = true; // Lock it so live websocket ticks never overwrite user input!
    }
  }, [defaultPriceQuote, side, initialPrice, tickSize]);

  useEffect(() => {
    let active = true;
    void getDynamicProductTypes().then((products) => {
      if (active && products.length) setDynamicProducts(products);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!validityOptions.includes(validity)) setValidity("DAY");
  }, [isBseSegment]);

  useEffect(() => {
    if (!effectiveProductOptions.includes(productType)) {
      setProductType(effectiveProductOptions[0] ?? (isDerivative ? "MIS" : "CNC"));
    }
  }, [isDerivative, effectiveProductOptions.join("|")]);

  useEffect(() => {
    setMarginRequested(false);
    setMarginResult(null);
  }, [
    instrument?.token,
    side,
    productType,
    orderKind,
    quantity,
    price,
    triggerPrice,
    disclosedQuantity,
    validity,
    validityDays,
    isAmo,
  ]);

  const currentInstrument = instrument!;

  if (!instrument) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center">
        <p className="text-sm text-aveon-text">Select a symbol</p>
        <p className="text-xs text-aveon-muted">Pick something from your watchlist to trade it here.</p>
      </div>
    );
  }

  function validate(): string | null {
    const inputPrice = Number(price) || 0;
    const inputTrigger = Number(triggerPrice) || 0;
    const decimalPlaces = (value: number) => {
      const text = String(value);
      if (!text.includes(".")) return 0;
      return text.split(".")[1]?.length ?? 0;
    };

    const isTickAligned = (value: number) => {
      if (value <= 0) return true;
      const scale = 10 ** Math.max(decimalPlaces(value), decimalPlaces(tickSize));
      const valueInt = Math.round(value * scale);
      const tickInt = Math.round(tickSize * scale);
      return tickInt > 0 && valueInt % tickInt === 0;
    };
    const blocked = `${currentInstrument.securityStatus ?? ""} ${currentInstrument.securityRemarks ?? ""}`.toUpperCase();

    if (!currentInstrument.token || !currentInstrument.marketSegmentId) return "This scrip is missing instrument-master trading data. Search and add it again.";
    if (currentInstrument.isIndex) return "Index symbols are not tradable.";
    if (/SUSPEND|INACTIVE|BLOCK|NOT ALLOWED|CLOSE ONLY/.test(blocked)) return "This security is not available for order entry.";
    if (quantity < 1) return isDerivative ? "Please enter lots." : "Please enter quantity.";
    if (actualQuantity <= 0) return "Quantity must be greater than zero.";
    if (currentInstrument.maxSingleTransactionQty && actualQuantity > currentInstrument.maxSingleTransactionQty) return `Quantity cannot exceed ${currentInstrument.maxSingleTransactionQty}.`;
    if (needsPrice && inputPrice <= 0) return "Enter a limit price.";
    if (needsTrigger && inputTrigger <= 0) return "Enter a trigger price.";
    if (!isTickAligned(inputPrice) || !isTickAligned(inputTrigger)) {
      return `Price must be in multiples of ₹${tickSize.toFixed(2)}.`;
    }
    if (orderKind === "SL_LIMIT" && ((side === "BUY" && inputPrice < inputTrigger) || (side === "SELL" && inputPrice > inputTrigger))) {
      return `For ${side} SL Limit, limit price must be on the valid side of trigger price.`;
    }
    if (validity === "GTD" && validityDays < 1) return "Enter the number of days for a GTD order.";
    if (disclosedQuantity > actualQuantity) return "Disclosed quantity cannot exceed order quantity.";
    return null;
  }

  async function requestMarginEstimate() {
    if (marginRequested) {
      setMarginRequested(false);
      setMarginResult(null);
      return;
    }

    const validationMessage = validate();
    if (validationMessage) {
      setResult({ success: false, message: validationMessage });
      return;
    }

    setMarginRequested(true);
    setMarginLoading(true);
    setMarginResult(null);
    setResult(null);

    const quote = quoteOf(currentInstrument);
    const ltp = Number(quote?.ltp) || 0;
    const requestedPrice = Number(price) || ltp;
    const marginPrice = Math.round(Math.max(0, requestedPrice) * 100);
    const marginPayload = {
      NoOfLegs: 1,
      Mode: "N",
      FETraceId: `WEB_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      LegDetails: [{
        LegNo: 1,
        BuyOrSell: side === "BUY" ? 1 : 2,
        MarketSegment: (currentInstrument.exchangeSegment ?? currentInstrument.exchange ?? "").toUpperCase(),
        Token: Number(currentInstrument.token) || 0,
        Quantity: actualQuantity,
        Price: marginPrice,
        MktFlag: 0,
        OldPrice: 0,
        OldQuantity: 0,
        ProductType: "M",
        LegIndicator: 0,
      }],
    };

    try {
      const response = await apiClient.post(Endpoints.orders.margin, marginPayload);
      if (!response.success) {
        setMarginRequested(false);
        setResult({ success: false, message: response.message || "Unable to get margin estimate." });
        return;
      }

      const source = response.data ?? response;
      const required = findMarginValue(source, [
        "approx_margin", "total_margin", "required_margin", "margin_required", "order_margin", "order_required_margin", "margin",
      ]);
      const available = findMarginValue(source, [
        "available_margin", "available_funds", "net_available_funds", "available",
      ]);
      const apiShortfall = findMarginValue(source, [
        "short_fall", "margin_shortfall", "shortfall", "required_margin_shortfall",
      ]);
      const shortfall = apiShortfall !== null
        ? apiShortfall
        : required !== null && available !== null
          ? Math.max(0, required - available)
          : null;
      const brokerage = findMarginValue(source, ["brokerage"]);
      const spanVar = findMarginValue(source, ["span_var", "spanvar"]);
      const exposure = findMarginValue(source, ["exposure_margin", "exposuremargin"]);
      const premiumPayable = findMarginValue(source, ["total_premium_payable", "premium_payable"]);
      const premiumReceivable = findMarginValue(source, ["total_premium_receivable", "premium_receivable"]);

      setMarginResult({ required, available, shortfall, brokerage, spanVar, exposure, premiumPayable, premiumReceivable });
    } catch {
      setMarginRequested(false);
      setResult({ success: false, message: "Unable to get margin estimate. Please try again." });
    } finally {
      setMarginLoading(false);
    }
  }

  function requestConfirmation() {
    const validationMessage = validate();
    if (validationMessage) {
      setResult({ success: false, message: validationMessage });
      return;
    }
    setResult(null);
    setConfirmOpen(true);
  }

  async function submitConfirmed() {
    if (!currentInstrument) return;
    setConfirmOpen(false);
    setSubmitting(true);
    setResult(null);

    const payload = buildOrderPayload({
      instrument: currentInstrument,
      side,
      productType,
      orderKind,
      quantity: actualQuantity,
      price: Number(price) || 0,
      triggerPrice: Number(triggerPrice) || 0,
      disclosedQuantity,
      validity,
      validityDays: validity === "GTD" ? validityDays : 0,
      isAmo,
    });

    try {
      const res = await apiClient.post(Endpoints.orders.regular, payload);
      const responseOmsId = findOmsId(res.data) ?? findOmsId(res);
      setResult({ success: res.success, message: res.message || (res.success ? "Order placed successfully." : "Order failed.") });
      if (res.success) {
        setOmsId(responseOmsId);
        onOrderPlaced?.(responseOmsId);
      }
    } catch {
      setResult({ success: false, message: "Unable to place order. Please check the order book before retrying." });
    } finally {
      setSubmitting(false);
    }
  }

  const isCashSegment = segment.includes("NSE_EQ") || segment.includes("BSE_EQ") || segment === "NSE" || segment === "BSE";
  const cashExchangeOf = (inst: Instrument): string => {
    const segment = (inst.exchangeSegment ?? "").trim().toUpperCase();
    const exchange = (inst.exchange ?? "").trim().toUpperCase();

    if (segment.includes("BSE") || exchange.includes("BSE")) return "BSE";
    if (segment.includes("NSE") || exchange.includes("NSE")) return "NSE";

    return exchange || segment || "UNKNOWN";
  };

  const selectedLtp = Number(quoteOf(instrument)?.ltp);
  const selectedExchangeTag = isCashSegment ? cashExchangeOf(instrument) : segment;
  const lotInfo = instrument.regularLot && instrument.regularLot > 1 ? ` · Lot ${instrument.regularLot}` : "";
  const sideColor = side === "BUY" ? "bg-aveon-buy" : "bg-aveon-sell";
  const stepPrice = (current: string, direction: -1 | 1) =>
    direction === -1
      ? String(Math.max(0, (Number(current) || 0) - tickSize).toFixed(2))
      : String(((Number(current) || 0) + tickSize).toFixed(2));

  const PriceLine = ({ inst }: { inst: Instrument }) => {
    const q = quoteOf(inst);
    const ltp = Number(q?.ltp);
    const pct = Number(q?.change_percent);
    return (
      <>
        <span className="font-bold tabular-nums text-aveon-text">{Number.isFinite(ltp) && ltp > 0 ? `₹${ltp.toFixed(2)}` : "—"}</span>
        {Number.isFinite(pct) && Number.isFinite(ltp) && ltp > 0 && (
          <span className={`tabular-nums ${pct >= 0 ? "text-aveon-buy" : "text-aveon-sell"}`}>({pct > 0 ? "+" : ""}{pct.toFixed(2)}%)</span>
        )}
      </>
    );
  };

  return (
    <div onKeyDown={(event) => {
      if (event.key !== "Enter" || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || target.tagName === "A") return;

      event.preventDefault();
      event.stopPropagation();

      if (confirmOpen) {
        void submitConfirmed();
      } else {
        requestConfirmation();
      }
    }} className="relative flex min-h-0 flex-1 flex-col bg-aveon-panel">
      {/* Header */}
      <div className="shrink-0 border-b border-aveon-border bg-aveon-panel2 px-3 py-2">
        <div className="flex items-start gap-2.5">
          <span className={`mt-0.5 rounded-md px-2 py-0.5 text-[11px] font-bold text-white ${sideColor}`}>{side}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <p className="truncate text-sm font-bold text-aveon-text">{instrumentDisplayName(instrument)}</p>
              <span className="shrink-0 text-[11px] text-aveon-muted">{instrument.exchangeSegment || instrument.exchange}{lotInfo}</span>
            </div>

            {cashOptions.length >= 2 ? (
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5" role="radiogroup" aria-label="Exchange">
                {cashOptions.slice(0, 2).map((option, index) => {
                  const exchange = cashExchangeOf(option);
                  const isSelected = option.token === instrument.token &&
                    (option.marketSegmentId ?? option.exchangeSegment) === (instrument.marketSegmentId ?? instrument.exchangeSegment);
                  return (
                    <label key={`${exchange}-${option.token}`} className="flex cursor-pointer items-center gap-1.5 text-[11px]">
                      {index > 0 && <span className="-ml-2 mr-2 text-aveon-muted">•</span>}
                      <input
                        type="radio"
                        name="cash-exchange"
                        checked={isSelected}
                        onChange={() => onCashInstrumentChange?.(option)}
                        className="h-3.5 w-3.5 shrink-0 accent-blue-500"
                      />
                      <span className={`font-bold ${exchange === "NSE" ? "text-blue-400" : "text-violet-400"}`}>{exchange}</span>
                      <PriceLine inst={option} />
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="mt-1 flex items-center gap-2 text-[11px]">
                <PriceLine inst={instrument} />
              </div>
            )}
          </div>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close order entry" className="rounded-md p-1 text-aveon-muted hover:bg-aveon-panel hover:text-aveon-text"><X size={16} /></button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
        {/* Buy / Sell */}
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-aveon-border bg-aveon-panel2 p-0.5">
          {(["BUY", "SELL"] as TransactionType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setSide(t)}
              className={`rounded-md py-1.5 text-sm font-bold transition ${
                side === t
                  ? t === "BUY" ? "bg-aveon-buy text-white shadow-sm" : "bg-aveon-sell text-white shadow-sm"
                  : "text-aveon-muted hover:bg-aveon-panel hover:text-aveon-text"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Regular / AMO + Validity */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex items-center gap-4" role="radiogroup" aria-label="Order mode">
            {([{ label: "REGULAR", amo: false }, { label: "AMO", amo: true }]).map((mode) => (
              <label key={mode.label} className={`flex cursor-pointer items-center gap-1.5 text-[11px] font-bold tracking-wide ${isAmo === mode.amo ? "text-sky-400" : "text-aveon-muted"}`}>
                <input type="radio" name="order-mode" checked={isAmo === mode.amo} onChange={() => setIsAmo(mode.amo)} className="h-3.5 w-3.5 accent-blue-500" />
                {mode.label}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-aveon-muted">Validity</span>
            {validityOptions.map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={validity === v}
                title={VALIDITY_HINT[v]}
                onClick={() => setValidity(v)}
                className={`h-7 rounded-md border px-2.5 text-[11px] font-bold transition ${validity === v ? "border-aveon-primary bg-aveon-primary text-white" : "border-aveon-border bg-aveon-panel2 text-aveon-muted hover:text-aveon-text"}`}
              >
                {v}
              </button>
            ))}
            {validity === "GTD" && (
              <label className="flex items-center gap-1 text-[11px] text-aveon-muted">
                <input
                  type="number"
                  min={1}
                  aria-label="validity days"
                  value={validityDays}
                  onChange={(e) => setValidityDays(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                  className="h-7 w-14 rounded-md border border-aveon-border bg-aveon-panel2 px-2 text-xs font-semibold text-aveon-text outline-none focus:border-sky-500/80 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                days
              </label>
            )}
          </div>
        </div>

        {/* Product */}
        <div className="grid grid-cols-[52px_1fr] items-center gap-2">
          <p className="text-[11px] font-medium text-aveon-muted">Product</p>
          <div className={`grid gap-1.5 ${effectiveProductOptions.length > 2 ? "grid-cols-3" : "grid-cols-2"}`} role="radiogroup" aria-label="Product type">
            {effectiveProductOptions.map((option) => (
              <Pill key={option} active={productType === option} onClick={() => setProductType(option)} title={PRODUCT_API_HINT[option]}>
                {productDisplayName(option, segment)}
              </Pill>
            ))}
          </div>
        </div>

        {/* Order Type */}
        <div className="grid grid-cols-[52px_1fr] items-center gap-2">
          <p className="text-[11px] font-medium text-aveon-muted">Type</p>
          <div className="grid grid-cols-4 gap-1.5">
            <Pill active={orderKind === "MARKET"} onClick={() => setOrderKind("MARKET")} title="RL-MKT – Regular Market Order: executes at market price">MARKET</Pill>
            <Pill active={orderKind === "LIMIT"} onClick={() => setOrderKind("LIMIT")} title="RL – Regular Limit Order: executes at a specified price">LIMIT</Pill>
            <Pill active={orderKind === "SL_LIMIT"} onClick={() => setOrderKind("SL_LIMIT")} title="SL – Stoploss Limit: triggers a limit order after the stop price is reached">SL</Pill>
            <Pill active={orderKind === "SL_MARKET"} onClick={() => setOrderKind("SL_MARKET")} title="SL-MKT – Stoploss Market: triggers a market order after the stop price is reached">SL-M</Pill>
          </div>
        </div>

        {/* Qty / Price / Trigger / Disclosed */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <div>
            <div className={FIELD_LABEL}>
              <span>{isDerivative && lotSize > 1 ? "Lots" : "Qty"} (Lot: {lotSize})</span>
              {isDerivative && lotSize > 1 && <span className="font-semibold text-aveon-text">= {actualQuantity}</span>}
            </div>
            <NumberField ariaLabel="quantity" value={quantity} min={1} step={1} onChange={(v) => setQuantity(Math.max(1, Number(v) || 0))} onStep={(d) => setQuantity(Math.max(1, quantity + d))} inputRef={qtyInputRef} />
          </div>
          <div>
            <div className={FIELD_LABEL}>
              <span>Price (₹)</span>
              <span className="font-semibold text-sky-400">{selectedExchangeTag}: {Number.isFinite(selectedLtp) && selectedLtp > 0 ? `₹${selectedLtp.toFixed(2)}` : "—"}</span>
            </div>
            <NumberField ariaLabel="limit price" value={needsPrice ? price : ""} step={tickSize} disabled={!needsPrice} placeholder={needsPrice ? "Enter price" : "At market"} onChange={(v) => { priceEdited.current = true; setPrice(v); }} onStep={(d) => { priceEdited.current = true; setPrice(stepPrice(price, d)); }} />
          </div>
          <div>
            <div className={FIELD_LABEL}><span>Trigger Price (₹)</span></div>
            <NumberField ariaLabel="trigger price" value={needsTrigger ? triggerPrice : ""} step={tickSize} disabled={!needsTrigger} placeholder="Not required" onChange={setTriggerPrice} onStep={(d) => setTriggerPrice(stepPrice(triggerPrice, d))} />
          </div>
          <div>
            <div className={FIELD_LABEL}><span>Disclosed Qty</span></div>
            <NumberField ariaLabel="disclosed quantity" value={disclosedQuantity} min={0} step={1} onChange={(v) => setDisclosedQuantity(Math.max(0, Number(v) || 0))} onStep={(d) => setDisclosedQuantity(Math.max(0, disclosedQuantity + d))} />
          </div>
        </div>

        {!needsPrice && (
          <p className="text-[11px] text-aveon-muted">Market order will execute at the available market price.</p>
        )}

        {/* Margin */}
        <div className="border-t border-aveon-border pt-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <ShieldCheck size={14} className="shrink-0 text-cyan-400" />
                <p className="text-xs font-bold text-aveon-text">Margin Estimate</p>
              </div>
              <p className="pl-5 text-[10px] text-aveon-muted">Check margin required for this order</p>
            </div>
            <button
              type="button"
              aria-pressed={marginRequested}
              disabled={marginLoading}
              title={marginRequested ? "Click again to hide the estimate" : undefined}
              onClick={() => void requestMarginEstimate()}
              className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                marginRequested && !marginLoading
                  ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-400"
                  : "border-aveon-border bg-aveon-panel2 text-aveon-text hover:border-sky-500/60"
              }`}
            >
              {marginLoading ? <><Loader2 size={12} className="animate-spin" /> Checking…</> : marginRequested ? <><Check size={12} /> Estimate loaded</> : "Get estimate"}
            </button>
          </div>

          {marginLoading && (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-aveon-border bg-aveon-panel2 px-3 py-1.5 text-[11px] text-aveon-muted">
              <Loader2 size={13} className="animate-spin text-sky-400" /> Requesting margin estimate…
            </div>
          )}

          {marginResult && !marginLoading && (
            <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-0.5 rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-3 py-1.5 font-mono text-[11px]">
              <div className="flex justify-between gap-2"><span className="text-aveon-muted">Required:</span><span className="font-bold text-aveon-text">{formatAmount(marginResult.required)}</span></div>
              <div className="flex justify-between gap-2"><span className="text-aveon-muted">Available:</span><span className="font-bold text-aveon-buy">{formatAmount(marginResult.available)}</span></div>
              <div className="flex justify-between gap-2"><span className="text-aveon-muted">Shortfall:</span><span className={`font-bold ${marginResult.shortfall !== null && marginResult.shortfall > 0 ? "text-aveon-sell" : "text-aveon-buy"}`}>{formatAmount(marginResult.shortfall)}</span></div>
              <div className="flex justify-between gap-2"><span className="text-aveon-muted">Brokerage:</span><span className="font-bold text-aveon-text">{formatAmount(marginResult.brokerage)}</span></div>
              {marginResult.spanVar !== null && <div className="flex justify-between gap-2"><span className="text-aveon-muted">SPAN/VAR:</span><span className="font-bold text-aveon-text">{formatAmount(marginResult.spanVar)}</span></div>}
              {marginResult.exposure !== null && <div className="flex justify-between gap-2"><span className="text-aveon-muted">Exposure:</span><span className="font-bold text-aveon-text">{formatAmount(marginResult.exposure)}</span></div>}
              {marginResult.premiumPayable !== null && <div className="flex justify-between gap-2"><span className="text-aveon-muted">Prem. Pay:</span><span className="font-bold text-aveon-text">{formatAmount(marginResult.premiumPayable)}</span></div>}
              {marginResult.premiumReceivable !== null && <div className="flex justify-between gap-2"><span className="text-aveon-muted">Prem. Recv:</span><span className="font-bold text-aveon-text">{formatAmount(marginResult.premiumReceivable)}</span></div>}
            </div>
          )}
        </div>

        {result && (
          <p className={`text-xs ${result.success ? "text-aveon-buy" : "text-aveon-sell"}`}>{result.message}</p>
        )}
      </div>

      {/* Footer actions */}
      <div className={`grid shrink-0 gap-2 border-t border-aveon-border bg-aveon-panel p-3 ${onClose ? "grid-cols-[1fr_2.2fr]" : "grid-cols-1"}`}>
        {onClose && (
          <button type="button" onClick={onClose} className="h-10 rounded-lg border border-aveon-border bg-aveon-panel2 text-sm font-semibold text-aveon-text hover:bg-aveon-panel">Cancel</button>
        )}
        <Button variant={side === "BUY" ? "buy" : "sell"} className="h-10 w-full rounded-lg text-sm font-bold uppercase shadow-sm" onClick={requestConfirmation} disabled={submitting}>
          {submitting ? "Placing…" : `${side} ${instrumentDisplayName(instrument)} (${selectedExchangeTag})`}
        </Button>
      </div>

      {confirmOpen && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/65 p-4">
          <div className="w-full max-w-sm rounded-xl border border-aveon-border bg-aveon-panel shadow-2xl">
            <div className="flex items-center justify-between border-b border-aveon-border px-4 py-3">
              <div><p className="text-sm font-semibold text-aveon-text">Confirm order</p><p className="text-[11px] text-aveon-muted">Please verify before sending to OMS</p></div>
              <button type="button" onClick={() => setConfirmOpen(false)} className="rounded p-1 text-aveon-muted hover:bg-aveon-panel2"><X size={16} /></button>
            </div>
            <div className="space-y-2 p-4 text-xs">
              <div className="flex justify-between"><span className="text-aveon-muted">Symbol</span><span className="max-w-[210px] truncate font-medium">{orderInstrumentDisplayName(instrument)}</span></div>
              <div className="flex justify-between"><span className="text-aveon-muted">Side</span><span className={side === "BUY" ? "font-semibold text-aveon-buy" : "font-semibold text-aveon-sell"}>{side}</span></div>
              <div className="flex justify-between"><span className="text-aveon-muted">Product</span><span>{productDisplayName(productType, segment)}</span></div>
              <div className="flex justify-between"><span className="text-aveon-muted">Order Type</span><span>{orderKind}</span></div>
              <div className="flex justify-between"><span className="text-aveon-muted">Quantity</span><span>{actualQuantity}</span></div>
              <div className="flex justify-between"><span className="text-aveon-muted">Disclosed Qty</span><span>{disclosedQuantity}</span></div>
              <div className="flex justify-between"><span className="text-aveon-muted">Validity</span><span>{validity}{validity === "GTD" ? ` (${validityDays} day${validityDays === 1 ? "" : "s"})` : ""}</span></div>
              {needsPrice && <div className="flex justify-between"><span className="text-aveon-muted">Price</span><span>{price}</span></div>}
              {needsTrigger && <div className="flex justify-between"><span className="text-aveon-muted">Trigger</span><span>{triggerPrice}</span></div>}
              <div className="flex justify-between"><span className="text-aveon-muted">AMO</span><span>{isAmo ? "Yes" : "No"}</span></div>
            </div>
            <div className="flex gap-2 border-t border-aveon-border p-4">
              <button type="button" onClick={() => setConfirmOpen(false)} className="flex-1 rounded-md border border-aveon-border py-2 text-xs font-medium text-aveon-text hover:bg-aveon-panel2">Cancel</button>
              <Button variant={side === "BUY" ? "buy" : "sell"} className="flex-1" onClick={submitConfirmed}>Confirm & Place</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}