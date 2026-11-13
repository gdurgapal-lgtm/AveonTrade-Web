"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDownToLine, ArrowUpFromLine, ChevronDown, ChevronUp, Columns3, GripVertical, Maximize2, Minimize2, RefreshCw, X } from "lucide-react";
import { Badge } from "@/components/ui/Primitives";
import OrderTicketModal from "@/components/market/OrderTicketModal";
import { LIVE_ORDERS, LIVE_POSITIONS, LIVE_TRADES, usePolledData } from "@/hooks/usePolledData";
import { useMarketStream } from "@/hooks/useMarketStream";
import { apiClient } from "@/lib/apiClient";
import { orderBookPath, tradeBookPath, positionsPath, positionConversionInquiryPath, orderModifyPath, orderCancelPath, Endpoints } from "@/lib/endpoints";
import { formatCurrency } from "@/lib/format";
import { positionMtm } from "@/lib/positionHelpers";
import { useLiveOrderStore } from "@/lib/liveOrderStore";
import {
  normalizeHolding,
  normalizePosition,
  normalizeOrder,
  normalizeTrade,
  mergeTradeRows,
  sortOrdersNewestFirst,
  extractList,
  isOpenOrder,
  orderDisplaySymbol,
  positionDisplaySymbol,
  displayProductType,
  validityFromApi,
  validityToApi,
  orderStatusTone,
  feedToken,
  normalizeExchangeSegment,
  type PositionModel,
  type HoldingModel,
  type RawHoldingModel,
  type RawOrderModel,
  type RawTradeModel,
  type OrderModel,
  type Instrument,
  type TransactionType,
  tradeOrderDisplayId,
} from "@/types/trading";

const TABS = ["Open Orders", "Trade Book", "Net Position", "DP Holding", "Order Book (All)"] as const;
type Tab = (typeof TABS)[number];
type PanelSize = "normal" | "minimized" | "maximized";
type ModifyState = { order: OrderModel; qty: number; price: string; trigger: string; disclosed: number; validity: string; validityDays: number; orderType: string } | null;

type ColumnDef = { key: string; label: string; minWidth: number; defaultVisible?: boolean };
type ColumnPrefs = Record<Tab, string[]>;

const RIGHT_ALIGNED_KEYS = new Set(["qty", "reqQty", "price", "trigger", "execQty", "execPrice", "netQty", "netPrice", "ltp", "netValue", "mtm", "buyQty", "buyPrice", "sellQty", "sellPrice", "avgPrice", "currentValue", "pnl", "action"]);
const isRightAligned = (key: string) => RIGHT_ALIGNED_KEYS.has(key);

const ACTION_BTN = "rounded border px-2.5 py-1 text-[11px] font-semibold leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const ACTION_BTN_PRIMARY = `${ACTION_BTN} border-aveon-primary/60 bg-aveon-primary/15 text-aveon-primary hover:bg-aveon-primary hover:text-white`;
const ACTION_BTN_BUY = `${ACTION_BTN} border-aveon-buy/60 bg-aveon-buy/15 text-aveon-buy hover:bg-aveon-buy hover:text-white`;
const ACTION_BTN_SELL = `${ACTION_BTN} border-aveon-sell/60 bg-aveon-sell/15 text-aveon-sell hover:bg-aveon-sell hover:text-white`;

const ACTION_STICKY = "sticky right-0 bg-aveon-panel shadow-[-6px_0_6px_-6px_rgba(0,0,0,0.6)]";

function formatTradeTime(value?: string): string {
  if (!value) return "—";
  const raw = String(value).trim();
  const months: Record<string, string> = {
    JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
    JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
  };
  const socket = raw.match(/^(\\d{2})-([A-Za-z]{3})-(\\d{4})[ T]+(\\d{2})[.:](\\d{2})[.:](\\d{2})/);
  if (socket) {
    const month = months[socket[2].toUpperCase()];
    if (month) return `${socket[3]}-${month}-${socket[1]} ${socket[4]}:${socket[5]}:${socket[6]}`;
  }
  const api = raw.match(/^(\\d{4}-\\d{2}-\\d{2})[ T](\\d{2}):(\\d{2}):(\\d{2})/);
  if (api) return `${api[1]} ${api[2]}:${api[3]}:${api[4]}`;
  const iso = raw.match(/^(\\d{4}-\\d{2}-\\d{2})T(\\d{2}):(\\d{2}):(\\d{2})/);
  if (iso) return `${iso[1]} ${iso[2]}:${iso[3]}:${iso[4]}`;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function positionFeedInstrument(p: PositionModel): Instrument | null {
  const rawExchange = String(p.preferred_exchange || p.exchange || "").trim().toUpperCase();
  const exchange = normalizeExchangeSegment(rawExchange);
  const token = String(p.preferred_scrip_token ?? p.scrip_token ?? "").trim();
  if (!exchange || !token || token === "0") return null;
  const aliases: Record<string, number> = {
    NSE: 1, NSE_EQ: 1, NSE_FO: 2, BSE: 3, BSE_EQ: 3, BSE_FO: 4,
    MCX: 5, MCX_FO: 5, NCDEX: 7, NCDEX_FO: 7,
    NSE_CDS: 13, MSE_CDS: 11, MSE_EQ: 15, MSE_FO: 16,
  };
  const marketSegmentId = /^\\d+$/.test(rawExchange) ? Number(rawExchange) : aliases[rawExchange] ?? aliases[exchange];
  if (!marketSegmentId) return null;
  return {
    exchange, exchangeSegment: exchange, marketSegmentId, token,
    symbol: p.symbol, tradingSymbol: p.symbol, companyName: p.symbol,
    instrumentName: p.instrument,
  };
}

function cellClass(key: string, cols: ColumnDef[]) {
  const isLast = cols[cols.length - 1]?.key === key;
  return [
    key === "symbol" ? "font-medium" : "",
    ["orderId", "internalOrderId", "tradeId"].includes(key) ? "font-mono" : "",
    key === "action" && isLast ? `${ACTION_STICKY} z-[5]` : "",
  ].filter(Boolean).join(" ");
}

function signedTextClass(value: unknown) {
  const n = Number(value);
  if (n > 0) return "text-aveon-buy";
  if (n < 0) return "text-aveon-sell";
  return "text-aveon-text";
}

const COLUMN_DEFS: Record<Tab, ColumnDef[]> = {
  "Open Orders": [
    { key: "time", label: "Time", minWidth: 150 }, { key: "symbol", label: "Symbol", minWidth: 150 },
    { key: "side", label: "Side", minWidth: 72 }, { key: "product", label: "Product", minWidth: 120 },
    { key: "type", label: "Type", minWidth: 88 }, { key: "qty", label: "Rem Qty", minWidth: 82 },
    { key: "reqQty", label: "Qty", minWidth: 72 }, { key: "price", label: "Price", minWidth: 105 },
    { key: "trigger", label: "Trigger", minWidth: 105 }, { key: "orderId", label: "Order ID", minWidth: 145 },
    { key: "internalOrderId", label: "Internal Order ID", minWidth: 150 },
    { key: "status", label: "Status", minWidth: 120 }, { key: "action", label: "Action", minWidth: 150 },
  ],
  "Trade Book": [
    { key: "tradeTime", label: "Trade Time", minWidth: 150 }, { key: "symbol", label: "Symbol", minWidth: 150 },
    { key: "side", label: "Side", minWidth: 72 }, { key: "product", label: "Product", minWidth: 120 },
    { key: "execQty", label: "Exec Qty", minWidth: 85 }, { key: "execPrice", label: "Exec Price", minWidth: 105 },
    { key: "type", label: "Type", minWidth: 88 }, { key: "tradeId", label: "Trade ID", minWidth: 145 },
    { key: "orderId", label: "Order ID", minWidth: 145 },
    { key: "internalOrderId", label: "Internal Order ID", minWidth: 150 },
  ],
  "Net Position": [
    { key: "symbol", label: "Symbol", minWidth: 165 }, { key: "product", label: "Product", minWidth: 120 },
    { key: "netQty", label: "Net Qty", minWidth: 85 }, { key: "netPrice", label: "Net Price", minWidth: 105 },
    { key: "netValue", label: "Net Value", minWidth: 115 }, { key: "ltp", label: "LTP", minWidth: 105 },
    { key: "mtm", label: "MTM G/L", minWidth: 110 },
    { key: "buyQty", label: "Buy Qty", minWidth: 85 }, { key: "buyPrice", label: "Buy Price", minWidth: 105 },
    { key: "sellQty", label: "Sell Qty", minWidth: 85 }, { key: "sellPrice", label: "Sell Price", minWidth: 105 },
    { key: "action", label: "Action", minWidth: 210 },
  ],
  "DP Holding": [
    { key: "symbol", label: "Symbol", minWidth: 165 }, { key: "qty", label: "Qty", minWidth: 80 },
    { key: "avgPrice", label: "Avg Price", minWidth: 105 }, { key: "nseLtp", label: "NSE LTP", minWidth: 105 }, { key: "bseLtp", label: "BSE LTP", minWidth: 105 },
    { key: "currentValue", label: "Current Value", minWidth: 125 }, { key: "pnl", label: "P&L", minWidth: 110 },
    { key: "action", label: "Action", minWidth: 160, defaultVisible: true },
  ],
  "Order Book (All)": [
    { key: "time", label: "Time", minWidth: 150 }, { key: "symbol", label: "Symbol", minWidth: 150 },
    { key: "side", label: "Side", minWidth: 72 }, { key: "product", label: "Product", minWidth: 120 },
    { key: "type", label: "Type", minWidth: 88 }, { key: "qty", label: "Rem Qty", minWidth: 82 },
    { key: "reqQty", label: "Qty", minWidth: 72 }, { key: "price", label: "Price", minWidth: 105 },
    { key: "trigger", label: "Trigger", minWidth: 105 }, { key: "orderId", label: "Order ID", minWidth: 145 },
    { key: "internalOrderId", label: "Internal Order ID", minWidth: 150 },
    { key: "status", label: "Status", minWidth: 120 },
  ],
};

function defaultColumnPrefs(): ColumnPrefs {
  return Object.fromEntries((Object.keys(COLUMN_DEFS) as Tab[]).map((tab) => [tab, COLUMN_DEFS[tab].filter((c) => c.defaultVisible !== false).map((c) => c.key)])) as ColumnPrefs;
}

const STORAGE_KEY = "aveon.bottomPanel.columnPrefs.v6";

export default function BottomPanel() {
  const [tab, setTab] = useState<Tab>("Open Orders");
  const [size, setSize] = useState<PanelSize>("normal");
  const [mounted, setMounted] = useState(false);
  const [action, setAction] = useState<"increase" | "close" | "convert" | null>(null);
  const [actionPosition, setActionPosition] = useState<PositionModel | null>(null);
  const [actionQty, setActionQty] = useState(0);
  const [actionOrderType, setActionOrderType] = useState("RL-MKT");
  const [actionPrice, setActionPrice] = useState("");
  const [targetProduct, setTargetProduct] = useState("DELIVERY");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [modify, setModify] = useState<ModifyState>(null);
  const [modifyBusy, setModifyBusy] = useState(false);
  const [modifyMessage, setModifyMessage] = useState("");
  const [columnPrefs, setColumnPrefs] = useState<ColumnPrefs>(() => defaultColumnPrefs());
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const columnMenuRef = useRef<HTMLDivElement | null>(null);
  const qtyInputRef = useRef<HTMLInputElement | null>(null);
  const [columnMenuPos, setColumnMenuPos] = useState<{ left: number; top?: number; bottom?: number; maxHeight: number }>({ left: 12, bottom: 12, maxHeight: 360 });
  const [dragColumn, setDragColumn] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState<string | null>(null);
  const [cancelMessage, setCancelMessage] = useState("");
  const [cancelMessageIsError, setCancelMessageIsError] = useState(false);

  // Holding Order Ticket state
  const [holdingTicketOpen, setHoldingTicketOpen] = useState(false);
  const [holdingInstrument, setHoldingInstrument] = useState<Instrument | null>(null);
  const [holdingSide, setHoldingSide] = useState<TransactionType>("BUY");
  const [holdingQty, setHoldingQty] = useState(1);
  const [holdingPrice, setHoldingPrice] = useState(0);

  const { orders: liveOrders, allOrders: liveAllOrders, trades: liveTrades } = useLiveOrderStore();


  useEffect(() => setMounted(true), []);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<ColumnPrefs>;
        const defaults = defaultColumnPrefs();
        const merged = { ...defaults };
        (Object.keys(defaults) as Tab[]).forEach((t) => {
          const allowed = new Set(COLUMN_DEFS[t].map((c) => c.key));
          const incoming = Array.isArray(parsed[t]) ? parsed[t].filter((k): k is string => typeof k === "string" && allowed.has(k)) : [];
          merged[t] = incoming.length ? incoming : defaults[t];
        });
        for (const required of ["nseLtp", "bseLtp", "action"]) {
          if (!merged["DP Holding"].includes(required)) merged["DP Holding"].push(required);
        }
        setColumnPrefs(merged);
      }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(columnPrefs)); } catch { /* storage unavailable */ }
  }, [columnPrefs]);

  const panelActive = size !== "minimized";
  const wants = (t: Tab) => panelActive && tab === t;
  useEffect(() => setColumnMenuOpen(false), [tab, size]);

  // Global ESC key handler for dialogs & outside click closing
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (action) setAction(null);
        if (modify) setModify(null);
        if (holdingTicketOpen) setHoldingTicketOpen(false);
        if (columnMenuOpen) setColumnMenuOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [action, modify, holdingTicketOpen, columnMenuOpen]);

  useEffect(() => {
    if (!columnMenuOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (columnMenuRef.current?.contains(target)) return;
      if ((target as HTMLElement).closest?.("[data-column-toggle]")) return;
      setColumnMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    const onResize = () => setColumnMenuOpen(false);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [columnMenuOpen]);

  useEffect(() => {
    if (action && qtyInputRef.current) {
      qtyInputRef.current.focus();
      qtyInputRef.current.select();
    }
  }, [action]);

  const rawOpenOrders = usePolledData<RawOrderModel[]>(orderBookPath(1, 100, 1), 15_000, wants("Open Orders"), LIVE_ORDERS);
  const rawAllOrders = usePolledData<RawOrderModel[]>(orderBookPath(1, 100, -1), 20_000, wants("Order Book (All)"));
  const rawTrades = usePolledData<RawTradeModel[]>(tradeBookPath(1, 100), 20_000, wants("Trade Book"), LIVE_TRADES);
  const rawPositions = usePolledData<Record<string, any>[]>(positionsPath("expiry", 1), 10_000, wants("Net Position"), LIVE_POSITIONS);
  const rawHoldings = usePolledData<RawHoldingModel[]>(Endpoints.holdings.list, 30_000, wants("DP Holding"));


  const orders = useMemo(() => {
    if (tab === "Open Orders") return sortOrdersNewestFirst(liveOrders.filter(isOpenOrder));
    const restOrders = extractList<RawOrderModel>(rawAllOrders.data, ["orders", "orderBook", "order_book", "items", "records"]).map(normalizeOrder);
    if (tab !== "Order Book (All)") return sortOrdersNewestFirst(restOrders);

    // REST supplies the initial/history rows; socket lifecycle events overlay
    // matching orders so terminal states remain visible in Order Book (All).
    const merged = new Map<string, OrderModel>();
    for (const order of restOrders) if (order.order_id) merged.set(order.order_id, order);
    for (const order of liveAllOrders) {
      if (!order.order_id) continue;
      const prev = merged.get(order.order_id);
      // Keep a known exchange / internal order id when a later socket event does not carry it.
      merged.set(order.order_id, prev
        ? { ...prev, ...order, exchange_order_no: order.exchange_order_no || prev.exchange_order_no, internal_order_id: order.internal_order_id || prev.internal_order_id }
        : order);
    }
    const identified = Array.from(merged.values());
    const unidentified = restOrders.filter((order) => !order.order_id);
    return sortOrdersNewestFirst([...identified, ...unidentified]);
  }, [liveOrders, liveAllOrders, rawAllOrders.data, tab]);

  const trades = useMemo(() => {
    const restTrades = extractList<RawTradeModel>(rawTrades.data, ["trades", "tradeBook", "trade_book", "items", "records"]).map(normalizeTrade);
    return mergeTradeRows(restTrades, liveTrades);
  }, [liveTrades, rawTrades.data]);

  const positions = useMemo(() => extractList<Record<string, any>>(rawPositions.data, ["positions", "items", "records"]).map(normalizePosition), [rawPositions.data]);
  const positionInstruments = useMemo(
    () => positions.filter((p) => p.net_quantity !== 0).map(positionFeedInstrument).filter(Boolean) as Instrument[],
    [positions],
  );
  const { quotesByToken: positionQuotes } = useMarketStream(positionInstruments);
  const holdings = useMemo(() => extractList<RawHoldingModel>(rawHoldings.data, ["holdings", "items", "records"]).map(normalizeHolding), [rawHoldings.data]);

  const holdingInstruments = useMemo(() => {
    const list: Instrument[] = [];
    for (const h of holdings) {
      const rawSecs = h.security_info || [];
      for (const sec of rawSecs) {
        const s = sec as any;
        const exchange = (s.exchange || "").toUpperCase();
        const token = String(s.scrip_token || s.scripToken || s.token || "");
        if (token && token !== "0") {
          const exchangeSegment = exchange.includes("BSE") ? "BSE_EQ" : exchange.includes("NSE") ? "NSE_EQ" : exchange;
          list.push({
            exchange: exchangeSegment,
            exchangeSegment,
            token,
            symbol: s.symbol || h.trading_symbol,
            tradingSymbol: s.symbol || h.trading_symbol,
          } as Instrument);
        }
      }
    }
    return list;
  }, [holdings]);

  const { quotesByToken: holdingQuotes } = useMarketStream(holdingInstruments);

  function getHoldingExchangeLtp(h: HoldingModel, wantedExchange: "NSE" | "BSE") {
    const sec = (h.security_info || []).find((item: any) => String(item.exchange || "").toUpperCase().includes(wantedExchange));
    if (!sec) return 0;
    const s = sec as any;
    const token = String(s.scrip_token || s.scripToken || s.token || "");
    const exchange = String(s.exchange || "").toUpperCase();
    const exchangeSegment = exchange.includes("BSE") ? "BSE_EQ" : exchange.includes("NSE") ? "NSE_EQ" : exchange;
    const quoteKey = feedToken({
      exchange: exchangeSegment,
      exchangeSegment,
      token,
    } as Instrument);
    const quote = quoteKey ? holdingQuotes[quoteKey] : undefined;
    return Number(quote?.ltp) > 0 ? Number(quote?.ltp) : 0;
  }

  function getBestHoldingLtp(h: HoldingModel) {
    const nseLtp = getHoldingExchangeLtp(h, "NSE");
    const bseLtp = getHoldingExchangeLtp(h, "BSE");
    const rawSecs = h.security_info || [];
    const nseSec = rawSecs.some((s: any) => String(s.exchange || "").toUpperCase().includes("NSE"));
    const bseSec = rawSecs.some((s: any) => String(s.exchange || "").toUpperCase().includes("BSE"));
    if (nseLtp > 0) return { ltp: nseLtp, exchange: "NSE_EQ", nseLtp, bseLtp, nseSec, bseSec };
    if (bseLtp > 0) return { ltp: bseLtp, exchange: "BSE_EQ", nseLtp, bseLtp, nseSec, bseSec };
    return { ltp: h.ltp || 0, exchange: nseSec ? "NSE_EQ" : "BSE_EQ", nseLtp, bseLtp, nseSec, bseSec };
  }

  function orderFamily(o: OrderModel): "regular" | "cover" | "bracket" { const p = String(o.product_type ?? "").toUpperCase(); return p === "COVER" ? "cover" : p === "BRACKET" ? "bracket" : "regular"; }

  async function cancelOrder(order: OrderModel) {
    if (!order.order_id || !order.exchange) return;
    const family = orderFamily(order);
    const orderId = String(order.order_id).trim();
    setCancelBusy(orderId);
    setCancelMessage("");
    setCancelMessageIsError(false);
    try {
      const response = await apiClient.delete(
        orderCancelPath(family, order.exchange, orderId, order.validity, order.validity_days ?? 0),
        {},
      );
      const message = response.success ? "Order cancellation request submitted successfully." : (response.message || "Unable to cancel order.");
      setCancelMessageIsError(!response.success);
      setCancelMessage(message);
      if (response.success) rawAllOrders.reload();
    } catch (error) {
      setCancelMessageIsError(true);
      setCancelMessage(error instanceof Error ? error.message : "Unable to cancel order.");
    } finally {
      setCancelBusy(null);
    }
  }

  function canModifyOrder(o: OrderModel) {
    const status = String(o.status ?? "").toUpperCase();
    const pending = o.pending_quantity ?? Math.max(0, o.quantity - (o.filled_quantity ?? 0));
    return Boolean(o.exchange && o.order_id && pending > 0 && !/COMPLETE|EXECUT|FILLED|CANCEL|REJECT|ERROR/.test(status));
  }

  function openModify(order: OrderModel) {
    setModify({
      order,
      qty: Math.max(1, order.quantity),
      price: order.price ? String(order.price) : "",
      trigger: order.trigger_price ? String(order.trigger_price) : "",
      disclosed: order.disclosed_quantity ?? 0,
      validity: validityFromApi(String(order.validity || "DAY")),
      validityDays: order.validity_days ?? 0,
      orderType: String(order.order_type || "RL-MKT"),
    });
    setModifyMessage("");
  }

  async function submitModify() {
    if (!modify) return;
    const { order, qty, price, trigger, disclosed, validity, validityDays, orderType } = modify;
    if (!order.exchange || !order.order_id || qty <= 0) return;
    setModifyBusy(true);
    setModifyMessage("");
    try {
      const product = String(order.product_type ?? "").toUpperCase();
      const family = product === "COVER" ? "cover" : product === "BRACKET" ? "bracket" : "regular";
      let body: Record<string, any>;
      if (family === "cover") {
        body = { main_leg: { order_type: orderType, quantity: qty, traded_quantity: order.filled_quantity ?? 0, price: Number(price) || 0 }, stoploss_leg: { legs: [{ quantity: 0, price: Number(order.raw?.stoploss_price ?? order.trigger_price ?? 0), trigger_price: Number(trigger) || 0 }] } };
      } else if (family === "bracket") {
        body = { main_leg: { order_type: orderType, quantity: qty, price: Number(price) || 0, trigger_price: 0, traded_quantity: order.filled_quantity ?? 0 }, stoploss_leg: { legs: [{ quantity: 0, price: Number(order.raw?.stoploss_price ?? order.trigger_price ?? 0), trigger_price: Number(trigger) || 0 }], trail: { ltp_jump_price: Number(order.raw?.ltp_jump_price ?? 0), stoploss_jump_price: Number(order.raw?.stoploss_jump_price ?? 0) } }, profit_leg: { legs: [{ quantity: 0, price: Number(order.raw?.target_price ?? 0) }] }, order_identifier: order.order_identifier ?? "", fields_modified: { main_leg_price: true, main_leg_qty: true, stoploss_leg_price: true, stoploss_trail_price: true, profit_leg_price: true } };
      } else {
        body = { order_type: orderType, quantity: qty, traded_quantity: order.filled_quantity ?? 0, price: Number(price) || 0, trigger_price: Number(trigger) || 0, disclosed_quantity: disclosed, validity: validityToApi(validity, order.exchange), validity_days: validityDays };
        if (validity.toUpperCase() === "GTD" && order.order_timestamp) body.order_time = order.order_timestamp;
      }
      const res = await apiClient.put(orderModifyPath(family, order.exchange, order.order_id), body);
      setModifyMessage(res.success ? "Order modification request sent to OMS." : (res.message || "Unable to modify order."));
      if (res.success) {
        setModify(null);
        rawAllOrders.reload();
      }
    } catch (error) {
      setModifyMessage(error instanceof Error ? error.message : "Unable to modify order.");
    } finally {
      setModifyBusy(false);
    }
  }

  function openPositionAction(kind: "increase" | "close" | "convert", position: PositionModel) {
    if (position.net_quantity === 0) return;
    setAction(kind);
    setActionPosition(position);
    setActionQty(Math.abs(position.net_quantity));
    setActionOrderType("RL-MKT");
    setActionPrice("");
    setTargetProduct(String(position.product_type).toUpperCase() === "INTRADAY" ? "DELIVERY" : "INTRADAY");
    setActionMessage("");
  }

  async function submitPositionAction() {
    if (!action || !actionPosition || actionQty <= 0) return;
    setActionBusy(true);
    setActionMessage("");
    try {
      const exchange = actionPosition.preferred_exchange || actionPosition.exchange;
      const token = Number(actionPosition.preferred_scrip_token ?? actionPosition.scrip_token);
      if (!exchange || !Number.isFinite(token) || token <= 0) throw new Error("Position exchange/token is unavailable.");

      if (action === "close" || action === "increase") {
        const side = action === "close"
          ? (actionPosition.net_quantity >= 0 ? "SELL" : "BUY")
          : (actionPosition.net_quantity >= 0 ? "BUY" : "SELL");

        const response = await apiClient.post(Endpoints.orders.regular, {
          scrip_info: {
            exchange,
            scrip_token: token,
            symbol: actionPosition.symbol || "",
            series: actionPosition.series || "",
            expiry_date: actionPosition.expiry_date || "",
            strike_price: actionPosition.strike_price || "",
            option_type: actionPosition.option_type || "",
          },
          transaction_type: side,
          product_type: actionPosition.product_type,
          order_type: actionOrderType,
          quantity: actionQty,
          price: actionOrderType === "RL" ? Number(actionPrice) || 0 : 0,
          trigger_price: 0,
          disclosed_quantity: 0,
          validity: validityToApi("DAY", exchange),
          validity_days: 0,
          is_amo: false,
          order_identifier: "",
        });

        if (!response.success) throw new Error(response.message || `${action === "close" ? "Close" : "Increase"} position request failed.`);
        setAction(null);
      } else {
        const side = actionPosition.net_quantity >= 0 ? "BUY" : "SELL";
        const response = await apiClient.put(Endpoints.positions.conversion, {
          exchange,
          scrip_token: token,
          transaction_type: side,
          quantity: actionQty,
          old_product_type: actionPosition.product_type,
          new_product_type: targetProduct,
          bo_order_id: "",
        });
        if (!response.success) throw new Error(response.message || "Product conversion request failed.");
        setAction(null);
      }
      rawPositions.reload();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setActionBusy(false);
    }
  }

  function openHoldingAction(holding: HoldingModel, side: TransactionType) {
    const rawSecs =
      holding.security_info && holding.security_info.length > 0
        ? holding.security_info
        : [
            {
              exchange: holding.exchange || "",
              scrip_token: holding.scrip_token,
              symbol: holding.trading_symbol,
            },
          ];

    const securityMap = new Map<string, Instrument>();

    for (const sec of rawSecs as any[]) {
      const rawExchange = String(sec.exchange || holding.exchange || "").trim().toUpperCase();
      const isNse = rawExchange.includes("NSE");
      const isBse = rawExchange.includes("BSE");

      if (!isNse && !isBse) continue;

      const token = String(sec.scrip_token ?? sec.scripToken ?? sec.token ?? "").trim();
      if (!token || token === "0") continue;

      const exchangeSegment = isBse ? "BSE_EQ" : "NSE_EQ";
      const marketSegmentId = isBse ? 3 : 1;
      const symbol = String(sec.symbol || holding.trading_symbol || holding.isin || "").trim();

      const instrument = {
        exchange: exchangeSegment,
        exchangeSegment,
        marketSegmentId,
        token,
        scrip_token: Number(token),
        symbol,
        tradingSymbol: symbol,
        companyName: holding.trading_symbol || symbol,
        isin: holding.isin,
      } as Instrument;

      const key = `${marketSegmentId}_${token}`;
      if (!securityMap.has(key)) {
        securityMap.set(key, instrument);
      }
    }

    const cashOptions = Array.from(securityMap.values()).sort((a, b) => {
      const aIsNse = String(a.exchangeSegment || a.exchange).toUpperCase().includes("NSE");
      const bIsNse = String(b.exchangeSegment || b.exchange).toUpperCase().includes("NSE");
      if (aIsNse === bIsNse) return 0;
      return aIsNse ? -1 : 1;
    });

    if (cashOptions.length === 0) return;

    const primaryInstrument = cashOptions[0];
    const instrument = {
      ...primaryInstrument,
      security_info: cashOptions,
    } as Instrument;

    const bestObj = getBestHoldingLtp(holding);

    setHoldingInstrument(instrument);
    setHoldingSide(side);
    setHoldingQty(side === "SELL" ? Math.max(1, holding.quantity) : 1);
    setHoldingPrice(bestObj.ltp || holding.ltp || holding.avg_price || 0);
    setHoldingTicketOpen(true);
  }

  const activeColumnDefs = COLUMN_DEFS[tab].filter((c) => columnPrefs[tab].includes(c.key)).sort((a, b) => columnPrefs[tab].indexOf(a.key) - columnPrefs[tab].indexOf(b.key));
  function toggleColumn(key: string) {
    setColumnPrefs((prev) => {
      const current = prev[tab];
      const exists = current.includes(key);
      if (exists && current.length === 1) return prev;
      return { ...prev, [tab]: exists ? current.filter((k) => k !== key) : [...current, key] };
    });
  }
  function moveColumn(from: string, to: string) {
    if (!from || !to || from === to) return;
    setColumnPrefs((prev) => {
      const next = [...prev[tab]];
      const fromIndex = next.indexOf(from); const toIndex = next.indexOf(to);
      if (fromIndex < 0 || toIndex < 0) return prev;
      next.splice(fromIndex, 1); next.splice(toIndex, 0, from);
      return { ...prev, [tab]: next };
    });
  }
  function toggleColumnMenu(e: React.MouseEvent<HTMLButtonElement>) {
    if (columnMenuOpen) { setColumnMenuOpen(false); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const MENU_W = 288, GAP = 6, MARGIN = 12;
    const spaceAbove = rect.top - MARGIN;
    const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
    const left = Math.max(MARGIN, Math.min(rect.right - MENU_W, window.innerWidth - MENU_W - MARGIN));
    if (spaceAbove >= spaceBelow) {
      setColumnMenuPos({ left, bottom: window.innerHeight - rect.top + GAP, maxHeight: Math.min(480, spaceAbove - GAP) });
    } else {
      setColumnMenuPos({ left, top: rect.bottom + GAP, maxHeight: Math.min(480, spaceBelow - GAP) });
    }
    setColumnMenuOpen(true);
  }
  function resetColumns() { setColumnPrefs((prev) => ({ ...prev, [tab]: defaultColumnPrefs()[tab] })); }
  function cellForOrder(o: OrderModel, key: string, allowAction: boolean) {
    switch (key) {
      case "time": return formatTradeTime(o.order_timestamp);
      case "symbol": return orderDisplaySymbol(o) || "—";
      case "side": return <Badge tone={o.transaction_type === "BUY" ? "buy" : "sell"}>{o.transaction_type}</Badge>;
      case "product": return displayProductType(o.product_type, o.exchange, o.raw?._InstrumentName);
      case "type": return o.order_type || "—";
      case "qty": return o.filled_quantity ?? 0;
      case "reqQty": return o.quantity;
      case "price": return formatCurrency(o.price);
      case "trigger": return o.trigger_price ? formatCurrency(o.trigger_price) : "—";
      case "orderId": return o.exchange_order_no || "—";
      case "internalOrderId": return o.internal_order_id || o.order_id || "—";
      case "status": return <Badge tone={orderStatusTone(o.status)}>{o.status}</Badge>;
      case "action": return allowAction && canModifyOrder(o) ? <div className="flex justify-end gap-1.5"><button onClick={() => openModify(o)} className={ACTION_BTN_PRIMARY}>Modify</button><button disabled={cancelBusy === o.order_id} onClick={() => cancelOrder(o)} className={ACTION_BTN_SELL}>{cancelBusy === o.order_id ? "Cancelling…" : "Cancel"}</button></div> : "—";
      default: return "—";
    }
  }
  function cellForTrade(t: any, key: string) {
    switch (key) {
      case "tradeTime": return formatTradeTime(t.trade_timestamp);
      case "symbol": return orderDisplaySymbol(t) || "—";
      case "side": return <Badge tone={t.transaction_type === "BUY" ? "buy" : "sell"}>{t.transaction_type}</Badge>;
      case "product": return displayProductType(t.product_type || "", t.exchange) || "—";
      case "execQty": return t.quantity;
      case "execPrice": return formatCurrency(t.price);
      case "type": return t.order_type || "—";
      case "tradeId": return t.trade_id || "—";
      case "orderId": return tradeOrderDisplayId(t, liveAllOrders) || "—";
      case "internalOrderId": return t.internal_order_id || "—";
      default: return "—";
    }
  }
  function cellForPosition(p: PositionModel, key: string) {
    const isZero = p.net_quantity === 0;
    const instrument = positionFeedInstrument(p);
    const quoteKey = instrument ? feedToken(instrument) : null;
    const ltp = quoteKey ? Number(positionQuotes[quoteKey]?.ltp) : 0;
    const mtm = positionMtm(p, ltp);
    switch (key) {
      case "symbol": return <>{positionDisplaySymbol(p)}<span className="ml-1.5 font-normal text-aveon-muted">{p.preferred_exchange || p.exchange}</span></>;
      case "product": return displayProductType(p.product_type, p.preferred_exchange || p.exchange, p.instrument);
      case "netQty": return p.net_quantity;
      case "netPrice": return formatCurrency(p.net_price || (p.net_quantity >= 0 ? p.avg_buy_price : p.avg_sell_price));
      case "ltp": return ltp > 0 ? formatCurrency(ltp) : "—";
      case "netValue": return <span className={signedTextClass(p.net_value)}>{formatCurrency(p.net_value)}</span>;
      case "mtm": return mtm == null ? "—" : <span className={signedTextClass(mtm)}>{formatCurrency(mtm)}</span>;
      case "buyQty": return p.buy_quantity;
      case "buyPrice": return formatCurrency(p.avg_buy_price);
      case "sellQty": return p.sell_quantity;
      case "sellPrice": return formatCurrency(p.avg_sell_price);
      case "action": return (
        <div className="flex justify-end gap-1.5">
          <button disabled={isZero} title="Increase position" onClick={() => openPositionAction("increase", p)} className={`${ACTION_BTN_BUY} ${isZero ? "opacity-50 cursor-not-allowed" : ""}`}>Increase</button>
          <button disabled={isZero} title="Close position" onClick={() => openPositionAction("close", p)} className={`${ACTION_BTN_SELL} ${isZero ? "opacity-50 cursor-not-allowed" : ""}`}>Close</button>
          {(String(p.product_type).toUpperCase() === "INTRADAY" || String(p.product_type).toUpperCase() === "DELIVERY") && (
            <button disabled={isZero} title="Convert product" onClick={() => openPositionAction("convert", p)} className={`${ACTION_BTN_PRIMARY} ${isZero ? "opacity-50 cursor-not-allowed" : ""}`}>Convert</button>
          )}
        </div>
      );
      default: return "—";
    }
  }
  function cellForHolding(h: HoldingModel, key: string) {
    const bestObj = getBestHoldingLtp(h);
    const ltp = bestObj.ltp;
    const currentValue = h.quantity * (ltp > 0 ? ltp : h.avg_price);
    const pnl = ltp > 0 ? (ltp - h.avg_price) * h.quantity : (h.pnl || 0);

    switch (key) {
      case "symbol": return h.trading_symbol;
      case "qty": return h.quantity;
      case "avgPrice": return formatCurrency(h.avg_price);
      case "nseLtp": return getHoldingExchangeLtp(h, "NSE") > 0 ? formatCurrency(getHoldingExchangeLtp(h, "NSE")) : "—";
      case "bseLtp": return getHoldingExchangeLtp(h, "BSE") > 0 ? formatCurrency(getHoldingExchangeLtp(h, "BSE")) : "—";
      case "ltp": return ltp > 0 ? formatCurrency(ltp) : "—";
      case "currentValue": return formatCurrency(currentValue);
      case "pnl": return <span className={signedTextClass(pnl)}>{formatCurrency(pnl)}</span>;
      case "action": return (
        <div className="flex justify-end gap-1.5">
          <button title="Buy more (Increase)" onClick={() => openHoldingAction(h, "BUY")} className={ACTION_BTN_BUY}>Buy</button>
          <button disabled={h.quantity <= 0} title="Sell (Decrease)" onClick={() => openHoldingAction(h, "SELL")} className={`${ACTION_BTN_SELL} ${h.quantity <= 0 ? "opacity-50 cursor-not-allowed" : ""}`}>Sell</button>
        </div>
      );
      default: return "—";
    }
  }

  const isMaximized = size === "maximized";

  const panel = (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className={
        "relative w-full min-w-0 max-w-full overflow-hidden " + (isMaximized
          ? "flex h-full w-full flex-col rounded-aveon border border-aveon-border bg-aveon-panel shadow-2xl"
          : `flex ${size === "minimized" ? "h-10" : "h-64"} flex-col rounded-aveon border border-aveon-border bg-aveon-panel transition-[height] duration-150`)
      }
    >
      <div className="flex shrink-0 items-center justify-between border-b border-aveon-border px-2 py-1.5">
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 pr-1">
          {TABS.map((t) => {
            const active = tab === t;
            const count =
              !active ? 0
              : t === "Open Orders" || t === "Order Book (All)" ? orders.length
              : t === "Net Position" ? positions.length
              : t === "DP Holding" ? holdings.length
              : 0;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex shrink-0 items-center gap-2 rounded-[4px] border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? "border-aveon-primary bg-aveon-primary text-white shadow-sm"
                    : "border-aveon-border bg-aveon-panel2 text-aveon-muted hover:border-aveon-primary/60 hover:text-aveon-text"
                }`}
              >
                {t}
                {count > 0 && <span className="rounded-[3px] bg-white/25 px-1.5 py-px text-[10px] font-bold leading-4">{count}</span>}
              </button>
            );
          })}
        </div>
        <div className="flex shrink-0 items-center gap-1 pl-2">
          <button
            title={size === "minimized" ? "Restore" : "Minimize"}
            onClick={() => setSize(size === "minimized" ? "normal" : "minimized")}
            className="rounded p-1 text-aveon-muted hover:bg-aveon-panel2 hover:text-aveon-text"
          >
            {size === "minimized" ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            title={isMaximized ? "Restore" : "Maximize"}
            onClick={() => setSize(isMaximized ? "normal" : "maximized")}
            className="rounded p-1 text-aveon-muted hover:bg-aveon-panel2 hover:text-aveon-text"
          >
            {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {size !== "minimized" && (
        <div className="min-h-0 min-w-0 w-full max-w-full flex-1 overflow-hidden">
        {(tab === "Open Orders" || tab === "Order Book (All)") && (
          <Table
            loading={rawAllOrders.loading}
            empty={orders.length === 0}
            emptyLabel="No orders yet."
            columns={activeColumnDefs}
            onColumns={toggleColumnMenu}
          >
            {orders.map((o, i) => (
              <tr key={o.order_id || i} className="table-row-hover border-b border-aveon-border/40">
                {activeColumnDefs.map((col) => <Td key={col.key} align={isRightAligned(col.key) ? 'right' : undefined} className={cellClass(col.key, activeColumnDefs)}>{cellForOrder(o, col.key, tab === "Open Orders")}</Td>)}
              </tr>
            ))}
          </Table>
        )}

        {tab === "Trade Book" && (
          <Table loading={rawTrades.loading} empty={trades.length === 0} emptyLabel="No trades today." columns={activeColumnDefs} onColumns={toggleColumnMenu}>
            {trades.map((t, i) => <tr key={t.trade_id || i} className="table-row-hover border-b border-aveon-border/40">
              {activeColumnDefs.map((col) => <Td key={col.key} align={isRightAligned(col.key) ? 'right' : undefined} className={cellClass(col.key, activeColumnDefs)}>{cellForTrade(t, col.key)}</Td>)}
            </tr>)}
          </Table>
        )}

        {tab === "Net Position" && (
          <div className="h-full">
            <Table loading={rawPositions.loading} empty={positions.length === 0} emptyLabel="No open positions." columns={activeColumnDefs} onColumns={toggleColumnMenu}>
              {positions.map((p, i) => <tr key={`${p.exchange}-${p.scrip_token}-${p.product_type}-${i}`} className="table-row-hover border-b border-aveon-border/40">
                {activeColumnDefs.map((col) => <Td key={col.key} align={isRightAligned(col.key) ? 'right' : undefined} className={cellClass(col.key, activeColumnDefs)}>{cellForPosition(p, col.key)}</Td>)}
              </tr>)}
            </Table>
          </div>
        )}

        {tab === "DP Holding" && (
          <Table loading={rawHoldings.loading} empty={holdings.length === 0} emptyLabel="No holdings." columns={activeColumnDefs} onColumns={toggleColumnMenu}>
            {holdings.map((h, i) => <tr key={i} className="table-row-hover border-b border-aveon-border/40">
              {activeColumnDefs.map((col) => <Td key={col.key} align={isRightAligned(col.key) ? 'right' : undefined} className={cellClass(col.key, activeColumnDefs)}>{cellForHolding(h, col.key)}</Td>)}
            </tr>)}
          </Table>
        )}
      </div>
      )}
    </div>
  );

  const columnMenu = mounted && columnMenuOpen && size !== "minimized" ? createPortal(
    <div
      ref={columnMenuRef}
      style={{ position: "fixed", left: columnMenuPos.left, top: columnMenuPos.top, bottom: columnMenuPos.bottom, maxHeight: columnMenuPos.maxHeight }}
      className="z-[2147483647] flex w-72 flex-col rounded-lg border border-aveon-border bg-aveon-panel p-3 shadow-2xl"
    >
      <div className="mb-2 flex shrink-0 items-center justify-between"><div><p className="text-xs font-semibold text-aveon-text">Columns</p><p className="text-[10px] text-aveon-muted">Drag to reorder · uncheck to hide</p></div><button onClick={resetColumns} className="text-[10px] text-aveon-primary hover:underline">Reset</button></div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {COLUMN_DEFS[tab].map((col) => <div key={col.key} draggable={columnPrefs[tab].includes(col.key)} onDragStart={() => setDragColumn(col.key)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragColumn) moveColumn(dragColumn, col.key); setDragColumn(null); }} className="flex items-center gap-2 rounded-md border border-transparent px-2 py-1.5 hover:border-aveon-border hover:bg-aveon-panel2">
          <GripVertical size={13} className="shrink-0 cursor-grab text-aveon-muted" />
          <input type="checkbox" checked={columnPrefs[tab].includes(col.key)} onChange={() => toggleColumn(col.key)} />
          <span className="text-[11px] text-aveon-text">{col.label}</span>
        </div>)}
      </div>
    </div>,
    document.body
  ) : null;

  const cancelMessageDialog = cancelMessage ? (
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-aveon-border bg-aveon-panel p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${cancelMessageIsError ? "bg-aveon-sell/15 text-aveon-sell" : "bg-aveon-buy/15 text-aveon-buy"}`}>
            {cancelMessageIsError ? "!" : "✓"}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-aveon-text">{cancelMessageIsError ? "Cancellation Failed" : "Cancellation Request"}</h3>
            <p className="mt-1 text-xs leading-5 text-aveon-muted">{cancelMessage}</p>
          </div>
          <button onClick={() => setCancelMessage("")} className="rounded p-1 text-aveon-muted hover:bg-aveon-panel2" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={() => setCancelMessage("")} className="rounded-md bg-aveon-primary px-5 py-2 text-xs font-semibold text-white hover:opacity-90">OK</button>
        </div>
      </div>
    </div>
  ) : null;

  const modifyDialog = modify ? (
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/65 p-4">
      <div className="w-full max-w-lg rounded-xl border border-aveon-border bg-aveon-panel p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-aveon-text">Modify Order</h3>
            <p className="text-[11px] text-aveon-muted">{orderDisplaySymbol(modify.order)} · {modify.order.exchange}</p>
          </div>
          <button onClick={() => setModify(null)} className="rounded p-1 text-aveon-muted hover:bg-aveon-panel2"><X size={16} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(() => { const type = String(modify.orderType).trim().toUpperCase(); const market = type.includes("MKT") || type === "MARKET"; const stop = type === "SL" || type === "SL-MKT" || type.includes("STOP"); const fieldClass = "mt-1 w-full rounded-md border border-aveon-border bg-aveon-panel2 px-2 py-2 text-sm text-aveon-text outline-none focus:border-aveon-primary disabled:cursor-not-allowed disabled:opacity-50"; return <>
            <label className="text-[11px] text-aveon-muted">Order Type<select value={modify.orderType} onChange={(e) => setModify({ ...modify, orderType: e.target.value, price: e.target.value.includes("MKT") ? "" : modify.price, trigger: e.target.value.startsWith("SL") ? modify.trigger : "" })} className={fieldClass}><option value="RL">Limit</option><option value="RL-MKT">Market</option><option value="SL">Stop Limit</option><option value="SL-MKT">Stop Market</option></select></label>
            <label className="text-[11px] text-aveon-muted">Quantity<input type="number" min={1} value={modify.qty} onChange={(e) => setModify({ ...modify, qty: Number(e.target.value) })} className={fieldClass} /></label>
            <label className="text-[11px] text-aveon-muted">Price<input type="number" min={0} disabled={market} value={modify.price} onChange={(e) => setModify({ ...modify, price: e.target.value })} className={fieldClass} /></label>
            <label className="text-[11px] text-aveon-muted">Trigger Price<input type="number" min={0} disabled={!stop} value={modify.trigger} onChange={(e) => setModify({ ...modify, trigger: e.target.value })} className={fieldClass} /></label>
            <label className="text-[11px] text-aveon-muted">Disclosed Qty<input type="number" min={0} max={modify.qty} value={modify.disclosed} onChange={(e) => setModify({ ...modify, disclosed: Number(e.target.value) })} className={fieldClass} /></label>
            <label className="text-[11px] text-aveon-muted">Validity<select value={modify.validity} onChange={(e) => setModify({ ...modify, validity: e.target.value })} className={fieldClass}>{String(modify.order.exchange ?? "").toUpperCase().includes("BSE") && <option>EOS</option>}<option>DAY</option><option>IOC</option><option>GTD</option></select></label>
            {modify.validity === "GTD" && <label className="text-[11px] text-aveon-muted">Validity Days<input type="number" min={1} value={modify.validityDays} onChange={(e) => setModify({ ...modify, validityDays: Number(e.target.value) })} className={fieldClass} /></label>}
          </>; })()}
        </div>
        <p className="mt-2 text-[10px] text-aveon-muted">Market orders do not use a limit price. Trigger price is available for stop orders.</p>
        {modifyMessage && <div className="mt-3 rounded-md border border-aveon-border bg-aveon-panel2 p-2 text-[11px] text-aveon-text">{modifyMessage}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={() => setModify(null)} className="rounded-md border border-aveon-border px-3 py-2 text-xs text-aveon-muted">Cancel</button>
          <button disabled={modifyBusy || !Number.isFinite(modify.qty) || modify.qty <= 0 || modify.disclosed < 0 || modify.disclosed > modify.qty || (!(String(modify.orderType).toUpperCase().includes("MKT")) && !(Number(modify.price) > 0)) || ((String(modify.orderType).toUpperCase().startsWith("SL")) && !(Number(modify.trigger) > 0)) || (modify.validity === "GTD" && modify.validityDays < 1)} onClick={submitModify} className="rounded-md bg-aveon-primary px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{modifyBusy ? "Submitting…" : "Modify Order"}</button>
        </div>
      </div>
    </div>
  ) : null;

  const actionDialog = action && actionPosition ? (
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl border border-aveon-border bg-aveon-panel p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-aveon-text">{action === "increase" ? "Increase Position" : action === "close" ? "Close Position" : "Product Conversion"}</h3>
            <p className="text-[11px] text-aveon-muted">{actionPosition.symbol} · {actionPosition.product_type}</p>
          </div>
          <button onClick={() => setAction(null)} className="rounded p-1 text-aveon-muted hover:bg-aveon-panel2"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-aveon-muted">Quantity
              <input
                ref={qtyInputRef}
                type="number"
                min={1}
                max={action === "close" ? Math.abs(actionPosition.net_quantity) : undefined}
                value={actionQty}
                onChange={(e) => {
                  const val = Number(e.target.value) || 1;
                  const limit = action === "close" ? Math.abs(actionPosition.net_quantity) : 999999;
                  setActionQty(Math.max(1, Math.min(limit, val)));
                }}
                className="mt-1 w-full rounded-md border border-aveon-border bg-aveon-panel2 px-2 py-2 text-sm text-aveon-text outline-none focus:border-aveon-primary"
              />
            </label>
            <div className="rounded-md border border-aveon-border bg-aveon-panel2 p-2 text-[11px]">
              <span className="text-aveon-muted">Direction</span>
              <p className="mt-1 font-semibold">{actionPosition.net_quantity >= 0 ? (action === "close" ? "SELL" : "BUY") : (action === "close" ? "BUY" : "SELL")}</p>
            </div>
          </div>

          {(action === "close" || action === "increase") && (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-aveon-muted">Order Type
                <select
                  value={actionOrderType}
                  onChange={(e) => setActionOrderType(e.target.value)}
                  className="mt-1 w-full rounded-md border border-aveon-border bg-aveon-panel2 px-2 py-2 text-sm text-aveon-text outline-none focus:border-aveon-primary"
                >
                  <option value="RL-MKT">Market</option>
                  <option value="RL">Limit</option>
                </select>
              </label>
              {actionOrderType === "RL" ? (
                <label className="text-[11px] text-aveon-muted">Price
                  <input
                    type="number"
                    min={0}
                    step={0.05}
                    value={actionPrice}
                    onChange={(e) => setActionPrice(e.target.value)}
                    placeholder="Limit price"
                    className="mt-1 w-full rounded-md border border-aveon-border bg-aveon-panel2 px-2 py-2 text-sm text-aveon-text outline-none focus:border-aveon-primary"
                  />
                </label>
              ) : (
                <div className="rounded-md border border-aveon-border bg-aveon-panel2 p-2 text-[11px]">
                  <span className="text-aveon-muted">Execution</span>
                  <p className="mt-1 font-semibold">At Market</p>
                </div>
              )}
            </div>
          )}

          {action === "convert" && (
            <label className="block text-[11px] text-aveon-muted">Convert to
              <select value={targetProduct} onChange={(e) => setTargetProduct(e.target.value)} className="mt-1 w-full rounded-md border border-aveon-border bg-aveon-panel2 px-2 py-2 text-sm text-aveon-text">
                <option value="DELIVERY">Delivery</option>
                <option value="INTRADAY">Intraday</option>
              </select>
            </label>
          )}
        </div>

        {actionMessage && <div className="mt-3 rounded-md border border-aveon-border bg-aveon-panel2 p-2 text-[11px] text-aveon-text">{actionMessage}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={() => setAction(null)} className="rounded-md border border-aveon-border px-3 py-2 text-xs text-aveon-muted hover:bg-aveon-panel2">Cancel</button>
          <button disabled={actionBusy || actionQty <= 0 || (actionOrderType === "RL" && !(Number(actionPrice) > 0))} onClick={submitPositionAction} className="rounded-md bg-aveon-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {actionBusy ? "Processing…" : action === "increase" ? "Increase Position" : action === "close" ? "Close Position" : "Convert"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const holdingTicket = holdingTicketOpen && holdingInstrument ? (
    <OrderTicketModal
      open={holdingTicketOpen}
      instrument={holdingInstrument}
      cashOptions={(((holdingInstrument as Instrument & { security_info?: Instrument[] }).security_info) ?? [holdingInstrument])}
      quotes={Object.fromEntries(Object.entries(holdingQuotes).map(([key, quote]) => [key, quote]))}
      initialSide={holdingSide}
      initialProductType="CNC"
      initialQuantity={holdingQty}
      initialPrice={holdingPrice}
      onClose={() => setHoldingTicketOpen(false)}
      onOrderPlaced={() => {
        setHoldingTicketOpen(false);
        rawHoldings.reload();
      }}
    />
  ) : null;

  if (isMaximized) {
    return (
      <>
        <div className="flex h-10 items-center rounded-aveon border border-aveon-border bg-aveon-panel px-3 text-xs text-aveon-muted">
          Panel maximized
        </div>
        {mounted &&
          createPortal(
            <>
              <div className="fixed inset-0 z-[2147483646] bg-aveon-bg/95" />
              <div
                role="dialog"
                aria-modal="true"
                aria-label={`${tab} panel`}
                className="fixed inset-0 z-[2147483647] p-4"
              >
                {panel}
              </div>
              {actionDialog}
              {modifyDialog}
              {cancelMessageDialog}
              {holdingTicket}
            </>,
            document.body
          )}
        {columnMenu}
      </>
    );
  }

  return <>
    {panel}
    {actionDialog}
    {modifyDialog}
    {cancelMessageDialog}
    {holdingTicket}
  </>;
}

function Table({
  columns,
  children,
  loading,
  empty,
  emptyLabel,
  onColumns,
}: {
  columns: ColumnDef[];
  children: React.ReactNode;
  loading: boolean;
  empty: boolean;
  emptyLabel: string;
  onColumns?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  if (loading) return <p className="p-3 text-xs text-aveon-muted">Loading…</p>;
  if (empty) return <p className="p-3 text-xs text-aveon-muted">{emptyLabel}</p>;
  return (
    <div className="relative h-full w-full min-w-0 max-w-full">
      <button data-column-toggle title="Choose and reorder columns" onClick={onColumns} className="absolute right-3 top-0.5 z-20 rounded p-1 text-aveon-muted hover:bg-aveon-panel2 hover:text-aveon-text"><Columns3 size={13} /></button>
      <div className="h-full w-full overflow-auto overscroll-x-contain">
      <div className="w-max min-w-full">
        <table className="w-full table-auto text-[11px] leading-tight">
          <thead className="sticky top-0 z-10 border-b border-aveon-border bg-aveon-panel text-left text-[10px] text-aveon-muted [&_th:last-child]:pr-9">
            <tr>{columns.map((c, i) => <th key={c.key} className={`whitespace-nowrap px-3 py-1.5 font-medium ${isRightAligned(c.key) ? "text-right" : "text-left"} ${c.key === "action" && i === columns.length - 1 ? `${ACTION_STICKY} z-20` : ""}`}>{c.label}</th>)}</tr>
          </thead>
          <tbody className="[&_td:last-child]:pr-9">{children}</tbody>
        </table>
      </div>
      </div>
    </div>
  );
}

function Td({ children, align, className }: { children: React.ReactNode; align?: "right"; className?: string }) {
  return <td className={`px-3 py-1.5 whitespace-nowrap text-[11px] leading-tight ${align === "right" ? "text-right tabular-nums" : ""} ${className ?? ""}`}>{children}</td>;
}
