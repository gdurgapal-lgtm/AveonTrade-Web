"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  Check, Copy, Download, FileSpreadsheet, Play, Plus, RefreshCw, Search, Trash2, Upload, X,
} from "lucide-react";
import SymbolSearchModal from "@/components/market/SymbolSearchModal";
import { useMarketStream } from "@/hooks/useMarketStream";
import { apiClient } from "@/lib/apiClient";
import { Endpoints } from "@/lib/endpoints";
import { useAuthStore } from "@/lib/authStore";
import { feedToken, instrumentDisplayName, type Instrument, type WatchlistQuote } from "@/types/trading";
import {
  makeCartOrder,
  orderCartFromJson,
  orderCartToCreatePayload,
  orderCartToPlacePayload,
  type OrderCart,
  type OrderCartOrder,
  type OrderCartPlacementResult,
} from "@/types/orderCart";

const PRODUCTS = [
  { value: "DELIVERY", label: "Delivery" },
  { value: "INTRADAY", label: "Intraday" },
  { value: "CARRYFORWARD", label: "Carryforward" },
  { value: "PTST", label: "PTST" },
];

type DynamicProduct = { value: string; label: string; instrument?: number };

function dynamicProductCode(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function dynamicProductLabel(row: Record<string, any>, code: string): string {
  return String(
    row.sDescription ??
    row.description ??
    row.productDescription ??
    row.productName ??
    row.sProductName ??
    row.sDefaultProductType ??
    code
  ).trim() || code;
}

function extractDynamicProducts(value: unknown): DynamicProduct[] {
  const root = value && typeof value === "object" ? value as Record<string, any> : {};
  const candidate = Array.isArray(root.result)
    ? root.result
    : Array.isArray(root.data)
    ? root.data
    : Array.isArray((root.data as Record<string, any> | undefined)?.result)
      ? (root.data as Record<string, any>).result
      : [];
  const seen = new Set<string>();
  return candidate.flatMap((item: unknown) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, any>;
    const valueCode = dynamicProductCode(row.sDefaultProductType ?? row.productType ?? row.product_type);
    if (!valueCode || seen.has(valueCode)) return [];
    seen.add(valueCode);
    const instrument = Number(row.nInstrument ?? row.instrument ?? 0);
    return [{
      value: valueCode,
      label: dynamicProductLabel(row, valueCode),
      instrument: Number.isFinite(instrument) && instrument > 0 ? instrument : undefined,
    }];
  });
}
const VALIDITIES = ["DAY", "IOC", "EOSESS"];
const TYPES = [
  { value: "RL-MKT", label: "MARKET" },
  { value: "RL", label: "LIMIT" },
  { value: "SL", label: "SL" },
  { value: "SL-MKT", label: "SL-MKT" },
];

type Row = OrderCartOrder;

function isEquityRow(row: Row): boolean {
  const segment = String(row.exchangeSegment || row.exchange || "").toUpperCase();
  const series = String(row.series || "").toUpperCase();
  return segment.endsWith("_EQ") || segment === "NSE" || segment === "BSE" || ["EQ", "BE", "BZ", "A"].includes(series);
}

function allowedProductsForRow(row: Row, products: DynamicProduct[]): DynamicProduct[] {
  const equity = isEquityRow(row);
  const allowedCodes = equity
    ? new Set(["DELIVERY", "INTRADAY", "PTST"])
    : new Set(["CARRYFORWARD"]);
  return products.filter((product) => {
    if (!allowedCodes.has(product.value.toUpperCase())) return false;
    if (product.value.toUpperCase() === "PTST" && String(row.side).toUpperCase() === "SELL") return false;
    return true;
  });
}

function makeId() {
  return `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function withId(row: Row): Row {
  return { ...row, raw: { ...row.raw, __webId: row.raw.__webId || makeId() } };
}

function responseRows(value: unknown): Record<string, any>[] {
  if (Array.isArray(value)) return value.filter((x): x is Record<string, any> => !!x && typeof x === "object");
  if (value && typeof value === "object") {
    const obj = value as Record<string, any>;
    if (Array.isArray(obj.data)) return obj.data.filter((x: unknown): x is Record<string, any> => !!x && typeof x === "object");
    if (obj.data && typeof obj.data === "object") return [obj.data];
    return [obj];
  }
  return [];
}

function formatMoney(value: number) {
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function productLabel(value: string, dynamicProducts: DynamicProduct[] = []) {
  return dynamicProducts.find((x) => x.value === value)?.label || PRODUCTS.find((x) => x.value === value)?.label || value;
}

function typeLabel(value: string) {
  return TYPES.find((x) => x.value === value)?.label || value;
}

function tickStep(row: Row) {
  const raw = Number(row.raw.PriceTick ?? 0);
  if (raw > 0) return raw >= 1 ? raw / 100 : raw;
  return 0.05;
}

export default function OrderCartPage() {
  const { userId } = useAuthStore();
  const [carts, setCarts] = useState<OrderCart[]>([]);
  const [selectedCartId, setSelectedCartId] = useState("");
  const [basketName, setBasketName] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<OrderCartPlacementResult | null>(null);
  const [filter, setFilter] = useState("");
  const [dynamicProducts, setDynamicProducts] = useState<DynamicProduct[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await apiClient.get<any>(Endpoints.orders.orderCart);
    if (!response.success) {
      setMessage(response.message || "Unable to load order baskets.");
      setCarts([]);
      setLoading(false);
      return [] as OrderCart[];
    }
    const parsed = responseRows(response.data).map((item) => orderCartFromJson(item));
    setCarts(parsed);
    setLoading(false);
    return parsed;
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let active = true;
    void apiClient.get(Endpoints.auth.dynamicProductTypes).then((response) => {
      if (!active || !response.success) return;
      const products = extractDynamicProducts(response.data ?? response);
      if (products.length) setDynamicProducts(products);
    });
    return () => { active = false; };
  }, []);

  const openCreate = () => {
    setSelectedCartId("");
    setBasketName(`Basket ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }).replace(":", "")}`);
    setRows([]);
    setMessage("");
    setResult(null);
  };

  const openCart = (cart: OrderCart) => {
    setSelectedCartId(cart.id);
    setBasketName(cart.name);
    setRows(cart.orders.map(withId));
    setMessage("");
    setResult(null);
  };

  const deleteBasket = async () => {
    if (!selectedCartId) {
      setMessage("Select a saved basket to delete.");
      return;
    }
    const cart = carts.find((item) => item.id === selectedCartId);
    if (!cart) return;
    const confirmed = window.confirm(`Delete basket "${cart.name}"? This cannot be undone.`);
    if (!confirmed) return;

    setSaving(true);
    setMessage("");
    const response = await apiClient.delete(`${Endpoints.orders.orderCart}/${encodeURIComponent(selectedCartId)}`);
    setSaving(false);

    if (!response.success) {
      setMessage(response.message || "Unable to delete basket.");
      return;
    }

    setSelectedCartId("");
    setBasketName("");
    setRows([]);
    setResult(null);
    setMessage(`Basket "${cart.name}" deleted successfully.`);
    await load();
  };

  const basketDisplayNameFromInstrument = (instrument: Instrument): string => {
    const symbol = String(instrument.symbol || "").trim().toUpperCase();
    const tradingSymbol = String(instrument.tradingSymbol || "").trim().toUpperCase();
    const derivativeDesc = String(instrument.derivativeDesc || "").trim().toUpperCase();
    const kind = String(instrument.instrumentName || "").trim().toUpperCase();
    const segment = String(instrument.exchangeSegment || instrument.exchange || "").trim().toUpperCase();
    const option = String(instrument.optionType || "").trim().toUpperCase();

    const cleanContract = (value: string) => value.replace(/NANA$/i, "").trim();
    const contractLike = (value: string) => { const clean = cleanContract(value); return /(?:FUT|CE|PE)$/.test(clean) || /\d{2}[A-Z]{3}/.test(clean); };
    if (option === "CE" || option === "PE" || kind.startsWith("OPT") || segment.endsWith("_FO")) {
      const candidates = [cleanContract(tradingSymbol), cleanContract(derivativeDesc)].filter(Boolean);
      const exact = candidates.find(contractLike);
      if (exact) return exact;

      const expiryRaw = String(instrument.expiryDateText || "").trim().toUpperCase();
      const fullExpiry = expiryRaw.match(/(\d{2})([A-Z]{3})(\d{4})/);
      const shortExpiry = expiryRaw.match(/([A-Z]{3})(\d{2})/);
      const expiry = fullExpiry ? `${fullExpiry[3].slice(2)}${fullExpiry[2]}` : shortExpiry ? `${shortExpiry[2]}${shortExpiry[1]}` : "";
      if (symbol && expiry) {
        if (option && instrument.strikePrice) return `${symbol}${expiry}${instrument.strikePrice}${option}`;
        return `${symbol}${expiry}FUT`;
      }
    }

    if (segment.endsWith("_EQ") || ["EQ", "A", "BE", "BZ"].includes(String(instrument.series || "").trim().toUpperCase())) {
      return symbol && instrument.series ? `${symbol} ${String(instrument.series).trim().toUpperCase()}` : symbol || tradingSymbol;
    }
    return symbol || tradingSymbol || derivativeDesc;
  };

  const addInstrument = (instrument: Instrument) => {
    const key = `${instrument.exchangeSegment ?? instrument.exchange}|${instrument.token}|${instrument.tradingSymbol}|${instrument.optionType ?? ""}|${instrument.strikePrice ?? ""}`;
    if (rows.some((row) => `${row.exchangeSegment}|${row.token}|${row.symbol}|${row.optionType}|${row.strikePrice}` === key)) {
      setMessage(`${instrument.tradingSymbol || instrument.symbol} is already in this basket.`);
      return;
    }
    const order = withId(makeCartOrder(instrument));
    const liveInstrument = instrument as Instrument & { ltp?: number; close?: number; scripInstrument?: number; marketSegmentId?: number; tradingMarketSegmentId?: number };
    const referencePrice = Number(liveInstrument.ltp ?? 0) > 0
      ? Number(liveInstrument.ltp)
      : Number(liveInstrument.close ?? 0);
    const displayName = basketDisplayNameFromInstrument(instrument);
    const segment = String(instrument.exchangeSegment ?? instrument.exchange ?? "").trim().toUpperCase();
    const instrumentName = String(instrument.instrumentName ?? "").trim().toUpperCase();
    const isDerivative = segment.endsWith("_FO") || instrumentName.startsWith("FUT") || instrumentName.startsWith("OPT")
      || ["CE", "PE"].includes(String(instrument.optionType ?? "").trim().toUpperCase());

    const persistedSymbol = isDerivative
      ? displayName
      : String(instrument.symbol || instrument.tradingSymbol || "").trim();

    order.symbol = persistedSymbol || order.symbol;
    order.raw = {
      ...order.raw,
      ...(isDerivative ? {
        symbol: persistedSymbol,
        Symbol: persistedSymbol,
        SecurityDesc: persistedSymbol,
      } : {}),
      __displayName: displayName,
      __scripInstrument: Number(liveInstrument.scripInstrument ?? 0) || undefined,
      __marketSegmentId: Number(liveInstrument.marketSegmentId ?? liveInstrument.tradingMarketSegmentId ?? 0) || undefined,
      __tradingSymbol: String(liveInstrument.tradingSymbol ?? displayName ?? liveInstrument.symbol ?? "").trim() || undefined,
      DefaultPrice: referencePrice > 0 ? referencePrice : order.raw.DefaultPrice,
    };
    setRows((current) => [...current, order]);
    setMessage("");
  };

  const updateRow = (id: string, patch: Partial<Row>) => {
    setRows((current) => current.map((row) => {
      if (row.raw.__webId !== id) return row;
      const next = { ...row, ...patch };
      if (patch.orderType) next.isMarketOrder = patch.orderType.toUpperCase().includes("MKT");
      next.raw = {
        ...row.raw,
        ...(patch.side ? { TransactionType: patch.side } : {}),
        ...(patch.orderType ? { OrderType: patch.orderType } : {}),
        ...(patch.productType ? { ProductType: patch.productType } : {}),
        ...(patch.quantity != null ? { Quantity: patch.quantity } : {}),
        ...(patch.price != null ? { Price: patch.price } : {}),
        ...(patch.validity ? { validity: patch.validity } : {}),
        ...(patch.raw ? patch.raw : {}),
      };
      return next;
    }));
  };

  const removeRow = (id: string) => setRows((current) => current.filter((row) => row.raw.__webId !== id));

  const duplicateRow = (id: string) => {
    setRows((current) => {
      const index = current.findIndex((row) => row.raw.__webId === id);
      if (index < 0) return current;
      const copy = withId(current[index]);
      return [...current.slice(0, index + 1), copy, ...current.slice(index + 1)];
    });
  };

  const saveBasket = async (silent = false): Promise<OrderCart | null> => {
    const name = basketName.trim();
    if (!name) { setMessage("Enter a basket name."); return null; }
    if (!rows.length) { setMessage("Add at least one order to the basket."); return null; }
    const invalid = rows.find((row) => !row.token || !row.exchangeSegment || row.quantity <= 0);
    if (invalid) { setMessage(`Complete instrument details for ${invalid.symbol || "one of the orders"}.`); return null; }
    const badLimit = rows.find((row) => !row.isMarketOrder && (!Number.isFinite(Number(row.price)) || Number(row.price) <= 0));
    if (badLimit) { setMessage(`Enter a valid LIMIT price for ${badLimit.symbol || "the order"}.`); return null; }

    setSaving(true);
    setMessage("");
    const ordersToSave = rows.map((row) => {
      const raw = row.raw as Record<string, any>;
      const segment = String(row.exchangeSegment || row.exchange || "").trim().toUpperCase();
      const instrumentName = String(raw._InstrumentName || raw.InstrumentName || "").trim().toUpperCase();
      const option = String(row.optionType || raw._OptionType || "").trim().toUpperCase();
      const isDerivative = segment.endsWith("_FO") || instrumentName.startsWith("FUT") || instrumentName.startsWith("OPT")
        || option === "CE" || option === "PE";
      if (!isDerivative) return row;

      const displayName = basketDisplayNameFromInstrument({
        exchange: row.exchange,
        token: String(row.token),
        symbol: row.symbol,
        tradingSymbol: String(raw.__tradingSymbol ?? raw.TradingSymbol ?? raw.tradingSymbol ?? row.symbol),
        companyName: row.symbol,
        series: row.series,
        exchangeSegment: row.exchangeSegment,
        instrumentName: raw._InstrumentName || raw.InstrumentName || "",
        optionType: row.optionType,
        expiryDateText: row.expiryDate,
        strikePrice: row.strikePrice,
      });
      const persistedSymbol = displayName || String(raw.__tradingSymbol ?? row.symbol).trim();
      return {
        ...row,
        symbol: persistedSymbol,
        raw: {
          ...raw,
          symbol: persistedSymbol,
          Symbol: persistedSymbol,
          SecurityDesc: persistedSymbol,
          __displayName: persistedSymbol,
        },
      };
    });

    const cart: OrderCart = {
      id: selectedCartId,
      name,
      modifiedAt: carts.find((c) => c.id === selectedCartId)?.modifiedAt || "",
      orders: ordersToSave,
      raw: carts.find((c) => c.id === selectedCartId)?.raw || {},
    };
    const payload = orderCartToCreatePayload(cart, userId || "WEB");
    const response = selectedCartId
      ? await apiClient.put(Endpoints.orders.orderCart, { ordercartId: selectedCartId, ...payload })
      : await apiClient.post(Endpoints.orders.orderCart, payload);
    setSaving(false);

    if (!response.success) {
      setMessage(response.message || `Unable to ${selectedCartId ? "update" : "create"} basket.`);
      return null;
    }

    const direct = responseRows(response.data).map((item) => orderCartFromJson(item)).find((item) => item.id);
    const refreshed = await load();
    const saved = selectedCartId
      ? refreshed.find((item) => item.id === selectedCartId)
      : direct?.id
        ? refreshed.find((item) => item.id === direct.id)
        : refreshed.find((item) => item.name === name);

    if (saved) {
      openCart(saved);
      if (!silent) setMessage(selectedCartId ? "Basket updated successfully." : "Basket saved successfully.");
      return saved;
    }

    if (!silent) setMessage(selectedCartId ? "Basket updated successfully." : "Basket saved successfully.");
    return { ...cart, id: direct?.id || cart.id };
  };

  const placeBasket = async (cart: OrderCart) => {
    if (!cart.id || !cart.orders.length) {
      setMessage("Save the basket before executing orders.");
      return;
    }
    setPlacing(true);
    setMessage("");
    const response = await apiClient.post(Endpoints.orders.orderCartPlace, orderCartToPlacePayload(cart));
    setPlacing(false);
    const items = responseRows(response.data).map((item) => {
      const data = item.data && typeof item.data === "object" ? item.data : {};
      const status = String(item.status ?? "").toLowerCase();
      return {
        success: status === "success" || item.success === true,
        code: String(item.code ?? ""),
        message: String(item.message ?? ""),
        orderId: String(data.orderId ?? data.order_id ?? item.orderId ?? ""),
      };
    });
    setResult({
      success: response.success,
      message: response.message || (response.success ? "Bulk order request submitted." : "Bulk order request failed."),
      items,
    });
  };

  const execute = async () => {
    if (placing || saving) return;
    const saved = await saveBasket(true);
    if (saved?.id) await placeBasket(saved);
  };

  const downloadTemplate = () => {
    const csv = [
      "Symbol,Exchange,Side,Product,Type,Quantity,Price,Trigger,Validity",
      "RELIANCE,NSE,BUY,MIS,MARKET,1,, ,DAY",
      "TCS,NSE,BUY,MIS,LIMIT,1,4320.55,,DAY",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "AveonTrade_OrderCart_Template.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const importCsv = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result || "").split(/\r?\n/).filter(Boolean);
      const start = lines[0]?.toLowerCase().includes("symbol") ? 1 : 0;
      const parsed = lines.slice(start).map((line) => line.split(",").map((v) => v.trim())).filter((v) => v[0]);
      const next: Row[] = [];
      for (const item of parsed) {
        const symbol = item[0].toUpperCase();
        const matched = carts.flatMap((cart) => cart.orders).find((order) => order.symbol.toUpperCase() === symbol);
        if (!matched) continue;
        const side = (item[2] || matched.side).toUpperCase();
        const product = (item[3] || matched.productType).toUpperCase();
        const type = (item[4] || typeLabel(matched.orderType)).toUpperCase();
        const orderType = TYPES.find((x) => x.label === type || x.value === type)?.value || matched.orderType;
        next.push(withId({ ...matched, side, productType: product, orderType, quantity: Number(item[5]) > 0 ? Number(item[5]) : matched.quantity, price: item[6] || matched.price, raw: { ...matched.raw, TransactionType: side, ProductType: product, OrderType: orderType, Quantity: Number(item[5]) > 0 ? Number(item[5]) : matched.quantity, Price: item[6] || matched.price } }));
      }
      if (next.length) setRows(next);
      else setMessage("CSV symbols could not be resolved. Use Add Order to select instruments from the broker master.");
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    if (!dynamicProducts.length) return;
    setRows((current) => current.map((row) => {
      const options = allowedProductsForRow(row, dynamicProducts);
      if (!options.length) return row;
      if (options.some((product) => product.value === row.productType)) return row;
      const nextProduct = options[0].value;
      return {
        ...row,
        productType: nextProduct,
        raw: { ...row.raw, ProductType: nextProduct },
      };
    }));
  }, [dynamicProducts]);

  const feedInstruments = useMemo<Instrument[]>(() => rows.map((row) => {
    const raw = row.raw as Record<string, any>;
    const segmentId = Number(
      raw.__marketSegmentId
        ?? raw.scripDet?._MktSegId
        ?? raw._MktSegId
        ?? raw.scripDet?._MapMktSegId
        ?? raw._MapMktSegId
        ?? 0,
    );
    const tradingSymbol = String(
      raw.__tradingSymbol
        ?? raw.TradingSymbol
        ?? raw.tradingSymbol
        ?? row.symbol
        ?? "",
    ).trim();
    return {
      exchange: row.exchange,
      token: String(row.token ?? "").trim(),
      symbol: row.symbol,
      tradingSymbol: tradingSymbol || row.symbol,
      companyName: row.symbol,
      series: row.series,
      exchangeSegment: row.exchangeSegment,
      marketSegmentId: segmentId > 0 ? segmentId : undefined,
      instrumentName: row.raw._InstrumentName || row.raw.InstrumentName || "",
      optionType: row.optionType,
      expiryDateText: row.expiryDate,
      strikePrice: row.strikePrice,
      regularLot: row.marketLot,
      priceTick: Number(row.raw.PriceTick ?? 0),
    };
  }).filter((item) => !!item.token && !!item.exchangeSegment), [rows]);

  const { quotes, quotesByToken } = useMarketStream(feedInstruments);

  const quoteForRow = useCallback((row: Row): WatchlistQuote | null => {
    const raw = row.raw as Record<string, any>;
    const token = String(row.token ?? "").trim();
    const segmentId = Number(
      raw.__marketSegmentId
        ?? raw.scripDet?._MktSegId
        ?? raw._MktSegId
        ?? raw.scripDet?._MapMktSegId
        ?? raw._MapMktSegId
        ?? 0,
    );
    if (!token) return null;

    if (segmentId > 0) {
      const direct = quotesByToken[`${segmentId}_${token}`];
      if (direct) return direct;
    }

    const instrument: Instrument = {
      exchange: row.exchange,
      token,
      symbol: row.symbol,
      tradingSymbol: String(raw.__tradingSymbol ?? raw.TradingSymbol ?? raw.tradingSymbol ?? row.symbol),
      companyName: row.symbol,
      series: row.series,
      exchangeSegment: row.exchangeSegment,
      marketSegmentId: segmentId || undefined,
    };
    const key = feedToken(instrument);
    if (key) {
      const mapped = quotesByToken[key];
      if (mapped) return mapped;
    }

    const tradingSymbol = String(
      raw.__tradingSymbol
        ?? raw.TradingSymbol
        ?? raw.tradingSymbol
        ?? raw._TradingSymbol
        ?? row.symbol
        ?? "",
    ).trim();
    if (tradingSymbol) {
      const symbolQuote = quotes[tradingSymbol];
      if (symbolQuote) return symbolQuote;
    }

    const suffix = `_${token}`;
    const candidates = Object.entries(quotesByToken).filter(([quoteKey]) => quoteKey.endsWith(suffix));
    const preferred = segmentId > 0
      ? candidates.find(([quoteKey]) => quoteKey.startsWith(`${segmentId}_`))
      : candidates[0];
    return (preferred?.[1] as WatchlistQuote | undefined) ?? null;
  }, [quotes, quotesByToken]);

  const dynamicProductsForRow = useCallback((row: Row): DynamicProduct[] => {
    return allowedProductsForRow(row, dynamicProducts);
  }, [dynamicProducts]);

  const filteredCarts = useMemo(() => {
    const q = filter.trim().toUpperCase();
    if (!q) return carts;
    return carts.filter((cart) => cart.name.toUpperCase().includes(q) || cart.orders.some((row) => row.symbol.toUpperCase().includes(q)));
  }, [carts, filter]);

  const addedKeys = useMemo(() => new Set(rows.map((row) => `${row.exchangeSegment}|${row.token}|${row.symbol}|${row.optionType}|${row.strikePrice}`)), [rows]);
  const buyCount = rows.filter((row) => row.side.toUpperCase() === "BUY").length;
  const sellCount = rows.filter((row) => row.side.toUpperCase() === "SELL").length;
  const estimatedValue = rows.reduce((sum, row) => {
    const p = row.isMarketOrder ? Number(row.raw.DefaultPrice || 0) : Number(row.price || 0);
    return sum + (Number.isFinite(p) ? p : 0) * row.quantity;
  }, 0);

  return (
    <section className="h-full w-full flex flex-col overflow-hidden rounded-xl border border-aveon-border bg-aveon-panel shadow-sm">
      <header className="flex shrink-0 items-center justify-between border-b border-aveon-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-aveon-primary/40 bg-aveon-primary/10 text-aveon-primary">
            <FileSpreadsheet size={21} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-aveon-text">Bulk Order</h1>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-aveon-muted">Basket</span>
              <input
                value={basketName}
                onChange={(e) => setBasketName(e.target.value)}
                placeholder="Basket name"
                className="h-7 w-44 rounded-md border border-aveon-border bg-aveon-panel2 px-2 text-[11px] text-aveon-text outline-none placeholder:text-aveon-muted focus:border-aveon-primary"
              />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {selectedCartId && (
            <button
              type="button"
              onClick={() => void deleteBasket()}
              disabled={saving}
              title="Delete selected basket"
              className="rounded-md p-2 text-aveon-sell hover:bg-aveon-sell/10 disabled:opacity-50"
            >
              <Trash2 size={17} />
            </button>
          )}
          <button
            type="button"
            onClick={openCreate}
            title="New basket"
            className="rounded-md p-2 text-aveon-muted hover:bg-aveon-panel2 hover:text-aveon-text"
          >
            <Plus size={18} />
          </button>
        </div>
      </header>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-aveon-border bg-aveon-panel2 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
          <span className="mr-1 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-aveon-muted">Quick Baskets</span>
          {filteredCarts.slice(0, 5).map((cart) => (
            <button
              key={cart.id}
              type="button"
              onClick={() => openCart(cart)}
              className={`max-w-[145px] shrink-0 truncate rounded-md border px-3 py-1.5 text-[11px] font-semibold transition ${
                selectedCartId === cart.id
                  ? "border-aveon-primary bg-aveon-primary/10 text-aveon-primary"
                  : "border-aveon-border bg-aveon-panel text-aveon-muted hover:border-aveon-primary/50 hover:text-aveon-text"
              }`}
            >
              {cart.name}
            </button>
          ))}
          {!filteredCarts.length && <span className="text-[11px] text-aveon-muted">No saved baskets yet</span>}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="relative hidden lg:block">
            <Search size={13} className="absolute left-2.5 top-2 text-aveon-muted" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search baskets"
              className="h-8 w-36 rounded-md border border-aveon-border bg-aveon-panel px-8 text-[11px] text-aveon-text outline-none placeholder:text-aveon-muted focus:border-aveon-primary"
            />
          </div>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={importCsv} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-8 items-center gap-1.5 rounded-md border border-aveon-border bg-aveon-panel px-3 text-[11px] font-semibold text-aveon-text hover:border-aveon-primary/60"
          >
            <Upload size={13} className="text-aveon-primary" /> Import CSV
          </button>
          <button
            type="button"
            onClick={downloadTemplate}
            className="flex h-8 items-center gap-1.5 rounded-md border border-aveon-border bg-aveon-panel px-3 text-[11px] font-semibold text-aveon-text hover:border-aveon-accent/60"
          >
            <Download size={13} className="text-aveon-accent" /> CSV Template
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-8 items-center gap-1.5 rounded-md bg-aveon-primary px-3.5 text-[11px] font-bold text-white hover:opacity-90"
          >
            <Plus size={14} /> Add Order
          </button>
          <button
            type="button"
            onClick={() => setRows([])}
            title="Clear all orders"
            className="rounded-md p-1.5 text-aveon-sell hover:bg-aveon-sell/10"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {message && (
        <div className="shrink-0 border-b border-aveon-accent/20 bg-aveon-accent/5 px-4 py-2 text-[11px] text-aveon-accent">
          {message}
        </div>
      )}

      {/* Independent Scrollable Body Area */}
      <main className="min-h-0 flex-1 overflow-y-auto bg-aveon-bg">
        <div className="min-w-[1180px]">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-20 bg-aveon-panel text-[10px] uppercase tracking-wider text-aveon-muted">
              <tr className="border-b border-aveon-border">
                <th className="w-10 px-3 py-3 text-left">#</th>
                <th className="w-[210px] px-2 py-3 text-left">Instrument / Scrip</th>
                <th className="w-[100px] px-2 py-3 text-left">Exchange</th>
                <th className="w-[105px] px-2 py-3 text-left">Side</th>
                <th className="w-[110px] px-2 py-3 text-left">Product</th>
                <th className="w-[115px] px-2 py-3 text-left">Type</th>
                <th className="w-[155px] px-2 py-3 text-left">Quantity</th>
                <th className="w-[140px] px-2 py-3 text-left">Price (₹)</th>
                <th className="w-[125px] px-2 py-3 text-left">Trigger (₹)</th>
                <th className="w-[140px] px-3 py-3 text-right">Est. Value</th>
                <th className="w-[75px] px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <BasketRow
                  key={String(row.raw.__webId)}
                  index={index}
                  row={row}
                  quote={quoteForRow(row)}
                  productOptions={dynamicProductsForRow(row)}
                  onChange={(patch) => updateRow(String(row.raw.__webId), patch)}
                  onDuplicate={() => duplicateRow(String(row.raw.__webId))}
                  onRemove={() => removeRow(String(row.raw.__webId))}
                />
              ))}
            </tbody>
          </table>

          {!rows.length && !loading && (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex w-full flex-col items-center justify-center py-24 text-center text-aveon-muted hover:bg-aveon-panel2/40"
            >
              <Plus size={25} className="mb-2 text-aveon-primary" />
              <span className="text-sm font-semibold text-aveon-text">Add orders to this basket</span>
              <span className="mt-1 text-xs text-aveon-muted">Use Add Order to select instruments from the broker master.</span>
            </button>
          )}
          {loading && <div className="flex justify-center py-24 text-aveon-muted"><RefreshCw size={18} className="animate-spin" /></div>}
        </div>
      </main>

      {/* Pinned Summary Footer - Always Visible */}
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-t border-aveon-border bg-aveon-panel px-4 py-3">
        <div className="flex items-center gap-7 text-[10px] uppercase tracking-wide text-aveon-muted">
          <div><div>Orders Count</div><strong className="mt-1 block text-base normal-case text-aveon-text">{rows.length}</strong></div>
          <div><div>Sides Breakdown</div><strong className="mt-1 block text-base normal-case"><span className="text-aveon-primary">{buyCount} BUY</span><span className="px-2 text-aveon-muted">/</span><span className="text-aveon-sell">{sellCount} SELL</span></strong></div>
          <div><div>Est. Total Value</div><strong className="mt-1 block text-base normal-case text-aveon-primary">{formatMoney(estimatedValue)}</strong></div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void saveBasket(false)}
            disabled={saving || !rows.length}
            className="flex h-9 items-center gap-2 rounded-md border border-aveon-border bg-aveon-panel2 px-4 text-[11px] font-semibold text-aveon-text hover:border-aveon-primary/60 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check size={14} /> {saving ? "Saving…" : "Save Basket"}
          </button>
          <button type="button" onClick={openCreate} className="px-2 text-[11px] text-aveon-muted hover:text-aveon-text">Cancel</button>
          <button
            type="button"
            onClick={() => void execute()}
            disabled={saving || placing || !rows.length}
            className="flex h-10 items-center gap-2 rounded-lg bg-aveon-primary px-6 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play size={14} fill="currentColor" /> {placing ? "Executing…" : `Execute Bulk Orders (${rows.length})`}
          </button>
        </div>
      </footer>

      <SymbolSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={addInstrument}
        isAdded={(instrument) => addedKeys.has(`${instrument.exchangeSegment ?? instrument.exchange}|${instrument.token}|${instrument.tradingSymbol}|${instrument.optionType ?? ""}|${instrument.strikePrice ?? ""}`)}
      />
      {result && <PlacementResult result={result} onClose={() => setResult(null)} />}
    </section>
  );
}

function BasketRow({ index, row, quote, productOptions, onChange, onDuplicate, onRemove }: { index: number; row: Row; quote: WatchlistQuote | null; productOptions: DynamicProduct[]; onChange: (patch: Partial<Row>) => void; onDuplicate: () => void; onRemove: () => void }) {
  const market = row.orderType.toUpperCase().includes("MKT");
  const liveLtp = Number(quote?.ltp ?? 0);
  const closePrice = Number(quote?.close ?? 0);
  const referencePrice = liveLtp > 0 ? liveLtp : closePrice > 0 ? closePrice : 0;
  const valuePrice = market ? referencePrice : Number(row.price || 0);
  const estimated = Number.isFinite(valuePrice) ? valuePrice * row.quantity : 0;
  const displayName = (() => {
    const raw = row.raw as Record<string, any>;
    const segment = String(row.exchangeSegment || row.exchange || "").toUpperCase();
    const instrumentName = String(raw._InstrumentName || raw.InstrumentName || "").toUpperCase();
    const option = String(row.optionType || raw._OptionType || "").trim().toUpperCase();
    const clean = (value: unknown) => String(value ?? "")
      .trim()
      .toUpperCase()
      .replace(/NANA$/i, "")
      .trim();
    const tradingSymbol = clean(raw.__tradingSymbol ?? raw.TradingSymbol ?? raw.tradingSymbol ?? raw._TradingSymbol);
    const securityDesc = clean(raw.SecurityDesc);
    const savedDisplay = clean(raw.__displayName);
    const isDerivative = segment.endsWith("_FO") || instrumentName.startsWith("FUT") || instrumentName.startsWith("OPT") || option === "CE" || option === "PE";
    const contractLike = (value: string) => /(?:FUT|CE|PE)$/.test(value) || /\d{2}[A-Z]{3}/.test(value);

    if (isDerivative) {
      const cleanCandidates = [tradingSymbol, securityDesc, savedDisplay].filter(Boolean);
      const fullContract = cleanCandidates.find((value) => /(?:FUT|CE|PE)$/.test(value));
      if (fullContract) return fullContract;

      const dateRaw = clean(raw._ExpiryDate || row.expiryDate);
      const fullExpiry = dateRaw.match(/(\d{2})([A-Z]{3})(\d{4})/);
      const shortExpiry = dateRaw.match(/([A-Z]{3})(\d{2})/);
      const expiry = fullExpiry
        ? `${fullExpiry[3].slice(2)}${fullExpiry[2]}`
        : shortExpiry
          ? `${shortExpiry[2]}${shortExpiry[1]}`
          : "";
      const baseSymbol = clean(row.symbol) || clean(tradingSymbol) || clean(securityDesc);

      if (baseSymbol && expiry) {
        if (option === "CE" || option === "PE") {
          const strike = clean(row.strikePrice || raw._StrikePrice);
          if (strike) return `${baseSymbol}${expiry}${strike}${option}`;
        }
        if (instrumentName.startsWith("FUT") || !option || option === "NANA") return `${baseSymbol}${expiry}FUT`;
      }

      const stripped = cleanCandidates.find(contractLike);
      if (stripped) return stripped;
      return baseSymbol || tradingSymbol || securityDesc;
    }

    if (segment.endsWith("_EQ") || ["EQ", "A", "BE", "BZ"].includes(clean(row.series))) {
      return row.symbol && row.series ? `${clean(row.symbol)} ${clean(row.series)}` : clean(row.symbol) || tradingSymbol || securityDesc;
    }
    return clean(row.symbol) || tradingSymbol || securityDesc;
  })();
  const exchange = row.exchangeSegment.includes("_") ? row.exchangeSegment.split("_")[0] : row.exchange;
  const priceStep = tickStep(row);

  return (
    <tr className="h-[58px] border-b border-aveon-border bg-aveon-panel hover:bg-aveon-panel2">
      <td className="px-3 text-xs text-aveon-muted">{index + 1}</td>
      <td className="px-2">
        <div className="relative flex h-9 min-w-[180px] items-center rounded-md border border-aveon-border bg-aveon-panel2 px-3 pr-8 text-xs font-bold text-aveon-text">
          <span className="truncate">{displayName}{valuePrice > 0 ? ` (${formatMoney(valuePrice)})` : ""}</span>
          <span className="absolute right-2 text-aveon-muted">⌄</span>
        </div>
      </td>
      <td className="px-2">
        <select value={exchange} disabled className="h-9 w-full rounded-md border border-aveon-border bg-aveon-panel2 px-2 text-xs font-semibold text-aveon-text outline-none disabled:opacity-100">
          <option>{exchange}</option>
        </select>
      </td>
      <td className="px-2">
        <div className="flex h-9 overflow-hidden rounded-md border border-aveon-border bg-aveon-panel2">
          <button type="button" onClick={() => onChange({ side: "BUY" })} className={`w-12 text-[10px] font-bold ${row.side.toUpperCase() === "BUY" ? "bg-aveon-primary text-white" : "text-aveon-muted hover:text-aveon-text"}`}>BUY</button>
          <button type="button" onClick={() => onChange({ side: "SELL", productType: row.productType.toUpperCase() === "PTST" ? (productOptions.find((p) => p.value.toUpperCase() !== "PTST")?.value || row.productType) : row.productType })} className={`w-12 text-[10px] font-bold ${row.side.toUpperCase() === "SELL" ? "bg-aveon-sell text-white" : "text-aveon-muted hover:text-aveon-text"}`}>SELL</button>
        </div>
      </td>
      <td className="px-2">
        <select value={row.productType} onChange={(e) => onChange({ productType: e.target.value })} className="h-9 w-full rounded-md border border-aveon-border bg-aveon-panel2 px-2 text-xs font-semibold text-aveon-text outline-none focus:border-aveon-primary">
          {(productOptions.length ? productOptions : allowedProductsForRow(row, PRODUCTS)).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </td>
      <td className="px-2">
        <select value={row.orderType} onChange={(e) => onChange({ orderType: e.target.value, price: e.target.value.includes("MKT") ? "0.00" : (row.price === "0.00" ? "" : row.price) })} className="h-9 w-full rounded-md border border-aveon-border bg-aveon-panel2 px-2 text-xs font-semibold text-aveon-primary outline-none focus:border-aveon-primary">
          {TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </td>
      <td className="px-2">
        <div className="flex h-9 w-[150px] items-center overflow-hidden rounded-md border border-aveon-border bg-aveon-panel2">
          <input type="number" min={1} step={1} value={row.quantity} onChange={(e) => onChange({ quantity: Math.max(1, Number(e.target.value) || 1) })} className="min-w-0 w-[82px] flex-1 bg-transparent px-2 text-center text-xs font-semibold text-aveon-text outline-none" />
          <span className="shrink-0 border-l border-aveon-border px-2 text-[9px] text-aveon-muted whitespace-nowrap">{row.marketLot > 1 ? `Lot ${row.marketLot}` : "Qty"}</span>
        </div>
      </td>
      <td className="px-2">
        <input type="number" min={0} step={priceStep} disabled={market} value={market ? "" : row.price} placeholder={market ? "MARKET" : "Enter price"} onChange={(e) => onChange({ price: e.target.value })} className={`h-9 w-[92px] rounded-md border border-aveon-border bg-aveon-panel2 px-2 text-right text-xs font-semibold outline-none focus:border-aveon-primary ${market ? "text-aveon-muted" : "text-aveon-text"}`} />
      </td>
      <td className="px-2">
        {row.orderType.toUpperCase().startsWith("SL") ? (
          <input type="number" min={0} step={priceStep} value={row.raw.TriggerPrice ?? ""} placeholder="Trigger" onChange={(e) => onChange({ raw: { ...row.raw, TriggerPrice: e.target.value } } as Partial<Row>)} className="h-9 w-[92px] rounded-md border border-aveon-border bg-aveon-panel2 px-2 text-right text-xs font-semibold text-aveon-text outline-none focus:border-aveon-primary" />
        ) : null}
      </td>
      <td className="px-3 text-right text-xs font-bold text-aveon-text">{estimated > 0 ? formatMoney(estimated) : "—"}</td>
      <td className="px-2">
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onDuplicate} title="Duplicate" className="text-aveon-muted hover:text-aveon-text"><Copy size={15} /></button>
          <button type="button" onClick={onRemove} title="Remove" className="text-aveon-muted hover:text-aveon-sell"><Trash2 size={15} /></button>
        </div>
      </td>
    </tr>
  );
}

function PlacementResult({ result, onClose }: { result: OrderCartPlacementResult; onClose: () => void }) {
  return <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/75 p-4" onClick={onClose}><div className="w-full max-w-3xl overflow-hidden rounded-xl border border-neutral-700 bg-[#151515] shadow-2xl" onClick={(e) => e.stopPropagation()}><div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4"><div className="text-sm font-bold">Bulk Order Execution Result</div><button onClick={onClose}><X size={17} /></button></div><div className="max-h-[55vh] overflow-auto">{result.items.length ? result.items.map((item, index) => <div key={index} className="flex items-center justify-between border-b border-neutral-800 px-5 py-3 text-xs"><div><div className={item.success ? "text-cyan-400" : "text-red-400"}>{item.success ? "Accepted" : "Failed"} · Leg {index + 1}</div><div className="mt-1 text-neutral-400">{item.message || item.code || "—"}</div></div><span className="font-mono text-neutral-500">{item.orderId || "—"}</span></div>) : <div className={`px-5 py-10 text-center text-sm ${result.success ? "text-cyan-400" : "text-red-400"}`}>{result.message}</div>}</div><div className="flex justify-end border-t border-neutral-800 px-5 py-3"><button onClick={onClose} className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-black">Done</button></div></div></div>;
}