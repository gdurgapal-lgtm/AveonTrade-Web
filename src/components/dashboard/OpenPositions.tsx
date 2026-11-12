"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Card } from "@/components/ui/Primitives";
import PositionActionDialog, { positionActionSide, type PositionAction } from "@/components/dashboard/PositionActionDialog";
import { useMarketStream } from "@/hooks/useMarketStream";
import { apiClient } from "@/lib/apiClient";
import { Endpoints } from "@/lib/endpoints";
import { formatCurrency, pnlTone } from "@/lib/format";
import { normalizePositionRow, positionMtm, positionToInstrument } from "@/lib/positionHelpers";
import { positionDisplaySymbol, validityToApi, displayProductType, type Instrument, type PositionModel } from "@/types/trading";

type Notice = { tone: "ok" | "error"; text: string } | null;

export default function OpenPositions({
  data, loading, error, reload,
}: {
  data: unknown;
  loading: boolean;
  error: string | null;
  reload: () => void;
}) {
  const positions = useMemo(
    () => (Array.isArray(data) ? (data as Record<string, any>[]).map(normalizePositionRow) : []),
    [data]
  );
  // Open positions first, flat (already squared-off) ones after.
  const ordered = useMemo(
    () => [...positions].sort((a, b) => Number(b.net_quantity !== 0) - Number(a.net_quantity !== 0)),
    [positions]
  );
  const instruments = useMemo(
    () => positions.filter((p) => p.net_quantity !== 0).map(positionToInstrument).filter(Boolean) as Instrument[],
    [positions]
  );
  const { quotesByToken } = useMarketStream(instruments);

  const [action, setAction] = useState<PositionAction | null>(null);
  const [selected, setSelected] = useState<PositionModel | null>(null);
  const [qty, setQty] = useState(0);
  const [orderType, setOrderType] = useState("RL-MKT");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialogMessage, setDialogMessage] = useState("");
  const [notice, setNotice] = useState<Notice>(null);

  function openAction(kind: PositionAction, p: PositionModel) {
    if (p.net_quantity === 0) return;
    setAction(kind);
    setSelected(p);
    setQty(Math.abs(p.net_quantity));
    setOrderType("RL-MKT");
    setPrice("");
    setDialogMessage("");
  }

  async function submit() {
    if (!selected || !action || qty <= 0) return;
    setBusy(true);
    setDialogMessage("");
    try {
      const exchange = selected.preferred_exchange || selected.exchange;
      const token = Number(selected.preferred_scrip_token ?? selected.scrip_token);
      if (!exchange || !token) throw new Error("Position exchange/token is unavailable.");

      const res = await apiClient.post(Endpoints.orders.regular, {
        scrip_info: {
          exchange,
          scrip_token: token,
          symbol: selected.symbol || "",
          series: selected.series || "",
          expiry_date: selected.expiry_date || "",
          strike_price: selected.strike_price || "",
          option_type: selected.option_type || "",
        },
        transaction_type: positionActionSide(action, selected),
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
      if (!res.success) throw new Error(res.message || "Order request failed.");

      setNotice({ tone: "ok", text: res.message || `${action === "close" ? "Close" : "Add"} order sent to OMS.` });
      setAction(null);
      setSelected(null);
      reload();
      setTimeout(() => setNotice(null), 6000);
    } catch (e) {
      setDialogMessage(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  const rows = ordered.slice(0, 8).map((p) => {
    const instrument = positionToInstrument(p);
    const key = instrument ? `${instrument.exchangeSegment ?? instrument.exchange}:${instrument.token}` : "";
    const quote = instrument ? quotesByToken[`${instrument.marketSegmentId ?? ""}_${instrument.token}`] ?? quotesByToken[key] : undefined;
    return { p, mtm: positionMtm(p, quote?.ltp || 0) };
  });

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Open Positions</h2>
        <Link href="/positions" className="text-xs text-aveon-primary">View all</Link>
      </div>

      {notice && (
        <div className={`mb-3 rounded-lg border px-3 py-2 text-xs ${notice.tone === "ok" ? "border-aveon-buy/40 text-aveon-buy" : "border-aveon-sell/40 text-aveon-sell"}`}>
          {notice.text}
        </div>
      )}

      {loading && positions.length === 0 ? (
        <p className="text-xs text-aveon-muted">Loading…</p>
      ) : error && positions.length === 0 ? (
        <p className="text-xs text-aveon-sell">{error}</p>
      ) : positions.length === 0 ? (
        <p className="text-xs text-aveon-muted">No open positions.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-xs">
            <thead className="text-left text-aveon-muted">
              <tr>
                <th className="py-1.5 pr-2 font-medium">Symbol</th>
                <th className="px-2 py-1.5 text-right font-medium">Net Qty</th>
                <th className="px-2 py-1.5 text-right font-medium">MTM G/L</th>
                <th className="py-1.5 pl-2 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, mtm }, i) => {
                const flat = p.net_quantity === 0;
                return (
                  <tr key={`${p.exchange}-${p.scrip_token}-${p.product_type}-${i}`} className={`border-t border-aveon-border/40 ${flat ? "opacity-60" : ""}`}>
                    <td className="py-2 pr-2">
                      <p className="text-sm font-medium">{positionDisplaySymbol(p)}</p>
                      <p className="text-[10px] text-aveon-muted">
                        {displayProductType(p.product_type, p.preferred_exchange || p.exchange, p.instrument)} · {p.preferred_exchange || p.exchange}
                      </p>
                    </td>
                    <td className={`px-2 py-2 text-right text-sm font-semibold ${p.net_quantity > 0 ? "text-aveon-buy" : p.net_quantity < 0 ? "text-aveon-sell" : ""}`}>
                      {p.net_quantity}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {mtm === null ? <span className="text-aveon-muted">—</span> : <Badge tone={pnlTone(mtm)}>{formatCurrency(mtm)}</Badge>}
                    </td>
                    <td className="py-2 pl-2">
                      {flat ? (
                        <p className="text-right text-[11px] text-aveon-muted">Closed</p>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => openAction("increase", p)}
                            title="Add to position"
                            className="rounded border border-aveon-border px-2 py-1 text-aveon-buy hover:bg-aveon-panel2"
                          >
                            Add
                          </button>
                          <button
                            onClick={() => openAction("close", p)}
                            title="Close position"
                            className="rounded border border-aveon-border px-2 py-1 text-aveon-sell hover:bg-aveon-panel2"
                          >
                            Close
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
          busy={busy}
          message={dialogMessage}
          onClose={() => setAction(null)}
          onSubmit={submit}
        />
      )}
    </Card>
  );
}
