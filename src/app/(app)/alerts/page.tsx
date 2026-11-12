"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, Pencil, RefreshCw, Trash2 } from "lucide-react";
import SymbolSearch from "@/components/market/SymbolSearch";
import PriceAlertDialog from "@/components/market/PriceAlertDialog";
import { useMarketStream } from "@/hooks/useMarketStream";
import { fetchPriceAlerts, deletePriceAlert } from "@/lib/alerts";
import { alertConditionText, alertInstrumentFromRecord, type PriceAlert } from "@/types/alerts";
import type { Instrument } from "@/types/trading";
import { instrumentDisplayName } from "@/types/trading";

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedInstrument, setSelectedInstrument] = useState<Instrument | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PriceAlert | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchPriceAlerts();
    setLoading(false);
    if (!result.success) {
      setMessage(result.message || "Unable to fetch alerts.");
      return;
    }
    setMessage(null);
    setAlerts(result.alerts);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const active = useMemo(() => alerts.filter((item) => !item.triggered), [alerts]);
  const triggered = useMemo(() => alerts.filter((item) => item.triggered), [alerts]);
  const feedInstruments = useMemo(() => active.map(alertInstrumentFromRecord), [active]);
  const { quotes } = useMarketStream(feedInstruments, null, []);

  async function remove(alert: PriceAlert) {
    if (!window.confirm(`Delete alert for ${alert.symbol || "this scrip"}?`)) return;
    const result = await deletePriceAlert(alert);
    if (!result.success) {
      setMessage(result.message);
      return;
    }
    await load();
  }

  function openCreate(instrument: Instrument) {
    setEditing(null);
    setSelectedInstrument(instrument);
    setDialogOpen(true);
  }

  function openEdit(alert: PriceAlert) {
    setEditing(alert);
    setSelectedInstrument(alertInstrumentFromRecord(alert));
    setDialogOpen(true);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Alerts</h1>
          <p className="text-xs text-aveon-muted">Create, monitor and manage price alerts from one place.</p>
        </div>
        <button onClick={() => void load()} className="flex items-center gap-1.5 rounded-md border border-aveon-border px-3 py-2 text-xs hover:bg-aveon-panel2"><RefreshCw size={14} /> Refresh</button>
      </div>

      <div className="shrink-0 rounded-aveon border border-aveon-border bg-aveon-panel p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold"><BellRing size={15} className="text-aveon-primary" /> Create Price Alert</div>
        <SymbolSearch onSelect={openCreate} isAdded={() => false} />
      </div>

      {message && <div className="shrink-0 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">{message}</div>}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-2">
        <section className="min-h-0 overflow-hidden rounded-aveon border border-aveon-border bg-aveon-panel">
          <div className="flex items-center justify-between border-b border-aveon-border px-3 py-2">
            <div><h2 className="text-sm font-semibold">Active Alerts</h2><p className="text-[11px] text-aveon-muted">{active.length} active</p></div>
          </div>
          <div className="h-full overflow-auto">
            {loading ? <p className="p-4 text-xs text-aveon-muted">Loading alerts…</p> : active.length === 0 ? <p className="p-4 text-xs text-aveon-muted">No active alerts.</p> : active.map((alert) => {
              const quote = quotes[alert.symbol];
              return <div key={alert.serverAlertId || alert.uniqueId || `${alert.token}-${alert.createDate}`} className="grid grid-cols-[minmax(0,1fr)_100px_150px] items-center gap-3 border-b border-aveon-border/50 px-3 py-2.5">
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{alert.symbol || "—"}</p><p className="truncate text-xs text-aveon-muted">{alertConditionText(alert)}</p></div>
                <div className="text-right"><p className="text-sm font-medium tabular-nums">{quote?.ltp ? Number(quote.ltp).toFixed(2) : "—"}</p><p className="text-[10px] text-aveon-muted">LTP</p></div>
                <div className="flex justify-end gap-1"><button onClick={() => openEdit(alert)} className="rounded p-1.5 text-aveon-muted hover:bg-aveon-panel2 hover:text-aveon-text" title="Edit"><Pencil size={14} /></button><button onClick={() => void remove(alert)} className="rounded p-1.5 text-aveon-muted hover:bg-aveon-sell/10 hover:text-aveon-sell" title="Delete"><Trash2 size={14} /></button></div>
              </div>;
            })}
          </div>
        </section>

        <section className="min-h-0 overflow-hidden rounded-aveon border border-aveon-border bg-aveon-panel">
          <div className="border-b border-aveon-border px-3 py-2"><h2 className="text-sm font-semibold">Triggered / Historical</h2><p className="text-[11px] text-aveon-muted">Triggered alerts remain visible as history.</p></div>
          <div className="h-full overflow-auto">
            {triggered.length === 0 ? <p className="p-4 text-xs text-aveon-muted">No triggered alerts.</p> : triggered.map((alert) => <div key={alert.serverAlertId || alert.uniqueId || `${alert.token}-${alert.createDate}`} className="flex items-center justify-between gap-3 border-b border-aveon-border/50 px-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-semibold">{alert.symbol || "—"}</p><p className="truncate text-xs text-aveon-muted">{alertConditionText(alert)}</p></div><span className="rounded bg-aveon-panel2 px-2 py-1 text-[10px] text-aveon-muted">Triggered</span></div>)}
          </div>
        </section>
      </div>

      <PriceAlertDialog open={dialogOpen} instrument={selectedInstrument} alert={editing} onClose={() => setDialogOpen(false)} onCreated={() => void load()} />
    </div>
  );
}
