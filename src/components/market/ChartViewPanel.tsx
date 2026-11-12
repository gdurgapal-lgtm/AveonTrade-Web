"use client";

import React, { useEffect, useState } from "react";
import {
  Bell,
  CandlestickChart,
  Settings2,
  Maximize2,
  Minimize2,
  TrendingUp,
  Minus,
  GitCommitHorizontal,
  Columns,
  ListFilter,
  Tag,
  Trash2,
  Clock,
  BarChart2,
  Sliders,
  MousePointer,
  Plus,
  Sparkles,
} from "lucide-react";
import dynamic from "next/dynamic";
import type { Candle, ChartOverlays, ChartDisplayStyle } from "./PriceChart";
import { getTimeframeMs, DEFAULT_EMA_COLORS, DEFAULT_SMA_COLORS } from "./PriceChart";

const PriceChart = dynamic(() => import("./PriceChart"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-aveon-panel text-xs text-aveon-muted">
      Loading Chart Canvas...
    </div>
  ),
});
import { usePanelMaximize } from "@/hooks/usePanelMaximize";
import {
  instrumentDisplayName,
  instrumentSearchSubtitle,
  exchangeSegmentFor,
  isIndexInstrument,
  buildOrderPayload,
  type Instrument,
  type ProductType,
  type Validity,
} from "@/types/trading";
import { formatCurrency, formatNumber, pnlTone } from "@/lib/format";
import { validityOptionsFor } from "@/lib/oeDefaults";
import { getDynamicProductTypes } from "@/lib/dynamicProductTypes";
import GoogleStyleResearchSidebar from "@/components/research/GoogleStyleResearchSidebar";

const CHART_OVERLAYS_STORAGE_KEY = "aveontrade.chart.overlays.v4";

interface StoredOverlays extends ChartOverlays {
  emaPeriods?: number[];
  smaPeriods?: number[];
  indicatorColors?: Record<string, string>;
}

function readSavedOverlays(): StoredOverlays {
  if (typeof window === "undefined") {
    return {
      volume: true,
      emaPeriods: [20, 50],
      smaPeriods: [200],
      indicatorColors: {
        EMA_20: "#f59e0b",
        EMA_50: "#38bdf8",
        SMA_200: "#a855f7",
      },
    };
  }
  try {
    const saved = JSON.parse(window.localStorage.getItem(CHART_OVERLAYS_STORAGE_KEY) ?? "{}") as Record<string, unknown>;
    return {
      volume: saved.volume === undefined ? true : saved.volume === true,
      emaPeriods: Array.isArray(saved.emaPeriods) ? (saved.emaPeriods as number[]) : [20, 50],
      smaPeriods: Array.isArray(saved.smaPeriods) ? (saved.smaPeriods as number[]) : [200],
      indicatorColors:
        saved.indicatorColors && typeof saved.indicatorColors === "object"
          ? (saved.indicatorColors as Record<string, string>)
          : {
              EMA_20: "#f59e0b",
              EMA_50: "#38bdf8",
              SMA_200: "#a855f7",
            },
      rsiPeriod: typeof saved.rsiPeriod === "number" ? saved.rsiPeriod : undefined,
      bollingerPeriod: typeof saved.bollingerPeriod === "number" ? saved.bollingerPeriod : undefined,
      supertrend: saved.supertrend === true,
      vwap: saved.vwap === true,
      cpr: saved.cpr === true,
      macd: saved.macd === true,
      atr: saved.atr === true,
      dmi: saved.dmi === true,
    };
  } catch {
    return {
      volume: true,
      emaPeriods: [20, 50],
      smaPeriods: [200],
      indicatorColors: {
        EMA_20: "#f59e0b",
        EMA_50: "#38bdf8",
        SMA_200: "#a855f7",
      },
    };
  }
}

const DRAWING_TOOLS = [
  { id: "segment", label: "Trendline", icon: TrendingUp },
  { id: "rayLine", label: "Ray Line", icon: GitCommitHorizontal },
  { id: "horizontalStraightLine", label: "Horizontal S/R", icon: Minus },
  { id: "parallelStraightLine", label: "Parallel Channel", icon: Columns },
  { id: "fibonacciLine", label: "Fibonacci Retracement", icon: ListFilter },
  { id: "priceLine", label: "Price Tag Line", icon: Tag },
] as const;

interface ChartViewPanelProps {
  selected: Instrument | null;
  quotes: Record<string, any>;
  selectedQuote?: { ltp?: number; change?: number; change_percent?: number; volume?: number } | null;
  ranges: any[];
  rangeIdx: number;
  setRangeIdx: (idx: number) => void;
  timeframes: string[];
  timeframe: string;
  setTimeframe: (tf: string) => void;
  candles: Candle[];
  chartLoading: boolean;
  chartMessage: string | null;
  onCreateAlert?: () => void;
}

export default function ChartViewPanel({
  selected,
  quotes,
  selectedQuote,
  ranges,
  rangeIdx,
  setRangeIdx,
  timeframes,
  timeframe,
  setTimeframe,
  candles,
  chartLoading,
  chartMessage,
  onCreateAlert,
}: ChartViewPanelProps) {
  const { maximized, toggle, Portal } = usePanelMaximize();
  const [overlayMenuOpen, setOverlayMenuOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [overlays, setOverlays] = useState<StoredOverlays>(readSavedOverlays);
  const [chartStyle, setChartStyle] = useState<ChartDisplayStyle>("candle_solid");
  const [activeDrawingTool, setActiveDrawingTool] = useState<string | null>(null);
  const [clearDrawingsVersion, setClearDrawingsVersion] = useState(0);
  const [countdown, setCountdown] = useState<string>("");
  const [showResearchSidebar, setShowResearchSidebar] = useState(true);
  
  // Lifted research messages state so history persists across toggle / maximize / minimize
  const [researchMessages, setResearchMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);

  const [mouseTradingEnabled, setMouseTradingEnabled] = useState(false);
  const [mouseTradeQuantity, setMouseTradeQuantity] = useState("1");
  const [mouseTradeProduct, setMouseTradeProduct] = useState<ProductType | "">("");
  const [mouseTradeValidity, setMouseTradeValidity] = useState<Validity | "">("");
  const [mouseTradeSubmitting, setMouseTradeSubmitting] = useState(false);
  const [dynamicProductCodes, setDynamicProductCodes] = useState<string[]>([]);

  const mouseTradeSegment = selected ? (exchangeSegmentFor(selected) || selected.exchange || "").toUpperCase() : "";
  const isMouseTradeDerivative = !["NSE_EQ", "BSE_EQ", "NSE", "BSE"].includes(mouseTradeSegment) ||
    Boolean((selected as any)?.optionType) || Boolean((selected as any)?.expiryDate ?? (selected as any)?.expiry);
  const mouseTradeProductOptions = dynamicProductCodes.flatMap((code): ProductType[] => {
    if (code === "DELIVERY") return [isMouseTradeDerivative ? "NRML" : "CNC"];
    if (code === "CARRYFORWARD") return isMouseTradeDerivative ? ["NRML"] : [];
    if (code === "INTRADAY") return ["MIS"];
    if (code === "COVER") return ["CO"];
    if (code === "BRACKET") return ["BO"];
    return [];
  }).filter((code, index, all) => all.indexOf(code) === index);
  const mouseTradeValidityOptions = validityOptionsFor(mouseTradeSegment);

  const [emaInput, setEmaInput] = useState<string>("9");
  const [emaColorInput, setEmaColorInput] = useState<string>("#22c55e");
  const [smaInput, setSmaInput] = useState<string>("50");
  const [smaColorInput, setSmaColorInput] = useState<string>("#06b6d4");

  useEffect(() => {
    let active = true;
    void getDynamicProductTypes().then((products) => {
      if (active) setDynamicProductCodes(products.map((item) => item.code));
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(CHART_OVERLAYS_STORAGE_KEY, JSON.stringify(overlays));
    } catch {}
  }, [overlays]);

  useEffect(() => {
    const tfMs = getTimeframeMs(timeframe);
    if (tfMs >= 86_400_000) {
      setCountdown("");
      return;
    }
    const updateTimer = () => {
      const now = Date.now();
      const remSec = Math.max(0, Math.floor((tfMs - (now % tfMs)) / 1000));
      const mins = Math.floor(remSec / 60);
      const secs = remSec % 60;
      const hours = Math.floor(mins / 60);
      if (hours > 0) {
        setCountdown(`${hours}:${String(mins % 60).padStart(2, "0")}:${String(secs).padStart(2, "0")}`);
      } else {
        setCountdown(`${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`);
      }
    };
    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [timeframe]);

  const toggleBooleanOverlay = (name: "supertrend" | "vwap" | "cpr" | "volume" | "macd" | "atr" | "dmi") => {
    setOverlays((current) => ({ ...current, [name]: !current[name] }));
  };

  const updateIndicatorColor = (key: string, color: string) => {
    setOverlays((current) => ({
      ...current,
      indicatorColors: {
        ...(current.indicatorColors ?? {}),
        [key]: color,
      },
    }));
  };

  const activeQuote = selected ? selectedQuote ?? null : null;

  useEffect(() => {
    if (!mouseTradeSegment || typeof window === "undefined") return;
    const instrumentLot = Number((selected as any)?.lotSize ?? (selected as any)?.regularLot ?? 1);
    let quantity = Number.isFinite(instrumentLot) && instrumentLot > 0 ? instrumentLot : 1;
    let productType: string = mouseTradeProductOptions[0] ?? "";
    let validity: string = mouseTradeValidityOptions[0] ?? "";
    try {
      const saved = JSON.parse(window.localStorage.getItem("aveon.mouseTrading.segmentDefaults.v1") ?? "{}");
      const row = saved?.[mouseTradeSegment];
      if (row) {
        const savedQuantity = Number(row.quantity);
        if (Number.isFinite(savedQuantity) && savedQuantity > 0) quantity = savedQuantity;
        if (mouseTradeProductOptions.includes(row.productType)) productType = row.productType;
        if (mouseTradeValidityOptions.includes(row.validity)) validity = row.validity;
      }
      const oe = JSON.parse(window.localStorage.getItem("aveon.orderDefaults.v1") ?? "{}");
      const oeRow = oe?.[mouseTradeSegment];
      if (oeRow) {
        if (!row && Number.isFinite(Number(oeRow.quantity)) && Number(oeRow.quantity) > 0) quantity = Number(oeRow.quantity);
        if (!row?.productType && mouseTradeProductOptions.includes(oeRow.productType)) productType = oeRow.productType;
        if (!row?.validity && mouseTradeValidityOptions.includes(oeRow.validity)) validity = oeRow.validity;
      }
    } catch {}
    setMouseTradeQuantity(String(quantity));
    setMouseTradeProduct(productType as ProductType | "");
    setMouseTradeValidity(validity as Validity | "");
  }, [mouseTradeSegment, selected?.tradingSymbol, selected?.symbol, dynamicProductCodes.join(",")]);

  useEffect(() => {
    if (!mouseTradeSegment || !mouseTradeProduct || !mouseTradeValidity || typeof window === "undefined") return;
    const quantity = Number(mouseTradeQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    try {
      const raw = window.localStorage.getItem("aveon.mouseTrading.segmentDefaults.v1");
      const saved = raw ? JSON.parse(raw) : {};
      saved[mouseTradeSegment] = {
        ...(saved[mouseTradeSegment] ?? {}),
        quantity,
        productType: mouseTradeProduct,
        validity: mouseTradeValidity,
      };
      window.localStorage.setItem("aveon.mouseTrading.segmentDefaults.v1", JSON.stringify(saved));
    } catch {}
  }, [mouseTradeSegment, mouseTradeQuantity, mouseTradeProduct, mouseTradeValidity]);

  async function handleDirectMouseTrade(side: "BUY" | "SELL", price: number) {
    if (!selected || mouseTradeSubmitting) return;
    if (isIndexInstrument(selected)) {
      window.dispatchEvent(new CustomEvent("aveon:toast", { detail: { message: "Indices cannot be traded. Select a stock, future or option.", type: "error" } }));
      return;
    }
    const segment = mouseTradeSegment;
    const qty = Number(mouseTradeQuantity);
    if (!segment || !Number.isFinite(qty) || qty <= 0 || !mouseTradeProduct || !mouseTradeValidity) {
      window.dispatchEvent(new CustomEvent("aveon:toast", { detail: { message: "Set a valid quantity, product type and validity before trading.", type: "error" } }));
      return;
    }
    setMouseTradeSubmitting(true);
    const productType = mouseTradeProduct;
    const validity = mouseTradeValidity;

    const basePayload = buildOrderPayload({
      instrument: selected,
      side,
      productType: productType as any,
      orderKind: "LIMIT",
      quantity: qty,
      price,
      validity: validity as any,
    }) as Record<string, any>;

    const payload = basePayload;
    if (!payload.scrip_info?.scrip_token) {
      payload.scrip_info = {
        ...payload.scrip_info,
        scrip_token: Number((selected as any).scripToken ?? (selected as any).token ?? (selected as any).scrip_token ?? 0),
      };
    }
    payload.price = Number(price);

    try {
      const res = await fetch("/api/broker/transactional/v1/orders/regular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      const json = await res.json();
      if (
        res.ok &&
        (json.success ||
          json.status === "success" ||
          json?.data?.status === "SUCCESS" ||
          json?.code === 200)
      ) {
        window.dispatchEvent(
          new CustomEvent("aveon:toast", {
            detail: {
              message: `Direct ${side} order placed: ${qty} × ${instrumentDisplayName(selected)} @ ₹${price}`,
              type: "success",
            },
          })
        );
        window.dispatchEvent(new CustomEvent("aveon:orders-updated"));
      } else {
        throw new Error(json.message || json.error || "Order execution failed");
      }
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent("aveon:toast", {
          detail: { message: err.message || "Failed to place direct order", type: "error" },
        })
      );
    } finally {
      setMouseTradeSubmitting(false);
    }
  }

  return (
    <Portal>
      <div className="flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden rounded-aveon border border-aveon-border bg-aveon-panel">
        {selected ? (
          <div className="border-b border-aveon-border">
            <div className="flex items-center justify-between px-3 py-2">
              <div>
                <div className="flex items-center gap-2">
                  <CandlestickChart size={16} className="text-aveon-primary" />
                  <p className="text-[11px] font-semibold">{instrumentDisplayName(selected)}</p>
                  <span className="rounded bg-aveon-panel2 px-1.5 py-0.5 text-[10px] text-aveon-muted">
                    {exchangeSegmentFor(selected) || selected.exchange}
                  </span>
                  {countdown && (
                    <span
                      title="Time remaining in current candle"
                      className="inline-flex items-center gap-1 rounded bg-aveon-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-aveon-primary"
                    >
                      <Clock size={10} />
                      {countdown}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-aveon-muted">{instrumentSearchSubtitle(selected)}</p>
              </div>

              <div className="flex items-center gap-3">
                {!isIndexInstrument(selected) && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      title="Quick Buy (F1)"
                      onClick={() =>
                        window.dispatchEvent(
                          new CustomEvent("aveon:open-order-entry", {
                            detail: { instrument: selected, side: "BUY", price: activeQuote?.ltp },
                          })
                        )
                      }
                      className="rounded bg-aveon-buy px-2.5 py-1 text-[11px] font-bold text-white shadow-sm hover:opacity-90"
                    >
                      B
                    </button>
                    <button
                      type="button"
                      title="Quick Sell (F2)"
                      onClick={() =>
                        window.dispatchEvent(
                          new CustomEvent("aveon:open-order-entry", {
                            detail: { instrument: selected, side: "SELL", price: activeQuote?.ltp },
                          })
                        )
                      }
                      className="rounded bg-aveon-sell px-2.5 py-1 text-[11px] font-bold text-white shadow-sm hover:opacity-90"
                    >
                      S
                    </button>
                  </div>
                )}
                {activeQuote && (
                  <div className="text-right">
                    <p className="text-lg font-semibold">{formatCurrency(activeQuote.ltp)}</p>
                    <p className={`text-xs ${pnlTone(activeQuote.change) === "buy" ? "text-aveon-buy" : "text-aveon-sell"}`}>
                      {formatNumber(activeQuote.change)} ({formatNumber(activeQuote.change_percent)}%)
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-aveon-border/70 px-3 py-1 text-[11px] text-aveon-muted">
              <span className="font-medium text-aveon-text">Chart</span>
              <select
                aria-label="Chart Timeframe"
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="rounded border border-aveon-border bg-aveon-panel2 px-2 py-0.5 text-[11px] font-medium text-aveon-text outline-none cursor-pointer focus:border-aveon-primary"
              >
                {timeframes.map((tf) => (
                  <option key={tf} value={tf}>
                    {tf}
                  </option>
                ))}
              </select>

              <span className="mx-0.5 h-4 border-l border-aveon-border" />
              
              <div className="flex items-center gap-1">
                <BarChart2 size={13} className="text-aveon-muted" />
                <select
                  aria-label="Chart Style"
                  value={chartStyle}
                  onChange={(e) => setChartStyle(e.target.value as ChartDisplayStyle)}
                  className="rounded border border-aveon-border bg-aveon-panel2 px-1.5 py-0.5 text-[11px] text-aveon-text outline-none cursor-pointer"
                >
                  <option value="candle_solid">Candles</option>
                  <option value="heikin_ashi">Heikin-Ashi</option>
                  <option value="candle_stroke">Hollow Candles</option>
                  <option value="ohlc">OHLC Bars</option>
                  <option value="area">Area</option>
                </select>
              </div>

              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  title={mouseTradingEnabled ? "Disable Mouse Click Trading" : "Enable Mouse Click Trading"}
                  onClick={() => setMouseTradingEnabled((v) => !v)}
                  className={`flex items-center gap-1 rounded px-2 py-1 transition-all ${
                    mouseTradingEnabled
                      ? "bg-aveon-primary text-white shadow"
                      : "text-aveon-muted hover:bg-aveon-panel2 hover:text-aveon-text"
                  }`}
                >
                  <MousePointer size={14} />
                  <span className="text-[10px] font-semibold">{mouseTradingEnabled ? "Direct Trade ON" : "Mouse Trade"}</span>
                </button>
                
                {mouseTradingEnabled && (
                  <div className="flex flex-wrap items-center gap-1 rounded border border-aveon-primary/40 bg-aveon-panel2 px-1.5 py-1" aria-label="Mouse trading settings">
                    <label className="flex items-center gap-1 text-[10px] text-aveon-muted">
                      Product
                      <select aria-label="Mouse trade product type" value={mouseTradeProduct} onChange={(e) => setMouseTradeProduct(e.target.value as ProductType)} className="max-w-[92px] rounded border border-aveon-border bg-aveon-panel px-1 py-0.5 text-[11px] text-aveon-text" disabled={mouseTradeSubmitting}>
                        {mouseTradeProductOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>
                    <label className="flex items-center gap-1 text-[10px] text-aveon-muted">
                      Qty
                      <input aria-label="Mouse trade quantity" type="number" min="1" step="1" value={mouseTradeQuantity} onChange={(e) => setMouseTradeQuantity(e.target.value)} className="w-[66px] rounded border border-aveon-border bg-aveon-panel px-1 py-0.5 text-[11px] text-aveon-text" disabled={mouseTradeSubmitting} />
                    </label>
                    <label className="flex items-center gap-1 text-[10px] text-aveon-muted">
                      Validity
                      <select aria-label="Mouse trade validity" value={mouseTradeValidity} onChange={(e) => setMouseTradeValidity(e.target.value as Validity)} className="max-w-[72px] rounded border border-aveon-border bg-aveon-panel px-1 py-0.5 text-[11px] text-aveon-text" disabled={mouseTradeSubmitting}>
                        {mouseTradeValidityOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>
                    {mouseTradeSubmitting && <span className="text-[10px] text-aveon-muted">Sending…</span>}
                  </div>
                )}

                {/* Google Research Toggle Button */}
                <button
                  type="button"
                  title="Toggle Google Research Sidebar"
                  onClick={() => setShowResearchSidebar((prev) => !prev)}
                  className={`flex items-center gap-1 rounded px-2 py-1 transition-all ${
                    showResearchSidebar
                      ? "bg-aveon-primary text-white shadow"
                      : "text-aveon-muted hover:bg-aveon-panel2 hover:text-aveon-text"
                  }`}
                >
                  <Sparkles size={14} />
                  <span className="text-[10px] font-semibold">Research</span>
                </button>

                <button
                  type="button"
                  title="Configure moving averages & indicator colors"
                  onClick={() => setSettingsModalOpen(true)}
                  className="rounded p-1 text-aveon-muted hover:bg-aveon-panel2 hover:text-aveon-text"
                >
                  <Sliders size={14} />
                </button>
                
                <button
                  type="button"
                  title="Create price alert"
                  onClick={onCreateAlert}
                  disabled={!selected}
                  className="rounded p-1 text-aveon-muted hover:bg-aveon-primary/10 hover:text-aveon-primary disabled:opacity-40"
                >
                  <Bell size={14} />
                </button>

                <div className="relative">
                  <button
                    type="button"
                    title="Chart overlays & indicators"
                    aria-expanded={overlayMenuOpen}
                    onClick={() => setOverlayMenuOpen((open) => !open)}
                    className={`flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-aveon-panel2 ${
                      overlayMenuOpen ? "bg-aveon-panel2 text-aveon-primary" : ""
                    }`}
                  >
                    <Settings2 size={14} />
                    <span>Indicators</span>
                  </button>
                  {overlayMenuOpen && (
                    <div className="absolute right-0 top-7 z-30 w-60 rounded-aveon border border-aveon-border bg-aveon-panel p-2 shadow-xl">
                      <div className="mb-1 flex items-center justify-between px-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-aveon-muted">
                          Active Moving Averages
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setOverlayMenuOpen(false);
                            setSettingsModalOpen(true);
                          }}
                          className="text-[10px] font-semibold text-aveon-primary hover:underline"
                        >
                          Edit Colors
                        </button>
                      </div>
                      <div className="mb-2 px-1 text-xs text-aveon-text">
                        EMAs: {overlays.emaPeriods?.join(", ") || "None"}
                        <br />
                        SMAs: {overlays.smaPeriods?.join(", ") || "None"}
                      </div>

                      <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-aveon-muted">
                        Chart Overlays
                      </p>
                      <label className="flex cursor-pointer items-center justify-between rounded px-1.5 py-1 text-xs hover:bg-aveon-panel2">
                        <span>VWAP + Bands</span>
                        <input type="checkbox" checked={overlays.vwap === true} onChange={() => toggleBooleanOverlay("vwap")} />
                      </label>
                      <label className="flex cursor-pointer items-center justify-between rounded px-1.5 py-1 text-xs hover:bg-aveon-panel2">
                        <span>Supertrend 10,3</span>
                        <input type="checkbox" checked={overlays.supertrend === true} onChange={() => toggleBooleanOverlay("supertrend")} />
                      </label>
                      <label className="flex cursor-pointer items-center justify-between rounded px-1.5 py-1 text-xs hover:bg-aveon-panel2">
                        <span>CPR + PDH/PDL</span>
                        <input type="checkbox" checked={overlays.cpr === true} onChange={() => toggleBooleanOverlay("cpr")} />
                      </label>
                      <label className="flex cursor-pointer items-center justify-between rounded px-1.5 py-1 text-xs hover:bg-aveon-panel2">
                        <span>Bollinger 20</span>
                        <input
                          type="checkbox"
                          checked={!!overlays.bollingerPeriod}
                          onChange={() => setOverlays((c) => ({ ...c, bollingerPeriod: c.bollingerPeriod ? undefined : 20 }))}
                        />
                      </label>

                      <p className="mb-1 mt-2 border-t border-aveon-border pt-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-aveon-muted">
                        Sub-Pane Studies
                      </p>
                      <label className="flex cursor-pointer items-center justify-between rounded px-1.5 py-1 text-xs hover:bg-aveon-panel2">
                        <span>Volume Bars</span>
                        <input type="checkbox" checked={overlays.volume !== false} onChange={() => toggleBooleanOverlay("volume")} />
                      </label>
                      <label className="flex cursor-pointer items-center justify-between rounded px-1.5 py-1 text-xs hover:bg-aveon-panel2">
                        <span>RSI 14</span>
                        <input
                          type="checkbox"
                          checked={!!overlays.rsiPeriod}
                          onChange={() => setOverlays((c) => ({ ...c, rsiPeriod: c.rsiPeriod ? undefined : 14 }))}
                        />
                      </label>
                      <label className="flex cursor-pointer items-center justify-between rounded px-1.5 py-1 text-xs hover:bg-aveon-panel2">
                        <span>MACD</span>
                        <input type="checkbox" checked={overlays.macd === true} onChange={() => toggleBooleanOverlay("macd")} />
                      </label>
                      <label className="flex cursor-pointer items-center justify-between rounded px-1.5 py-1 text-xs hover:bg-aveon-panel2">
                        <span>ATR 14</span>
                        <input type="checkbox" checked={overlays.atr === true} onChange={() => toggleBooleanOverlay("atr")} />
                      </label>
                      <label className="flex cursor-pointer items-center justify-between rounded px-1.5 py-1 text-xs hover:bg-aveon-panel2">
                        <span>ADX / DMI</span>
                        <input type="checkbox" checked={overlays.dmi === true} onChange={() => toggleBooleanOverlay("dmi")} />
                      </label>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  title={maximized ? "Restore chart" : "Fullscreen chart"}
                  onClick={toggle}
                  className="rounded p-1 hover:bg-aveon-panel2"
                >
                  {maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="border-b border-aveon-border px-4 py-3">
            <p className="text-sm text-aveon-muted">Select a symbol from your watchlist</p>
          </div>
        )}

        {settingsModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-[460px] rounded-aveon border border-aveon-border bg-aveon-panel p-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-aveon-border pb-3">
                <h3 className="text-sm font-bold text-aveon-text">Configure Moving Averages & Colors</h3>
                <button type="button" onClick={() => setSettingsModalOpen(false)} className="text-xs text-aveon-muted hover:text-aveon-text">
                  ✕
                </button>
              </div>
              <div className="space-y-4 py-4 text-xs">
                <div>
                  <label className="mb-1.5 block font-medium text-aveon-muted">
                    Add / Manage EMA Periods & Line Colors
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={emaInput}
                      onChange={(e) => setEmaInput(e.target.value)}
                      placeholder="Period (e.g. 9, 20, 50)"
                      className="flex-1 rounded border border-aveon-border bg-aveon-panel2 px-3 py-1.5 text-aveon-text outline-none focus:border-aveon-primary"
                    />
                    <input
                      type="color"
                      value={emaColorInput}
                      onChange={(e) => setEmaColorInput(e.target.value)}
                      title="Select EMA line color"
                      className="h-8 w-10 cursor-pointer rounded border border-aveon-border bg-aveon-panel2 p-0.5"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const p = parseInt(emaInput, 10);
                        if (Number.isFinite(p) && p > 0) {
                          setOverlays((c) => ({
                            ...c,
                            emaPeriods: Array.from(new Set([...(c.emaPeriods || []), p])).sort((a, b) => a - b),
                            indicatorColors: {
                              ...(c.indicatorColors ?? {}),
                              [`EMA_${p}`]: emaColorInput,
                            },
                          }));
                          setEmaInput("");
                        }
                      }}
                      className="flex items-center gap-1 rounded bg-aveon-primary px-3 py-1.5 font-semibold text-white hover:opacity-90"
                    >
                      <Plus size={14} /> Add EMA
                    </button>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {overlays.emaPeriods?.map((p, idx) => {
                      const currentColor =
                        overlays.indicatorColors?.[`EMA_${p}`] ||
                        DEFAULT_EMA_COLORS[idx % DEFAULT_EMA_COLORS.length];
                      return (
                        <span
                          key={`ema-${p}`}
                          className="inline-flex items-center gap-1.5 rounded border border-aveon-border bg-aveon-panel2 px-2 py-1 font-mono text-aveon-text"
                        >
                          <input
                            type="color"
                            value={currentColor}
                            onChange={(e) => updateIndicatorColor(`EMA_${p}`, e.target.value)}
                            title={`Change EMA ${p} color`}
                            className="h-4 w-4 cursor-pointer rounded border-0 bg-transparent p-0"
                          />
                          <span style={{ color: currentColor }}>EMA {p}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setOverlays((c) => ({
                                ...c,
                                emaPeriods: c.emaPeriods?.filter((x) => x !== p),
                              }))
                            }
                            className="ml-1 text-aveon-muted hover:text-aveon-sell"
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-aveon-border pt-3">
                  <label className="mb-1.5 block font-medium text-aveon-muted">
                    Add / Manage SMA Periods & Line Colors
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={smaInput}
                      onChange={(e) => setSmaInput(e.target.value)}
                      placeholder="Period (e.g. 50, 100, 200)"
                      className="flex-1 rounded border border-aveon-border bg-aveon-panel2 px-3 py-1.5 text-aveon-text outline-none focus:border-aveon-primary"
                    />
                    <input
                      type="color"
                      value={smaColorInput}
                      onChange={(e) => setSmaColorInput(e.target.value)}
                      title="Select SMA line color"
                      className="h-8 w-10 cursor-pointer rounded border border-aveon-border bg-aveon-panel2 p-0.5"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const p = parseInt(smaInput, 10);
                        if (Number.isFinite(p) && p > 0) {
                          setOverlays((c) => ({
                            ...c,
                            smaPeriods: Array.from(new Set([...(c.smaPeriods || []), p])).sort((a, b) => a - b),
                            indicatorColors: {
                              ...(c.indicatorColors ?? {}),
                              [`SMA_${p}`]: smaColorInput,
                            },
                          }));
                          setSmaInput("");
                        }
                      }}
                      className="flex items-center gap-1 rounded bg-aveon-primary px-3 py-1.5 font-semibold text-white hover:opacity-90"
                    >
                      <Plus size={14} /> Add SMA
                    </button>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {overlays.smaPeriods?.map((p, idx) => {
                      const currentColor =
                        overlays.indicatorColors?.[`SMA_${p}`] ||
                        DEFAULT_SMA_COLORS[idx % DEFAULT_SMA_COLORS.length];
                      return (
                        <span
                          key={`sma-${p}`}
                          className="inline-flex items-center gap-1.5 rounded border border-aveon-border bg-aveon-panel2 px-2 py-1 font-mono text-aveon-text"
                        >
                          <input
                            type="color"
                            value={currentColor}
                            onChange={(e) => updateIndicatorColor(`SMA_${p}`, e.target.value)}
                            title={`Change SMA ${p} color`}
                            className="h-4 w-4 cursor-pointer rounded border-0 bg-transparent p-0"
                          />
                          <span style={{ color: currentColor }}>SMA {p}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setOverlays((c) => ({
                                ...c,
                                smaPeriods: c.smaPeriods?.filter((x) => x !== p),
                              }))
                            }
                            className="ml-1 text-aveon-muted hover:text-aveon-sell"
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-aveon-border pt-3">
                <button
                  type="button"
                  onClick={() => setSettingsModalOpen(false)}
                  className="rounded bg-aveon-primary px-4 py-1.5 text-xs font-semibold text-white shadow hover:opacity-90"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="relative flex flex-1 min-h-0 overflow-hidden">
          {selected && (
            <div className="flex w-9 shrink-0 flex-col items-center gap-1 border-r border-aveon-border bg-aveon-panel py-2">
              {DRAWING_TOOLS.map((tool) => {
                const Icon = tool.icon;
                const active = activeDrawingTool === tool.id;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    title={tool.label}
                    onClick={() => setActiveDrawingTool(active ? null : tool.id)}
                    className={`rounded p-1.5 transition-colors ${
                      active
                        ? "bg-aveon-primary/20 text-aveon-primary"
                        : "text-aveon-muted hover:bg-aveon-panel2 hover:text-aveon-text"
                    }`}
                  >
                    <Icon size={15} />
                  </button>
                );
              })}
              <div className="my-1 w-5 border-t border-aveon-border" />
              <button
                type="button"
                title="Clear all drawings"
                onClick={() => {
                  setActiveDrawingTool(null);
                  setClearDrawingsVersion((v) => v + 1);
                }}
                className="rounded p-1.5 text-aveon-muted hover:bg-aveon-sell/15 hover:text-aveon-sell"
              >
                <Trash2 size={15} />
              </button>
            </div>
          )}

          <div className="relative flex-1 min-w-0 p-2">
            <PriceChart
              symbol={selected?.tradingSymbol || selected?.symbol}
              candles={candles}
              timeframe={timeframe}
              overlays={overlays}
              liveQuote={activeQuote}
              chartStyle={chartStyle}
              activeDrawingTool={activeDrawingTool}
              onDrawingComplete={() => setActiveDrawingTool(null)}
              clearDrawingsVersion={clearDrawingsVersion}
              mouseTradingEnabled={mouseTradingEnabled}
              tickSize={Number((selected as any)?.tickSize ?? (selected as any)?.priceTick ?? 0.05)}
              onMouseTrade={(side, price) => handleDirectMouseTrade(side, price)}
            />
            {selected && chartLoading && (
              <div className="absolute inset-2 flex items-center justify-center bg-aveon-panel/60">
                <p className="text-xs text-aveon-muted">Loading chart…</p>
              </div>
            )}
            {selected && !chartLoading && candles.length === 0 && chartMessage && (
              <div className="absolute inset-x-2 bottom-4 text-center text-xs text-aveon-muted">{chartMessage}</div>
            )}
          </div>

          {/* Research Sidebar (Conditional mount + shrink-0 ensures toggle works smoothly both ways without requiring screen maximize) */}
          {showResearchSidebar && (
            <div className="flex h-full shrink-0">
              <GoogleStyleResearchSidebar 
                activeSymbol={selected?.tradingSymbol || selected?.symbol || "MARKET"} 
                messages={researchMessages}
                setMessages={setResearchMessages}
              />
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}