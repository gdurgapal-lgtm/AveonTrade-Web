"use client";

import { useMemo, useState, useEffect, type ReactNode, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Badge, Button, Card, EmptyState, Input, Select } from "@/components/ui/Primitives";
import { LIVE_ORDERS, LIVE_TRADES, usePolledData } from "@/hooks/usePolledData";
import { apiClient } from "@/lib/apiClient";
import { Endpoints, gtdOrderBookPath, orderBookPath, orderCancelPath, orderHistoryPath, orderModifyPath, tradeBookPath } from "@/lib/endpoints";
import { formatCurrency } from "@/lib/format";
import { useLiveOrderStore } from "@/lib/liveOrderStore";
import { displayProductType, validityFromApi, validityToApi, extractList, isOpenOrder, normalizeOrder, normalizeTrade, mergeTradeRows, sortOrdersNewestFirst, orderDisplaySymbol, orderStatusTone, type OrderModel, type RawOrderModel, type RawTradeModel, type TradeModel, tradeOrderDisplayId } from "@/types/trading";

const ORDER_TABS = ["Pending", "Traded", "GTD", "All"] as const;
type OrderTab = (typeof ORDER_TABS)[number];

type ModifyState = { order: OrderModel; qty: number; price: string; trigger: string; disclosed: number; validity: string; validityDays: number; orderType: string } | null;

function OrdersContent() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as OrderTab) || "Pending";
  const [tab, setTab] = useState<OrderTab>(initialTab);

  useEffect(() => {
    const t = searchParams.get("tab") as OrderTab;
    if (t) setTab(t);
  }, [searchParams]);

  const [query, setQuery] = useState("");
  const [side, setSide] = useState("ALL");
  const [product, setProduct] = useState("ALL");
  const [exchange, setExchange] = useState("ALL");
  const [modify, setModify] = useState<ModifyState>(null);
  const [historyOrder, setHistoryOrder] = useState<OrderModel | null>(null);
  const [historyData, setHistoryData] = useState<OrderModel[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [popupMessage, setPopupMessage] = useState("");
  const [exportOpen, setExportOpen] = useState(false);

  // Live in-memory store updated instantly by WebSocket events
  const { orders: liveOrders, allOrders: liveAllOrders, trades: liveTrades } = useLiveOrderStore();


  const pending = usePolledData<RawOrderModel[]>(orderBookPath(1, 100, 1), 15_000, tab === "Pending", LIVE_ORDERS);
  const all = usePolledData<RawOrderModel[]>(orderBookPath(1, 100, -1), 20_000, tab === "All");
  const gtd = usePolledData<RawOrderModel[]>(gtdOrderBookPath(1, 100, -1), 20_000, tab === "GTD", LIVE_ORDERS);
  const trades = usePolledData<RawTradeModel[]>(tradeBookPath(1, 100), 20_000, tab === "Traded", LIVE_TRADES);


  const activeOrdersState = tab === "Pending" ? pending : tab === "All" ? all : gtd;
  
  const orders = useMemo(() => {
    if (tab === "Pending") return sortOrdersNewestFirst(liveOrders.filter(isOpenOrder));
    const restOrders = extractList<RawOrderModel>(activeOrdersState.data, ["orders", "orderBook", "order_book", "items", "records"]).map(normalizeOrder);
    if (tab !== "All") return sortOrdersNewestFirst(restOrders);

    // Keep the REST result visible while the central snapshot is loading or if
    // the stream is unavailable. Overlay socket records by order identity so
    // the latest cancel/modify/status event wins without hiding older orders.
    const merged = new Map<string, OrderModel>();
    for (const order of restOrders) if (order.order_id) merged.set(order.order_id, order);
    for (const order of liveAllOrders) if (order.order_id) merged.set(order.order_id, order);
    const identified = Array.from(merged.values());
    const unidentified = restOrders.filter((order) => !order.order_id);
    return sortOrdersNewestFirst([...identified, ...unidentified]);
  }, [liveOrders, liveAllOrders, activeOrdersState.data, tab]);

  const tradeRows = useMemo(() => {
    const restRows = extractList<RawTradeModel>(trades.data, ["trades", "tradeBook", "trade_book", "items", "records"]).map(normalizeTrade);
    return mergeTradeRows(restRows, liveTrades);
  }, [liveTrades, trades.data]);

  const filteredOrders = useMemo(() => filterOrders(orders, query, side, product, exchange), [orders, query, side, product, exchange]);
  const filteredTrades = useMemo(() => filterTrades(tradeRows, query, side, product, exchange), [tradeRows, query, side, product, exchange]);

  const options = useMemo(() => ({
    sides: ["ALL", ...new Set(orders.map((o) => o.transaction_type).filter(Boolean))],
    products: ["ALL", ...new Set(orders.map((o) => displayProductType(o.product_type, o.exchange).toUpperCase()).filter(Boolean))],
    exchanges: ["ALL", ...new Set(orders.map((o) => o.exchange).filter(Boolean))],
  }), [orders]);

  async function cancel(order: OrderModel) {
    if (!order.order_id || !order.exchange) return;
    setBusy(true); setMessage("");
    const family = orderFamily(order);
    const res = await apiClient.delete(orderCancelPath(family, order.exchange, order.order_id, order.validity, order.validity_days ?? 0), {});
    if (res.success) setPopupMessage("Cancellation request sent to OMS.");
    else setMessage(res.message || "Unable to cancel order.");
    setBusy(false);
    activeOrdersState.reload();
  }

  async function cancelAll() {
    const cancellable = orders.filter((o) => o.exchange && o.order_id && isCancellable(o));
    if (!cancellable.length) { setPopupMessage("No cancellable orders found."); return; }
    setBusy(true); setMessage("");
    const isGtd = tab === "GTD";
    const rows = cancellable.map((o) => isGtd ? [o.exchange, o.order_id, ...(o.validity_days ? [o.validity_days] : [])] : [o.exchange, o.order_id]);
    const res = await apiClient.post(Endpoints.orders.cancel, { orders: rows, flag: isGtd, ...(isGtd ? { validity: "GTD" } : {}) });
    if (res.success) setPopupMessage(isGtd ? "GTD delete requests sent to OMS." : "Cancel-all request sent to OMS.");
    else setMessage(res.message || "Unable to cancel orders.");
    setBusy(false); activeOrdersState.reload();
  }

  async function loadHistory(order: OrderModel) {
    setHistoryOrder(order); setHistoryData([]);
    const res = await apiClient.get<any>(orderHistoryPath(order.order_id));
    if (res.success) {
      const data: any = res.data;
      const list = Array.isArray(data) ? data : Array.isArray(data?.orders) ? data.orders : Array.isArray(data?.data) ? data.data : [];
      setHistoryData(list.map(normalizeOrder));
    } else setMessage(res.message || "Unable to load order history.");
  }

  async function submitModify() {
    if (!modify) return;
    const { order, qty, price, trigger, disclosed, validity, validityDays, orderType } = modify;
    if (!order.exchange || !order.order_id || qty <= 0) return;
    setBusy(true); setMessage("");
    const family = orderFamily(order);
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
    if (res.success) setPopupMessage("Order modification request sent to OMS.");
    else setMessage(res.message || "Unable to modify order.");
    setBusy(false);
    if (res.success) { setModify(null); activeOrdersState.reload(); }
  }

  const stateError = activeOrdersState.error || (tab === "Traded" ? trades.error : null);
  const loading = tab === "Traded" ? trades.loading && !tradeRows.length : activeOrdersState.loading && !orders.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Orders & Trades</h1>
          <p className="text-xs text-aveon-muted">Mobile-parity Order Book, GTD and Trade Book.</p>
        </div>
        <Button onClick={() => window.location.assign("/orders/new")}>+ Place Order</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-x-auto rounded-lg border border-aveon-border bg-aveon-panel p-0.5">
          {ORDER_TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={`min-w-[82px] shrink-0 border border-aveon-border px-4 py-2 text-xs font-semibold transition-colors ${tab === t ? "bg-aveon-primary text-white" : "bg-aveon-panel text-aveon-muted hover:bg-aveon-panel2 hover:text-aveon-text"}`}>{t}</button>)}
        </div>
        {(tab === "Pending" || tab === "GTD") && <Button variant="ghost" disabled={busy} onClick={cancelAll}>Cancel All</Button>}
        <div className="relative ml-auto">
          <Button variant="ghost" onClick={() => setExportOpen((v) => !v)}>Export ▾</Button>
          {exportOpen && (
            <div className="absolute right-0 top-full z-30 mt-1 w-40 rounded-lg border border-aveon-border bg-aveon-panel p-1 shadow-xl">
              <button className="w-full rounded px-3 py-2 text-left text-xs hover:bg-aveon-panel2" onClick={() => { exportOrdersExcel(tab, filteredOrders, filteredTrades, liveAllOrders); setExportOpen(false); }}>Excel</button>
              <button className="w-full rounded px-3 py-2 text-left text-xs hover:bg-aveon-panel2" onClick={() => { exportOrdersCsv(tab, filteredOrders, filteredTrades, liveAllOrders); setExportOpen(false); }}>CSV</button>
              <button className="w-full rounded px-3 py-2 text-left text-xs hover:bg-aveon-panel2" onClick={() => { exportOrdersPdf(tab, filteredOrders, filteredTrades, liveAllOrders); setExportOpen(false); }}>PDF</button>
              <button className="w-full rounded px-3 py-2 text-left text-xs hover:bg-aveon-panel2" onClick={() => { exportOrdersXml(tab, filteredOrders, filteredTrades, liveAllOrders); setExportOpen(false); }}>XML</button>
            </div>
          )}
        </div>
      </div>

      <Card className="p-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search symbol, order or trade" />
          <Select value={side} onChange={(e) => setSide(e.target.value)}>{options.sides.map((x) => <option key={x}>{x}</option>)}</Select>
          <Select value={product} onChange={(e) => setProduct(e.target.value)}>{options.products.map((x) => <option key={x}>{x}</option>)}</Select>
          <Select value={exchange} onChange={(e) => setExchange(e.target.value)}>{options.exchanges.map((x) => <option key={x}>{x}</option>)}</Select>
        </div>
      </Card>

      {message && <div className="rounded-lg border border-aveon-border bg-aveon-panel2 px-3 py-2 text-xs text-aveon-text">{message}</div>}
      {popupMessage && <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/65 p-4" role="dialog" aria-modal="true">
        <div className="w-full max-w-sm rounded-xl border border-aveon-border bg-aveon-panel p-5 shadow-2xl">
          <div className="mb-2 text-sm font-semibold text-aveon-text">Request Submitted</div>
          <div className="text-xs leading-5 text-aveon-muted">{popupMessage}</div>
          <div className="mt-5 flex justify-end">
            <Button onClick={() => setPopupMessage("")}>OK</Button>
          </div>
        </div>
      </div>}
      <Card className="overflow-x-auto p-0">
        {loading ? <p className="p-6 text-xs text-aveon-muted">Loading…</p> : stateError ? <EmptyState title="Unable to load" subtitle={stateError} /> : tab === "Traded" ? <TradeTable trades={filteredTrades} allOrders={liveAllOrders} /> : <OrderTable orders={filteredOrders} tab={tab} onCancel={cancel} onModify={(o) => setModify({ order: o, qty: Math.max(1, o.quantity), price: o.price ? String(o.price) : "", trigger: o.trigger_price ? String(o.trigger_price) : "", disclosed: o.disclosed_quantity ?? 0, validity: validityFromApi(String(o.validity || "DAY")), validityDays: o.validity_days ?? 0, orderType: String(o.order_type || "RL-MKT") })} onHistory={loadHistory} />}
      </Card>

      {modify && <ModifyDialog state={modify} setState={setModify} onClose={() => setModify(null)} onSubmit={submitModify} busy={busy} />}
      {historyOrder && <HistoryDialog order={historyOrder} rows={historyData} onClose={() => setHistoryOrder(null)} />}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<div className="p-6 text-xs text-aveon-muted">Loading orders...</div>}>
      <OrdersContent />
    </Suspense>
  );
}

function exportRows(tab: OrderTab, orders: OrderModel[], trades: TradeModel[], liveAllOrders: OrderModel[]) {
  if (tab === "Traded") {
    return {
      title: "Traded",
      headers: ["Trade Time", "Symbol", "Side", "Product", "Exec Qty", "Exec Price", "Type", "Trade ID", "Order ID"],
      rows: trades.map((t) => [formatTableTime(t.trade_timestamp), orderDisplaySymbol(t) || "", t.transaction_type || "", displayProductType(t.product_type || "", t.exchange) || "", t.quantity ?? "", t.price ?? "", formatOrderType(t.order_type), t.trade_id || "", tradeOrderDisplayId(t, liveAllOrders)]),
    };
  }
  return {
    title: tab,
    headers: ["Time", "Symbol", "Side", "Product", "Type", "Qty", "Rem Qty", "Price", "Trigger", "Order ID", "Status"],
    rows: orders.map((o) => [formatTableTime(o.order_timestamp), orderDisplaySymbol(o) || "", o.transaction_type || "", displayProductType(o.product_type, o.exchange, o.raw?._InstrumentName) || "", formatOrderType(o.order_type), o.quantity ?? "", Math.max(0, (o.quantity ?? 0) - (o.filled_quantity ?? 0)), o.price ?? "", o.trigger_price ?? "", o.order_id || "", o.status || ""]),
  };
}

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportOrdersCsv(tab: OrderTab, orders: OrderModel[], trades: TradeModel[], liveAllOrders: OrderModel[]) {
  const data = exportRows(tab, orders, trades, liveAllOrders);
  const csv = [data.headers, ...data.rows].map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  downloadBlob(csv, `AveonTrade_${data.title}_Export.csv`, "text/csv;charset=utf-8");
}

function exportOrdersExcel(tab: OrderTab, orders: OrderModel[], trades: TradeModel[], liveAllOrders: OrderModel[]) {
  const data = exportRows(tab, orders, trades, liveAllOrders);
  const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>table{border-collapse:collapse;font-family:Arial;font-size:12px}th,td{border:1px solid #bbb;padding:6px 8px;white-space:nowrap}th{font-weight:bold}</style></head><body><h3>AveonTrade — ${esc(data.title)}</h3><table><thead><tr>${data.headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${data.rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
  downloadBlob(html, `AveonTrade_${data.title}_Export.xls`, "application/vnd.ms-excel");
}

function exportOrdersXml(tab: OrderTab, orders: OrderModel[], trades: TradeModel[], liveAllOrders: OrderModel[]) {
  const data = exportRows(tab, orders, trades, liveAllOrders);
  const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<aveonTradeExport type="${esc(data.title)}">\n${data.rows.map((row) => `  <record>\n${data.headers.map((h, i) => `    <${xmlTag(h)}>${esc(row[i])}</${xmlTag(h)}>`).join("\n")}\n  </record>`).join("\n")}\n</aveonTradeExport>`;
  downloadBlob(xml, `AveonTrade_${data.title}_Export.xml`, "application/xml;charset=utf-8");
}

function xmlTag(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+(.)/g, (_, c) => String(c).toUpperCase()).replace(/[^a-zA-Z0-9_]/g, "_") || "field";
}

function exportOrdersPdf(tab: OrderTab, orders: OrderModel[], trades: TradeModel[], liveAllOrders: OrderModel[]) {
  const data = exportRows(tab, orders, trades, liveAllOrders);
  const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>AveonTrade ${esc(data.title)}</title><style>@page{size:landscape;margin:12mm}body{font-family:Arial;font-size:10px}h2{margin:0 0 10px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:5px;text-align:left;white-space:nowrap}th{font-weight:bold}</style></head><body><h2>AveonTrade — ${esc(data.title)}</h2><table><thead><tr>${data.headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${data.rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table><script>window.onload=function(){window.print();};<\/script></body></html>`;
  const win = window.open("", "_blank", "width=1200,height=800");
  if (!win) return;
  win.document.write(html); win.document.close();
}

function filterOrders(rows: OrderModel[], q: string, side: string, product: string, exchange: string) {
  const text = q.trim().toUpperCase();
  return rows.filter((o) => (!text || [o.trading_symbol, o.order_id, o.exchange_order_no, o.exchange, o.error_reason].some((v) => String(v ?? "").toUpperCase().includes(text))) && (side === "ALL" || o.transaction_type === side) && (product === "ALL" || displayProductType(o.product_type, o.exchange).toUpperCase() === product) && (exchange === "ALL" || o.exchange === exchange));
}
function filterTrades(rows: TradeModel[], q: string, side: string, product: string, exchange: string) {
  const text = q.trim().toUpperCase();
  return rows.filter((t) => (!text || [t.trading_symbol, t.order_id, t.trade_id, t.exchange_order_no, t.exchange].some((v) => String(v ?? "").toUpperCase().includes(text))) && (side === "ALL" || t.transaction_type === side) && (product === "ALL" || displayProductType(t.product_type ?? "", t.exchange).toUpperCase() === product) && (exchange === "ALL" || t.exchange === exchange));
}
function orderFamily(o: OrderModel): "regular" | "cover" | "bracket" { const p = String(o.product_type).toUpperCase(); return p === "COVER" ? "cover" : p === "BRACKET" ? "bracket" : "regular"; }
function isCancellable(o: OrderModel) { const s = String(o.status).toUpperCase(); return (o.pending_quantity ?? Math.max(0, o.quantity - (o.filled_quantity ?? 0))) > 0 && !/COMPLETE|EXECUT|FILLED|CANCEL|REJECT|ERROR/.test(s); }

function formatTableTime(value?: string): string {
  if (!value) return "—";
  const raw = String(value).trim();
  const months: Record<string, string> = {
    JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
    JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
  };

  // Broker socket: 05-Nov-2026 18.55.20 / 05-Nov-2026 18:55:20
  const socket = raw.match(/^(\\d{2})-([A-Za-z]{3})-(\\d{4})[ T]+(\\d{2})[.:](\\d{2})[.:](\\d{2})/);
  if (socket) {
    const month = months[socket[2].toUpperCase()];
    if (month) return `${socket[3]}-${month}-${socket[1]} ${socket[4]}:${socket[5]}:${socket[6]}`;
  }

  // REST/download API: 2026-11-05 18:55:03 (keep broker wall-clock time;
  // do not pass timezone-less values through Date and shift them by locale).
  const api = raw.match(/^(\\d{4}-\\d{2}-\\d{2})[ T](\\d{2}):(\\d{2}):(\\d{2})/);
  if (api) return `${api[1]} ${api[2]}:${api[3]}:${api[4]}`;

  const iso = raw.match(/^(\\d{4}-\\d{2}-\\d{2})T(\\d{2}):(\\d{2}):(\\d{2})/);
  if (iso) return `${iso[1]} ${iso[2]}:${iso[3]}:${iso[4]}`;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatOrderType(value?: string): string {
  const type = String(value ?? "").trim().toUpperCase();
  return ({ "RL-MKT": "MARKET", "RL": "LIMIT", "SL-MKT": "SL-M", "SL": "SL" } as Record<string, string>)[type] || value || "—";
}

function OrderTable({ orders, tab, onCancel, onModify, onHistory }: { orders: OrderModel[]; tab: OrderTab; onCancel: (o: OrderModel) => void; onModify: (o: OrderModel) => void; onHistory: (o: OrderModel) => void }) {
  const showActions = tab === "Pending" || tab === "GTD";
  if (!orders.length) return <EmptyState title={tab === "GTD" ? "No GTD orders" : "No orders found"} subtitle="Try clearing the filters or refreshing the order book." />;
  const headers = ["Time","Symbol","Side","Product","Type","Qty","Rem Qty","Price","Trigger","Order ID","Status", ...(showActions ? ["Action"] : [])];
  return <table className="w-max min-w-[1250px] table-fixed text-xs"><thead className="border-b border-aveon-border text-left text-aveon-muted"><tr>{headers.map((h) => <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}</tr></thead><tbody>{orders.map((o, i) => <tr key={o.order_id || i} className="table-row-hover border-b border-aveon-border/40">
    <td className="px-3 py-2 text-[10px] text-aveon-muted whitespace-nowrap">{formatTableTime(o.order_timestamp)}</td>
    <td className="px-3 py-2 font-medium whitespace-nowrap">{orderDisplaySymbol(o) || "—"}</td>
    <td className="px-3 py-2"><Badge tone={o.transaction_type === "BUY" ? "buy" : "sell"}>{o.transaction_type}</Badge></td>
    <td className="px-3 py-2">{displayProductType(o.product_type, o.exchange, o.raw?._InstrumentName)}</td>
    <td className="px-3 py-2 whitespace-nowrap">{formatOrderType(o.order_type)}</td>
    <td className="px-3 py-2 text-right">{o.quantity}</td>
    <td className="px-3 py-2 text-right">{Math.max(0, (o.quantity ?? 0) - (o.filled_quantity ?? 0))}</td>
    <td className="px-3 py-2 text-right">{formatCurrency(o.price)}</td>
    <td className="px-3 py-2 text-right">{o.trigger_price ? formatCurrency(o.trigger_price) : "—"}</td>
    <td className="px-3 py-2 font-mono text-[10px] whitespace-nowrap">{o.order_id || "—"}</td>
    <td className="px-3 py-2"><Badge tone={orderStatusTone(o.status)}>{o.status}</Badge></td>
    {showActions && <td className="px-3 py-2"><div className="flex gap-1">{isCancellable(o) && <button onClick={() => onModify(o)} className="rounded border border-aveon-border px-2 py-1 text-aveon-text hover:bg-aveon-panel2">Modify</button>}{isCancellable(o) && <button onClick={() => onCancel(o)} className="rounded border border-aveon-border px-2 py-1 text-aveon-sell hover:bg-aveon-panel2">{tab === "GTD" ? "Delete" : "Cancel"}</button>}</div></td>}
  </tr>)}</tbody></table>;
}

function TradeTable({ trades, allOrders }: { trades: TradeModel[]; allOrders: OrderModel[] }) {
  if (!trades.length) return <EmptyState title="No trades found" subtitle="Executed trade fills will appear here." />;
  return <table className="w-max min-w-[1050px] table-fixed text-xs"><thead className="border-b border-aveon-border text-left text-aveon-muted"><tr>{["Trade Time","Symbol","Side","Product","Exec Qty","Exec Price","Type","Trade ID","Order ID"].map((h) => <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}</tr></thead><tbody>{trades.map((t, i) => <tr key={t.trade_id || i} className="table-row-hover border-b border-aveon-border/40">
    <td className="px-3 py-2 text-[10px] text-aveon-muted whitespace-nowrap">{formatTableTime(t.trade_timestamp)}</td>
    <td className="px-3 py-2 font-medium whitespace-nowrap">{orderDisplaySymbol(t) || "—"}</td>
    <td className="px-3 py-2"><Badge tone={t.transaction_type === "BUY" ? "buy" : "sell"}>{t.transaction_type}</Badge></td>
    <td className="px-3 py-2">{displayProductType(t.product_type || "", t.exchange) || "—"}</td>
    <td className="px-3 py-2 text-right">{t.quantity}</td>
    <td className="px-3 py-2 text-right">{formatCurrency(t.price)}</td>
    <td className="px-3 py-2 whitespace-nowrap">{formatOrderType(t.order_type)}</td>
    <td className="px-3 py-2 font-mono text-[10px] whitespace-nowrap">{t.trade_id || "—"}</td>
    <td className="px-3 py-2 font-mono text-[10px] whitespace-nowrap">{tradeOrderDisplayId(t, allOrders) || "—"}</td>
  </tr>)}</tbody></table>;
}
function ModifyDialog({ state, setState, onClose, onSubmit, busy }: { state: NonNullable<ModifyState>; setState: (s: ModifyState) => void; onClose: () => void; onSubmit: () => void; busy: boolean }) {
  const type = String(state.orderType).trim().toUpperCase();
  const isMarket = type.includes("MKT") || type === "MARKET";
  const isStop = type === "SL" || type === "SL-MKT" || type.includes("STOP");
  const inputClass = "w-full rounded-md border border-aveon-border bg-aveon-panel2 px-2 py-2 text-sm text-aveon-text outline-none focus:border-aveon-primary disabled:cursor-not-allowed disabled:opacity-50";
  return <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/65 p-4"><div className="w-full max-w-lg rounded-xl border border-aveon-border bg-aveon-panel p-4 shadow-2xl"><div className="mb-3 flex justify-between"><div><h3 className="text-sm font-semibold">Modify Order</h3><p className="text-[11px] text-aveon-muted">{orderDisplaySymbol(state.order)} · {state.order.exchange}</p></div><button onClick={onClose} className="text-aveon-muted">×</button></div><div className="grid grid-cols-2 gap-3"><Field label="Order Type"><Select value={state.orderType} onChange={(e) => setState({ ...state, orderType: e.target.value, price: e.target.value.includes("MKT") ? "" : state.price, trigger: e.target.value.startsWith("SL") ? state.trigger : "" })}><option value="RL">Limit</option><option value="RL-MKT">Market</option><option value="SL">Stop Limit</option><option value="SL-MKT">Stop Market</option></Select></Field><Field label="Quantity"><Input className={inputClass} type="number" min={1} value={state.qty} onChange={(e) => setState({ ...state, qty: Number(e.target.value) })} /></Field><Field label="Price"><Input className={inputClass} type="number" min={0} disabled={isMarket} value={state.price} onChange={(e) => setState({ ...state, price: e.target.value })} /></Field><Field label="Trigger Price"><Input className={inputClass} type="number" min={0} disabled={!isStop} value={state.trigger} onChange={(e) => setState({ ...state, trigger: e.target.value })} /></Field><Field label="Disclosed Qty"><Input className={inputClass} type="number" min={0} max={state.qty} value={state.disclosed} onChange={(e) => setState({ ...state, disclosed: Number(e.target.value) })} /></Field><Field label="Validity"><Select value={state.validity} onChange={(e) => setState({ ...state, validity: e.target.value })}>{String(state.order.exchange ?? "").toUpperCase().includes("BSE") && <option>EOS</option>}<option>DAY</option><option>IOC</option><option>GTD</option></Select></Field>{state.validity === "GTD" && <Field label="Validity Days"><Input className={inputClass} type="number" min={1} value={state.validityDays} onChange={(e) => setState({ ...state, validityDays: Number(e.target.value) })} /></Field>}</div><p className="mt-2 text-[10px] text-aveon-muted">Market orders do not use a limit price. Trigger price is available for stop orders.</p><div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={busy || !Number.isFinite(state.qty) || state.qty <= 0 || state.disclosed < 0 || state.disclosed > state.qty || (!isMarket && !(Number(state.price) > 0)) || (isStop && !(Number(state.trigger) > 0)) || (state.validity === "GTD" && state.validityDays < 1)} onClick={onSubmit}>{busy ? "Submitting…" : "Modify Order"}</Button></div></div></div>;
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="text-[11px] text-aveon-muted">{label}<span className="mt-1 block">{children}</span></label>; }
function HistoryDialog({ order, rows, onClose }: { order: OrderModel; rows: OrderModel[]; onClose: () => void }) { return <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/65 p-4"><div className="w-full max-w-3xl rounded-xl border border-aveon-border bg-aveon-panel p-4 shadow-2xl"><div className="mb-3 flex justify-between"><div><h3 className="text-sm font-semibold">Order History</h3><p className="text-[11px] text-aveon-muted">{orderDisplaySymbol(order)} · {order.order_id}</p></div><button onClick={onClose} className="text-aveon-muted">×</button></div>{!rows.length ? <p className="py-8 text-center text-xs text-aveon-muted">No history rows returned.</p> : <div className="max-h-[60vh] overflow-auto"><table className="w-full text-xs"><thead><tr className="border-b border-aveon-border text-left text-aveon-muted"><th className="px-2 py-2">Status</th><th className="px-2 py-2">Qty</th><th className="px-2 py-2">Price</th><th className="px-2 py-2">Time</th><th className="px-2 py-2">Message</th></tr></thead><tbody>{rows.map((r,i)=><tr key={i} className="border-b border-aveon-border/40"><td className="px-2 py-2">{r.status}</td><td className="px-2 py-2">{r.filled_quantity ?? 0}/{r.quantity}</td><td className="px-2 py-2">{formatCurrency(r.price)}</td><td className="px-2 py-2">{r.order_timestamp || "—"}</td><td className="px-2 py-2">{r.message || "—"}</td></tr>)}</tbody></table></div>}<div className="mt-3 flex justify-end"><Button variant="ghost" onClick={onClose}>Close</Button></div></div></div>; }