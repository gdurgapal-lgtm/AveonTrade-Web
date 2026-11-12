"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Badge, Button, Card, EmptyState, Input, Select } from "@/components/ui/Primitives";
import { useSharedOrderEntry } from "@/components/market/SharedOrderEntryProvider";
import { LIVE_POSITIONS, usePolledData } from "@/hooks/usePolledData";
import { useMarketStream } from "@/hooks/useMarketStream";
import { apiClient } from "@/lib/apiClient";
import { conversionBaseline, confirmPositionConversion } from "@/lib/positionConversion";
import { invalidateShared } from "@/lib/sharedFetch";
import { positionsPath, Endpoints } from "@/lib/endpoints";
import { formatCurrency, pnlTone } from "@/lib/format";
import { feedToken, displayProductType, positionDisplaySymbol, validityToApi, type Instrument, type PositionModel } from "@/types/trading";
import { positionToInstrument } from "@/lib/positionHelpers";
import { getLastMarketQuote } from "@/lib/marketQuoteCache";

export default function PositionsPage() {
  const { openOrder } = useSharedOrderEntry();
  const [view, setView] = useState<"daily" | "expiry">("daily");
  const [action, setAction] = useState<"increase" | "close" | "convert" | null>(null);
  const [selected, setSelected] = useState<PositionModel | null>(null);
  const [qty, setQty] = useState(0);
  const [orderType, setOrderType] = useState("RL-MKT");
  const [price, setPrice] = useState("");
  const [target, setTarget] = useState("DELIVERY");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [squareAllOpen, setSquareAllOpen] = useState(false);

  const raw = usePolledData<Record<string, any>[]>(positionsPath(view, 1), 5_000, true, LIVE_POSITIONS);
  const positions = useMemo(() => (raw.data ?? []).map(normalizePositionWeb), [raw.data]);
  const instruments = useMemo(() => positions.filter((p) => p.net_quantity !== 0).map(positionInstrument).filter(Boolean) as Instrument[], [positions]);
  
  // Pass instruments to market stream
  const { quotesByToken } = useMarketStream(instruments);

  const rows = positions.map((p) => {
    const instrument = positionInstrument(p);
    // Use feedToken utility to match the exact key format used by useMarketStream
    const key = instrument ? feedToken(instrument) : "";
    const quote = key ? quotesByToken[key] : undefined;
    
    const liveLtp = Number(quote?.ltp) > 0 ? Number(quote?.ltp) : 0;
    const cached = liveLtp > 0 ? null : getLastMarketQuote(key);
    const ltp = liveLtp || cached?.ltp || 0;
    const avg = p.net_quantity >= 0 ? p.avg_buy_price : p.avg_sell_price;
    // Cached prices are displayed for reference only; never use them to calculate live P&L.
    const livePnl = liveLtp > 0 ? (liveLtp - (p.net_price || avg)) * p.net_quantity * (p.multiplier || 1) : 0;
    return { p, ltp, livePnl, hasLive: liveLtp > 0, cachedAt: cached?.receivedAt ?? null };
  });

  function openAction(kind: "increase" | "close" | "convert", p: PositionModel) {
    if (p.net_quantity === 0) return;
    if (kind === "increase" || kind === "close") {
      const instrument = positionInstrument(p);
      if (!instrument) {
        setMessage("Position exchange/token is unavailable.");
        return;
      }
      const side = kind === "close"
        ? (p.net_quantity >= 0 ? "SELL" : "BUY")
        : (p.net_quantity >= 0 ? "BUY" : "SELL");
      openOrder({
        instrument,
        side,
        productType: positionProductType(p.product_type),
        quantity: Math.abs(p.net_quantity),
        onOrderPlaced: () => { raw.reload(); invalidateShared(positionsPath(view, 1)); },
      });
      return;
    }
    setAction(kind);
    setSelected(p);
    setQty(Math.abs(p.net_quantity));
    setOrderType("RL-MKT");
    setPrice("");
    setTarget(String(p.product_type).toUpperCase() === "INTRADAY" ? "DELIVERY" : "INTRADAY");
    setMessage("");
  }

  async function submitAction() {
    if (!selected || !action || qty <= 0) return;
    setBusy(true);
    setMessage("");
    try {
      const exchange = selected.preferred_exchange || selected.exchange;
      const token = Number(selected.preferred_scrip_token ?? selected.scrip_token);
      if (!exchange || !token) throw new Error("Position exchange/token is unavailable.");

      if (action === "close" || action === "increase") {
        const side = action === "close"
          ? (selected.net_quantity >= 0 ? "SELL" : "BUY")
          : (selected.net_quantity >= 0 ? "BUY" : "SELL");

        const response = await apiClient.post(Endpoints.orders.regular, {
          scrip_info: {
            exchange,
            scrip_token: token,
            symbol: selected.symbol || "",
            series: selected.series || "",
            expiry_date: selected.expiry_date || "",
            strike_price: selected.strike_price || "",
            option_type: selected.option_type || "",
          },
          transaction_type: side,
          product_type: selected.product_type,
          order_type: orderType,
          quantity: qty,
          price: orderType === "RL" ? Number(price) || 0 : 0,
          trigger_price: 0,
          disclosed_quantity: 0,
          validity: validityToApi("DAY", exchange),
          validity_days: 0,
          is_amo: false,
          order_identifier: "",
        });

        if (!response.success) throw new Error(response.message || `${action === "close" ? "Close" : "Increase"} position request failed.`);
        setMessage(response.message || `${action === "close" ? "Close" : "Increase"} order sent to OMS.`);
        setAction(null);
      } else {
        const side = selected.net_quantity >= 0 ? "BUY" : "SELL";
        // Snapshot first, so we can tell once the OMS has really moved the quantity.
        const baseline = conversionBaseline(positions, selected, target, qty);
        const res = await apiClient.put(Endpoints.positions.conversion, {
          exchange,
          scrip_token: token,
          transaction_type: side,
          quantity: qty,
          old_product_type: selected.product_type,
          new_product_type: target,
          bo_order_id: "",
        });
        if (!res.success) throw new Error(res.message || "Product conversion request failed.");
        const data: any = res.data;
        const orderId = String(data?.orderId ?? data?.order_ID ?? data?.order_id ?? "");
        setMessage(orderId ? `Conversion submitted (${orderId}). Confirming with OMS…` : "Conversion submitted. Confirming with OMS…");

        // The broker accepts first and the OMS applies a moment later: re-read the
        // positions until the new product type shows up (refreshes every screen).
        const outcome = await confirmPositionConversion({
          positionsPath: positionsPath(view, 1),
          baseline,
          orderId,
          onProgress: setMessage,
        });
        if (outcome.status === "rejected") throw new Error(outcome.message);
        setMessage(outcome.message);
        setAction(null);
      }
      // Position data changed: refresh every screen that lists positions, not just this one.
      invalidateShared(Endpoints.positions.list);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function squareOffAll() {
    setBusy(true);
    setMessage("");
    const res = await apiClient.post(Endpoints.orders.squareoff, { type: view === "expiry" ? "expiry" : "daily", exchange: "", token: "", product_type: "", interop: 1 });
    setMessage(res.success ? (res.message || "Square-off request sent to OMS.") : (res.message || "Unable to square off positions."));
    setBusy(false);
    setSquareAllOpen(false);
    if (res.success) raw.reload();
  }

  const totals = rows.reduce((a, r) => ({ value: a.value + r.p.net_value, livePnl: a.livePnl + r.livePnl }), { value: 0, livePnl: 0 });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Positions</h1>
          <p className="text-xs text-aveon-muted">Mobile-parity position actions with live market-price join.</p>
        </div>
        <Button variant="sell" disabled={busy || !positions.some((p) => p.net_quantity !== 0)} onClick={() => setSquareAllOpen(true)}>Square Off All</Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-lg border border-aveon-border p-1">
          {([['daily', 'Today'], ['expiry', 'Expiry']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setView(v)} className={`rounded-md px-3 py-1.5 text-xs ${view === v ? 'bg-aveon-primary text-white' : 'text-aveon-muted'}`}>{l}</button>
          ))}
        </div>
        <div className="flex gap-5 text-xs">
          <span className="text-aveon-muted">Net Value <b className="text-aveon-text">{formatCurrency(totals.value)}</b></span>
          <span className="text-aveon-muted">Live P&amp;L <b className={totals.livePnl >= 0 ? 'text-aveon-buy' : 'text-aveon-sell'}>{formatCurrency(totals.livePnl)}</b></span>
        </div>
      </div>

      {message && <div className="rounded-lg border border-aveon-border bg-aveon-panel2 px-3 py-2 text-xs text-aveon-text">{message}</div>}

      <Card className="overflow-x-auto p-0">
        {raw.loading ? (
          <p className="p-6 text-xs text-aveon-muted">Loading positions…</p>
        ) : raw.error ? (
          <EmptyState title="Unable to load positions" subtitle={raw.error} />
        ) : !rows.length ? (
          <EmptyState title="No open positions" />
        ) : (
          <table className="w-full min-w-[1050px] text-xs">
            <thead className="border-b border-aveon-border text-left text-aveon-muted">
              <tr>
                {['Symbol', 'Product', 'Net Qty', 'Net Price', 'LTP', 'Net Value', 'Action'].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, ltp, hasLive, cachedAt }, i) => {
                const isZero = p.net_quantity === 0;
                return (
                  <tr key={`${p.exchange}-${p.scrip_token}-${p.product_type}-${i}`} className="table-row-hover border-b border-aveon-border/40">
                    <td className="px-3 py-2">
                      <p className="font-medium">{positionDisplaySymbol(p)}</p>
                      <p className="text-[10px] text-aveon-muted">{p.preferred_exchange || p.exchange}</p>
                    </td>
                    <td className="px-3 py-2">{displayProductType(p.product_type, p.preferred_exchange || p.exchange, p.instrument)}</td>
                    <td className="px-3 py-2 font-semibold">{p.net_quantity}</td>
                    <td className="px-3 py-2">{formatCurrency(p.net_price || (p.net_quantity >= 0 ? p.avg_buy_price : p.avg_sell_price))}</td>
                    <td className="px-3 py-2">
                      {ltp > 0 ? (
                        <span title={hasLive ? "Live market price" : `Last received market price: ${new Date(cachedAt ?? 0).toLocaleString()}`} className={hasLive ? "text-aveon-text" : "text-aveon-muted"}>
                          {formatCurrency(ltp)}{!hasLive && <span className="ml-1 text-[9px]">(last)</span>}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2"><Badge tone={pnlTone(p.net_value)}>{formatCurrency(p.net_value)}</Badge></td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button disabled={isZero} title="Increase position" onClick={() => openAction('increase', p)} className={`rounded border border-aveon-border px-2 py-1 text-aveon-buy hover:bg-aveon-panel2 ${isZero ? 'opacity-50 cursor-not-allowed' : ''}`}>Increase</button>
                        <button disabled={isZero} title="Close position" onClick={() => openAction('close', p)} className={`rounded border border-aveon-border px-2 py-1 text-aveon-sell hover:bg-aveon-panel2 ${isZero ? 'opacity-50 cursor-not-allowed' : ''}`}>Close</button>
                        {['INTRADAY', 'DELIVERY'].includes(String(p.product_type).toUpperCase()) && (
                          <button disabled={isZero} title="Convert product" onClick={() => openAction('convert', p)} className={`rounded border border-aveon-border px-2 py-1 hover:bg-aveon-panel2 ${isZero ? 'opacity-50 cursor-not-allowed' : ''}`}>Convert</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {action && selected && (
        <PositionActionDialog
          action={action}
          position={selected}
          qty={qty}
          setQty={setQty}
          orderType={orderType}
          setOrderType={setOrderType}
          price={price}
          setPrice={setPrice}
          target={target}
          setTarget={setTarget}
          busy={busy}
          message={message}
          onClose={() => setAction(null)}
          onSubmit={submitAction}
        />
      )}

      {squareAllOpen && (
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/65 p-4">
          <div className="w-full max-w-md rounded-xl border border-aveon-border bg-aveon-panel p-5 shadow-2xl">
            <h3 className="text-sm font-semibold">Square-off open positions?</h3>
            <p className="mt-2 text-xs leading-5 text-aveon-muted">This sends the broker square-off request for all open positions in the selected view. The request creates market-side closing orders and cannot be undone from this screen.</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setSquareAllOpen(false)}>Cancel</Button>
              <Button variant="sell" disabled={busy} onClick={squareOffAll}>{busy ? 'Submitting…' : 'Confirm Square Off'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PositionActionDialog({
  action, position, qty, setQty, orderType, setOrderType, price, setPrice, target, setTarget, busy, message, onClose, onSubmit
}: {
  action: 'increase' | 'close' | 'convert';
  position: PositionModel;
  qty: number;
  setQty: (n: number) => void;
  orderType: string;
  setOrderType: (s: string) => void;
  price: string;
  setPrice: (s: string) => void;
  target: string;
  setTarget: (s: string) => void;
  busy: boolean;
  message: string;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const side = action === 'close'
    ? (position.net_quantity >= 0 ? 'SELL' : 'BUY')
    : (position.net_quantity >= 0 ? 'BUY' : 'SELL');

  return (
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/65 p-4">
      <div className="w-full max-w-sm rounded-xl border border-aveon-border bg-aveon-panel p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-aveon-text">{action === 'increase' ? 'Increase Position' : action === 'close' ? 'Close Position' : 'Product Conversion'}</h3>
            <p className="text-[11px] text-aveon-muted">{positionDisplaySymbol(position)} · {displayProductType(position.product_type, position.preferred_exchange || position.exchange, position.instrument)}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-aveon-muted hover:bg-aveon-panel2"><X size={16} /></button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-aveon-muted">Quantity
              <input
                className="mt-1 w-full rounded-lg border border-aveon-border bg-aveon-panel2 px-3 py-2 text-sm text-aveon-text outline-none focus:border-aveon-primary"
                type="number"
                min={1}
                max={action === 'close' ? Math.abs(position.net_quantity) : undefined}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
              />
            </label>
            <div className="rounded-lg border border-aveon-border bg-aveon-panel2 p-2 text-[11px]">
              <span className="text-aveon-muted">Direction</span>
              <p className="mt-1 font-semibold">{side}</p>
            </div>
          </div>

          {(action === 'close' || action === 'increase') && (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-aveon-muted">Order Type
                <select
                  value={orderType}
                  onChange={(e) => setOrderType(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-aveon-border bg-aveon-panel2 px-2.5 py-2 text-sm text-aveon-text outline-none focus:border-aveon-primary"
                >
                  <option value="RL-MKT">Market</option>
                  <option value="RL">Limit</option>
                </select>
              </label>
              {orderType === 'RL' ? (
                <label className="text-[11px] text-aveon-muted">Price
                  <input
                    className="mt-1 w-full rounded-lg border border-aveon-border bg-aveon-panel2 px-3 py-2 text-sm text-aveon-text outline-none focus:border-aveon-primary"
                    type="number"
                    min={0}
                    step={0.05}
                    placeholder="Limit price"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </label>
              ) : (
                <div className="rounded-lg border border-aveon-border bg-aveon-panel2 p-2 text-[11px]">
                  <span className="text-aveon-muted">Execution</span>
                  <p className="mt-1 font-semibold">At Market</p>
                </div>
              )}
            </div>
          )}

          {action === 'convert' && (
            <label className="block text-[11px] text-aveon-muted">Convert to
              <select value={target} onChange={(e) => setTarget(e.target.value)} className="mt-1 w-full rounded-lg border border-aveon-border bg-aveon-panel2 px-3 py-2 text-sm text-aveon-text outline-none focus:border-aveon-primary">
                <option value="DELIVERY">Delivery</option>
                <option value="INTRADAY">Intraday</option>
              </select>
            </label>
          )}
        </div>

        {message && <div className="mt-3 rounded-lg border border-aveon-border bg-aveon-panel2 p-2 text-xs text-aveon-text">{message}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={action === 'close' ? 'sell' : 'primary'} disabled={busy || qty <= 0 || (orderType === 'RL' && !(Number(price) > 0))} onClick={onSubmit}>
            {busy ? 'Processing…' : action === 'increase' ? 'Increase' : action === 'close' ? 'Close Position' : 'Convert'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function normalizePositionWeb(raw: Record<string, any>): PositionModel {
  const n = (v: any) => Number.isFinite(Number(v)) ? Number(v) : 0;
  const s = (v: any) => v == null ? '' : String(v);
  return {
    exchange: s(raw.exchange),
    preferred_exchange: s(raw.preferred_exchange) || undefined,
    scrip_token: raw.scrip_token,
    preferred_scrip_token: raw.preferred_scrip_token,
    symbol: s(raw.symbol),
    series: s(raw.series) || undefined,
    product_type: s(raw.product_type),
    instrument: s(raw.instrument) || undefined,
    expiry_date: s(raw.expiry_date) || undefined,
    strike_price: s(raw.strike_price) || undefined,
    option_type: s(raw.option_type) || undefined,
    market_lot: n(raw.market_lot) || undefined,
    buy_quantity: n(raw.buy_quantity),
    avg_buy_price: n(raw.avg_buy_price),
    buy_value: n(raw.buy_value),
    sell_quantity: n(raw.sell_quantity),
    avg_sell_price: n(raw.avg_sell_price),
    sell_value: n(raw.sell_value),
    net_quantity: n(raw.net_quantity),
    net_price: n(raw.net_price),
    net_value: n(raw.net_value),
    cf_buy_value: n(raw.cf_buy_value),
    cf_sell_value: n(raw.cf_sell_value),
    cf_net_price: n(raw.cf_net_price),
    reference_rate: n(raw.reference_rate),
    gen_num: n(raw.gen_num),
    gen_den: n(raw.gen_den),
    price_num: n(raw.price_num),
    price_den: n(raw.price_den),
    unsettled_quantity: n(raw.unsettled_quantity),
    multiplier: n(raw.multiplier),
    daily_or_expiry: s(raw.daily_or_expiry) || undefined,
  };
}

function positionInstrument(p: PositionModel) {
  return positionToInstrument(p);
}
function positionProductType(value: unknown): "CNC" | "MIS" | "NRML" {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (["DELIVERY", "CNC"].includes(normalized)) return "CNC";
  if (["INTRADAY", "MIS"].includes(normalized)) return "MIS";
  return "NRML";
}
