"use client";

import { useEffect, useRef, useState } from "react";
import { Check, RotateCcw, SlidersHorizontal, Zap, Monitor } from "lucide-react";
import { useOeDefaults } from "@/hooks/useOeDefaults";
import { useAuthStore } from "@/lib/authStore";
import {
  ORDER_KIND_OPTIONS,
  productOptionsFor,
  segmentsForExchanges,
  validityOptionsFor,
} from "@/lib/oeDefaults";
import { displayProductType, type OrderKind, type ProductType, type Validity } from "@/types/trading";

const VALIDITY_LABEL: Record<string, string> = {
  EOS: "EOS (end of session)",
  DAY: "DAY",
  IOC: "IOC",
  GTD: "GTD",
};

export default function SettingsPage() {
  const { defaults, ready, setField, resetSegment, resetAll } = useOeDefaults();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"DEFAULTS" | "MOUSE_TRADING" | "GENERAL">("DEFAULTS");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flashSaved() {
    setSavedAt(Date.now());
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSavedAt(null), 1500);
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const authStatus = useAuthStore((s) => s.status);
  const allowedExchanges = useAuthStore((s) => s.exchanges);
  const productTypesByExchange = useAuthStore((s) => s.productTypesByExchange);
  const segments = segmentsForExchanges(allowedExchanges);
  const loadingAccount = authStatus === "unknown";
  const usingFallbackList = !loadingAccount && !allowedExchanges?.length;
  const anySet = Object.keys(defaults).length > 0;

  const [mouseDefaults, setMouseDefaults] = useState<Record<string, { quantity: number; productType?: string; validity?: string; orderKind?: string }>>({});
  const [mouseTradingActive, setMouseTradingActive] = useState(true);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("aveon.mouseTrading.segmentDefaults.v1");
      if (raw) setMouseDefaults(JSON.parse(raw));
      const activeState = window.localStorage.getItem("aveon.mouse.trading.enabled");
      if (activeState !== null) setMouseTradingActive(activeState === "true");
    } catch {}
  }, []);

  function updateMouseField(segment: string, field: string, value: any) {
    setMouseDefaults((prev) => {
      const next = { ...prev, [segment]: { ...prev[segment], [field]: value } };
      try {
        window.localStorage.setItem("aveon.mouseTrading.segmentDefaults.v1", JSON.stringify(next));
      } catch {}
      return next;
    });
    flashSaved();
  }

  function toggleMouseMaster(active: boolean) {
    setMouseTradingActive(active);
    try {
      window.localStorage.setItem("aveon.mouse.trading.enabled", String(active));
    } catch {}
    flashSaved();
  }

  return (
    <div className="-m-6 flex h-[calc(100%+3rem)] min-w-0 flex-col bg-aveon-bg text-aveon-text font-sans select-none">
      {/* Boxy Header Enclosure */}
      <div className="border-b border-aveon-border bg-aveon-panel px-6 py-4 shrink-0 shadow-sm">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-bold tracking-tight text-aveon-text">Terminal Settings</h1>
            <span className="rounded bg-aveon-primary/20 px-2 py-0.5 text-[10px] font-mono font-bold text-aveon-primary uppercase tracking-wider">PRO</span>
            <span className="text-xs text-aveon-muted">| Institutional Execution Pre-sets & Automation</span>
          </div>
          <div className="flex items-center gap-3">
            <span aria-live="polite" className={`flex items-center gap-1 rounded bg-aveon-buy/15 px-2.5 py-1 text-[11px] font-semibold text-aveon-buy transition-opacity duration-300 ${savedAt ? "opacity-100" : "opacity-0"}`}>
              <Check size={12} /> Saved
            </span>
          </div>
        </div>

        {/* Compact Boxy Tabs */}
        <div className="mx-auto max-w-7xl mt-3 flex gap-2 border-t border-aveon-border/60 pt-3 text-xs font-semibold">
          <button
            onClick={() => setActiveTab("DEFAULTS")}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 transition-all ${activeTab === "DEFAULTS" ? "bg-aveon-primary text-white shadow-sm" : "text-aveon-muted hover:bg-aveon-panel2 hover:text-aveon-text"}`}
          >
            <SlidersHorizontal size={13} />
            <span>Order Entry Defaults</span>
          </button>
          <button
            onClick={() => setActiveTab("MOUSE_TRADING")}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 transition-all ${activeTab === "MOUSE_TRADING" ? "bg-aveon-primary text-white shadow-sm" : "text-aveon-muted hover:bg-aveon-panel2 hover:text-aveon-text"}`}
          >
            <Zap size={13} />
            <span>Mouse & Chart Trading</span>
          </button>
          <button
            onClick={() => setActiveTab("GENERAL")}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 transition-all ${activeTab === "GENERAL" ? "bg-aveon-primary text-white shadow-sm" : "text-aveon-muted hover:bg-aveon-panel2 hover:text-aveon-text"}`}
          >
            <Monitor size={13} />
            <span>General & Terminal</span>
          </button>
        </div>
      </div>

      {/* High-Density Content Workspace */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-7xl space-y-4">
          {activeTab === "DEFAULTS" && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between rounded-lg border border-aveon-border bg-aveon-panel px-4 py-3 shadow-sm">
                <p className="text-xs text-aveon-muted">
                  Configure default order attributes automatically pre-selected when opening Order Entry tickets per exchange segment.
                </p>
                <button
                  type="button"
                  disabled={!anySet}
                  onClick={() => { resetAll(); flashSaved(); }}
                  className="flex h-7 items-center gap-1.5 rounded border border-aveon-border bg-aveon-panel2 px-2.5 text-xs font-semibold text-aveon-text hover:bg-aveon-panel disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <RotateCcw size={12} /> Reset all
                </button>
              </div>

              <div className="rounded-lg border border-aveon-border bg-aveon-panel overflow-hidden shadow">
                <div className="grid grid-cols-12 border-b border-aveon-border bg-aveon-panel2 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-aveon-muted">
                  <div className="col-span-3">Exchange Segment</div>
                  <div className="col-span-3">Validity Default</div>
                  <div className="col-span-3">Product Type Default</div>
                  <div className="col-span-2">Order Type Default</div>
                  <div className="col-span-1 text-right">Action</div>
                </div>

                <div className="divide-y divide-aveon-border/60">
                  {loadingAccount && (
                    <div className="p-8 text-center text-xs text-aveon-muted">Loading account exchange privileges…</div>
                  )}
                  {!loadingAccount && segments.map(({ key, label }) => {
                    const row = defaults[key] ?? {};
                    const hasAny = Object.keys(row).length > 0;
                    const availableProducts = productOptionsFor(key, productTypesByExchange[key]);

                    return (
                      <div key={key} className="grid grid-cols-12 items-center px-4 py-2.5 text-xs transition-colors hover:bg-aveon-panel2/50">
                        <div className="col-span-3">
                          <p className="font-bold text-aveon-text">{label}</p>
                          <p className="text-[10px] font-mono text-aveon-muted">{key}</p>
                        </div>
                        <div className="col-span-3 pr-3">
                          <select
                            aria-label={`${label} default validity`}
                            className="h-7 w-full rounded border border-aveon-border bg-aveon-panel2 px-2 text-xs text-aveon-text outline-none focus:border-aveon-primary cursor-pointer"
                            disabled={!ready}
                            value={row.validity ?? ""}
                            onChange={(e) => { setField(key, "validity", (e.target.value || undefined) as Validity | undefined); flashSaved(); }}
                          >
                            <option value="">App default</option>
                            {validityOptionsFor(key).map((v) => <option key={v} value={v}>{VALIDITY_LABEL[v] ?? v}</option>)}
                          </select>
                        </div>
                        <div className="col-span-3 pr-3">
                          <select
                            aria-label={`${label} default product`}
                            className="h-7 w-full rounded border border-aveon-border bg-aveon-panel2 px-2 text-xs text-aveon-text outline-none focus:border-aveon-primary cursor-pointer"
                            disabled={!ready}
                            value={row.productType ?? ""}
                            onChange={(e) => { setField(key, "productType", (e.target.value || undefined) as ProductType | undefined); flashSaved(); }}
                          >
                            <option value="">App default</option>
                            {availableProducts.map((p) => <option key={p} value={p}>{displayProductType(p, key)}</option>)}
                          </select>
                        </div>
                        <div className="col-span-2 pr-2">
                          <select
                            aria-label={`${label} default order type`}
                            className="h-7 w-full rounded border border-aveon-border bg-aveon-panel2 px-2 text-xs text-aveon-text outline-none focus:border-aveon-primary cursor-pointer"
                            disabled={!ready}
                            value={row.orderKind ?? ""}
                            onChange={(e) => { setField(key, "orderKind", (e.target.value || undefined) as OrderKind | undefined); flashSaved(); }}
                          >
                            <option value="">App default</option>
                            {ORDER_KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                        <div className="col-span-1 text-right">
                          <button
                            type="button"
                            title={`Reset ${label}`}
                            disabled={!hasAny}
                            onClick={() => { resetSegment(key); flashSaved(); }}
                            className="rounded p-1 text-aveon-muted hover:bg-aveon-panel hover:text-aveon-text disabled:pointer-events-none disabled:opacity-20"
                          >
                            <RotateCcw size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === "MOUSE_TRADING" && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between rounded-lg border border-aveon-border bg-aveon-panel px-4 py-3 shadow-sm">
                <p className="text-xs text-aveon-muted">
                  Configure quick order templates when clicking price levels directly from charts or market depth ladders.
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-aveon-muted">Click-to-Trade:</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={mouseTradingActive}
                      onChange={(e) => toggleMouseMaster(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-aveon-panel2 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-aveon-primary"></div>
                  </label>
                </div>
              </div>

              <div className="rounded-lg border border-aveon-border bg-aveon-panel overflow-hidden shadow">
                <div className="grid grid-cols-12 border-b border-aveon-border bg-aveon-panel2 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-aveon-muted">
                  <div className="col-span-3">Exchange Segment</div>
                  <div className="col-span-3">Quick Quantity</div>
                  <div className="col-span-3">Dynamic Product Type</div>
                  <div className="col-span-2">Validity</div>
                  <div className="col-span-1 text-right">Action</div>
                </div>

                <div className="divide-y divide-aveon-border/60">
                  {segments.map(({ key, label }) => {
                    const row = mouseDefaults[key] ?? { quantity: 1 };
                    const availableProducts = productOptionsFor(key, productTypesByExchange[key]);

                    return (
                      <div key={key} className="grid grid-cols-12 items-center px-4 py-2.5 text-xs transition-colors hover:bg-aveon-panel2/50">
                        <div className="col-span-3">
                          <p className="font-bold text-aveon-text">{label}</p>
                          <p className="text-[10px] font-mono text-aveon-muted">{key}</p>
                        </div>
                        <div className="col-span-3 pr-3">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={row.quantity ?? 1}
                            onChange={(e) => updateMouseField(key, "quantity", Math.max(1, Number(e.target.value) || 1))}
                            className="h-7 w-full rounded border border-aveon-border bg-aveon-panel2 px-2 text-xs font-mono text-aveon-text outline-none focus:border-aveon-primary"
                          />
                        </div>
                        <div className="col-span-3 pr-3">
                          <select
                            aria-label={`${label} mouse product`}
                            className="h-7 w-full rounded border border-aveon-border bg-aveon-panel2 px-2 text-xs text-aveon-text outline-none focus:border-aveon-primary cursor-pointer"
                            value={row.productType ?? availableProducts[0] ?? ""}
                            onChange={(e) => updateMouseField(key, "productType", e.target.value)}
                          >
                            {availableProducts.map((p) => <option key={p} value={p}>{displayProductType(p, key)}</option>)}
                          </select>
                        </div>
                        <div className="col-span-2 pr-2">
                          <select
                            aria-label={`${label} mouse validity`}
                            className="h-7 w-full rounded border border-aveon-border bg-aveon-panel2 px-2 text-xs text-aveon-text outline-none focus:border-aveon-primary cursor-pointer"
                            value={row.validity ?? "DAY"}
                            onChange={(e) => updateMouseField(key, "validity", e.target.value)}
                          >
                            {validityOptionsFor(key).map((v) => <option key={v} value={v}>{VALIDITY_LABEL[v] ?? v}</option>)}
                          </select>
                        </div>
                        <div className="col-span-1 text-right">
                          <button
                            type="button"
                            title={`Reset ${label} mouse defaults`}
                            onClick={() => updateMouseField(key, "quantity", 1)}
                            className="rounded p-1 text-aveon-muted hover:bg-aveon-panel hover:text-aveon-text"
                          >
                            <RotateCcw size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === "GENERAL" && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="rounded-lg border border-aveon-border bg-aveon-panel p-6 shadow">
                <h2 className="text-xs font-bold uppercase tracking-wider text-aveon-muted mb-2">Terminal Preferences</h2>
                <p className="text-xs text-aveon-text">Additional display density and keyboard mapping options will appear here.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}