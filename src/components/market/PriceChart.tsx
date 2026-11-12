"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { init, dispose, type Chart, type KLineData, type CandleType } from "klinecharts";
import { ensureCustomIndicatorsRegistered } from "@/lib/klineIndicators";

export interface Candle {
  O?: number; H?: number; L?: number; C?: number; V?: number; DT?: string | number;
  open?: number; high?: number; low?: number; close?: number; volume?: number;
  time?: string | number;
  date?: string | number;
}

export type ChartDisplayStyle = "candle_solid" | "candle_stroke" | "ohlc" | "area" | "heikin_ashi";

export interface ChartOverlays {
  emaPeriods?: number[];
  smaPeriods?: number[];
  indicatorColors?: Record<string, string>;
  rsiPeriod?: number;
  bollingerPeriod?: number;
  supertrend?: boolean;
  vwap?: boolean;
  cpr?: boolean;
  volume?: boolean;
  macd?: boolean;
  atr?: boolean;
  dmi?: boolean;
}

export const DEFAULT_EMA_COLORS = ["#f59e0b", "#38bdf8", "#a855f7", "#22c55e", "#ec4899", "#eab308"];
export const DEFAULT_SMA_COLORS = ["#06b6d4", "#f97316", "#8b5cf6", "#10b981", "#f43f5e", "#60a5fa"];

interface PriceChartProps {
  symbol?: string;
  candles: Candle[];
  timeframe: string;
  overlays?: ChartOverlays;
  liveQuote?: { ltp?: number; volume?: number } | null;
  chartStyle?: ChartDisplayStyle;
  activeDrawingTool?: string | null;
  onDrawingComplete?: () => void;
  clearDrawingsVersion?: number;
  mouseTradingEnabled?: boolean;
  tickSize?: number;
  onMouseTrade?: (side: "BUY" | "SELL", price: number) => void;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const NSE_OPEN_OFFSET_MS = (9 * 60 + 15) * 60 * 1000;

export function roundToTick(price: number, tickSize = 0.05): number {
  const safeTick = Number.isFinite(tickSize) && tickSize > 0 ? tickSize : 0.05;
  const rounded = Math.round(price / safeTick) * safeTick;
  const decimals = safeTick < 0.01 ? 4 : 2;
  return Number(rounded.toFixed(decimals));
}

function toUnixMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 10_000_000_000 ? Math.floor(value) : Math.floor(value * 1000);
  }
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const n = Number(text);
    if (Number.isFinite(n)) return n > 10_000_000_000 ? Math.floor(n) : Math.floor(n * 1000);
  }
  const normalized = text.includes("T") ? text : text.replace(" ", "T");
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}

function numberValue(...values: unknown[]): number | null {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function getTimeframeMs(timeframe: string): number {
  switch (timeframe.toLowerCase()) {
    case "1m": return 60_000;
    case "2m": return 2 * 60_000;
    case "3m": return 3 * 60_000;
    case "5m": return 5 * 60_000;
    case "10m": return 10 * 60_000;
    case "15m": return 15 * 60_000;
    case "30m": return 30 * 60_000;
    case "45m": return 45 * 60_000;
    case "1h":
    case "60m": return 60 * 60_000;
    case "2h": return 2 * 60 * 60_000;
    case "4h": return 4 * 60 * 60_000;
    case "d":
    case "1d": return 86_400_000;
    case "w":
    case "1w": return 7 * 86_400_000;
    case "m":
    case "1m_month": return 30 * 86_400_000;
    default: return 60_000;
  }
}

export function getMarketAlignedBucketMs(timestampMs: number, timeframe: string): number {
  const tf = timeframe.toLowerCase();
  const groupMs = getTimeframeMs(timeframe);

  if (tf === "w" || tf === "1w") {
    const date = new Date(timestampMs);
    const weekday = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - weekday + 1);
    date.setUTCHours(0, 0, 0, 0);
    return date.getTime();
  }
  if (tf === "m") {
    const date = new Date(timestampMs);
    date.setUTCDate(1);
    date.setUTCHours(0, 0, 0, 0);
    return date.getTime();
  }
  if (tf === "d" || tf === "1d") {
    const istMs = timestampMs + IST_OFFSET_MS;
    return Math.floor(istMs / 86_400_000) * 86_400_000 - IST_OFFSET_MS;
  }

  const istMs = timestampMs + IST_OFFSET_MS;
  const dayStartIstMs = Math.floor(istMs / 86_400_000) * 86_400_000;
  const sessionAnchorUtcMs = dayStartIstMs - IST_OFFSET_MS + NSE_OPEN_OFFSET_MS;

  if (timestampMs >= sessionAnchorUtcMs) {
    const elapsed = timestampMs - sessionAnchorUtcMs;
    return sessionAnchorUtcMs + Math.floor(elapsed / groupMs) * groupMs;
  }
  return Math.floor(timestampMs / groupMs) * groupMs;
}

function toHeikinAshi(bars: KLineData[]): KLineData[] {
  const result: KLineData[] = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const haClose = (b.open + b.high + b.low + b.close) / 4;
    const haOpen = i === 0 ? (b.open + b.close) / 2 : (result[i - 1].open + result[i - 1].close) / 2;
    const haHigh = Math.max(b.high, haOpen, haClose);
    const haLow = Math.min(b.low, haOpen, haClose);
    result.push({ ...b, open: haOpen, high: haHigh, low: haLow, close: haClose });
  }
  return result;
}

export default function PriceChart({
  symbol,
  candles = [],
  timeframe = "1m",
  overlays = {},
  liveQuote,
  chartStyle = "candle_solid",
  activeDrawingTool,
  onDrawingComplete,
  clearDrawingsVersion = 0,
  mouseTradingEnabled = false,
  tickSize = 0.05,
  onMouseTrade,
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const barsRef = useRef<KLineData[]>([]);
  const realtimeCallbackRef = useRef<((data: KLineData) => void) | null>(null);
  const lastRawBarRef = useRef<KLineData | null>(null);
  const lastSessionCumulativeVolRef = useRef<number | null>(null);
  const lastSessionDayRef = useRef<number | null>(null);

  const onDrawingCompleteRef = useRef(onDrawingComplete);
  onDrawingCompleteRef.current = onDrawingComplete;

  const onMouseTradeRef = useRef(onMouseTrade);
  onMouseTradeRef.current = onMouseTrade;

  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;

  const hydratedSymbolRef = useRef<string | null>(null);
  const selectedOverlayIdRef = useRef<string | null>(null);
  const inProgressOverlayIdRef = useRef<string | null>(null);
  const lastOverlayActionTimeRef = useRef<number>(0);

  // Synchronous theme detection from DOM / localStorage
  const [currentTheme, setCurrentTheme] = useState<string>("aveon-dark");

  useEffect(() => {
    const updateTheme = () => {
      const active =
        document.documentElement.getAttribute("data-theme") ||
        localStorage.getItem("aveon-theme") ||
        "aveon-dark";
      setCurrentTheme(active);
    };
    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const persistCurrentDrawings = () => {
    const chart = chartRef.current;
    const currentSymbol = symbolRef.current;
    if (!chart || !currentSymbol) return;
    try {
      const rawOverlays = (chart as any).getOverlays?.() ?? [];
      const list = Array.isArray(rawOverlays) ? rawOverlays : Object.values(rawOverlays);
      const serializable = list
        .filter((o: any) => o && (o.name || o.atsName) && Array.isArray(o.points) && o.points.length > 0)
        .map((o: any) => ({
          name: o.name || o.atsName,
          points: o.points.map((pt: any) => ({
            timestamp: pt.timestamp,
            value: pt.value,
            dataIndex: pt.dataIndex,
          })),
          paneId: o.paneId ?? "candle_pane",
        }));
      localStorage.setItem(`aveon.chart.drawings.${currentSymbol}`, JSON.stringify(serializable));
    } catch (err) {
      console.error("Failed to save drawings:", err);
    }
  };

  const buildOverlayOptions = (baseOptions: Record<string, any> & { name: string }) => ({
    ...baseOptions,
    onDrawEnd: (event: any) => {
      const id = event?.overlay?.id;
      if (id) selectedOverlayIdRef.current = id;
      inProgressOverlayIdRef.current = null;
      lastOverlayActionTimeRef.current = Date.now();
      persistCurrentDrawings();
      onDrawingCompleteRef.current?.();
      baseOptions.onDrawEnd?.(event);
    },
    onClick: (event: any) => {
      const id = event?.overlay?.id;
      if (id) selectedOverlayIdRef.current = id;
      lastOverlayActionTimeRef.current = Date.now();
      baseOptions.onClick?.(event);
    },
    onPressedMoveStart: (event: any) => {
      const id = event?.overlay?.id;
      if (id) selectedOverlayIdRef.current = id;
      lastOverlayActionTimeRef.current = Date.now();
    },
    onPressedMoveEnd: (event: any) => {
      const id = event?.overlay?.id;
      if (id) selectedOverlayIdRef.current = id;
      lastOverlayActionTimeRef.current = Date.now();
      persistCurrentDrawings();
      baseOptions.onPressedMoveEnd?.(event);
    },
    onRightClick: (event: any) => {
      event?.preventDefault?.();
      lastOverlayActionTimeRef.current = Date.now();
      const id = event?.overlay?.id;
      if (id && chartRef.current) {
        chartRef.current.removeOverlay({ id });
        if (selectedOverlayIdRef.current === id) {
          selectedOverlayIdRef.current = null;
        }
        persistCurrentDrawings();
      }
      return true;
    },
    onRemoved: () => {
      persistCurrentDrawings();
    },
  });

  const consolidatedCandles = useMemo<KLineData[]>(() => {
    const base: KLineData[] = [];
    for (const item of candles) {
      const timestamp = toUnixMs(item.time ?? item.DT ?? item.date);
      const open = numberValue(item.open, item.O);
      const high = numberValue(item.high, item.H);
      const low = numberValue(item.low, item.L);
      const close = numberValue(item.close, item.C);
      const volume = numberValue(item.volume, item.V) ?? 0;
      if (timestamp === null || open === null || high === null || low === null || close === null) continue;
      if (high < low) continue;
      base.push({ timestamp, open, high, low, close, volume });
    }
    base.sort((a, b) => a.timestamp - b.timestamp);
    if (!base.length) return [];

    const tf = timeframe.toLowerCase();
    let grouped: KLineData[] = [];

    if (tf === "1m" || tf === "d" || tf === "1d") {
      grouped = base;
    } else {
      let current: KLineData | null = null;
      for (const bar of base) {
        const bucket = getMarketAlignedBucketMs(bar.timestamp, timeframe);
        if (!current || current.timestamp !== bucket) {
          if (current) grouped.push(current);
          current = {
            timestamp: bucket,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume ?? 0,
          };
        } else {
          current.high = Math.max(current.high, bar.high);
          current.low = Math.min(current.low, bar.low);
          current.close = bar.close;
          current.volume = (current.volume ?? 0) + (bar.volume ?? 0);
        }
      }
      if (current) grouped.push(current);
    }

    lastRawBarRef.current = grouped[grouped.length - 1]
      ? { ...grouped[grouped.length - 1] }
      : null;
    lastSessionCumulativeVolRef.current = null;

    return chartStyle === "heikin_ashi" ? toHeikinAshi(grouped) : grouped;
  }, [candles, timeframe, chartStyle]);

  // Stable Single-Mount Initialization
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    ensureCustomIndicatorsRegistered();
    const chart = init(container);
    if (!chart) return;
    chartRef.current = chart;

    const precision = tickSize < 0.01 ? 4 : 2;
    chart.setSymbol({ ticker: symbol || "", pricePrecision: precision, volumePrecision: 0 });
    chart.setPeriod({ type: "minute", span: 1 });

    chart.setDataLoader({
      getBars: ({ callback }) => {
        callback(barsRef.current);
      },
      subscribeBar: ({ callback }) => {
        realtimeCallbackRef.current = callback;
      },
      unsubscribeBar: () => {
        realtimeCallbackRef.current = null;
      },
    });

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        chart.resize();
      });
    });
    resizeObserver.observe(container);

    requestAnimationFrame(() => {
      chart.resize();
    });

    return () => {
      resizeObserver.disconnect();
      realtimeCallbackRef.current = null;
      dispose(container);
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const precision = tickSize < 0.01 ? 4 : 2;
    chart.setSymbol({ ticker: symbol || "", pricePrecision: precision, volumePrecision: 0 });
    requestAnimationFrame(() => chart.resize());
  }, [symbol, tickSize]);

  useEffect(() => {
    requestAnimationFrame(() => {
      chartRef.current?.resize();
    });
  }, [timeframe]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      const chart = chartRef.current;
      if (!chart) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedOverlayIdRef.current) {
          e.preventDefault();
          chart.removeOverlay({ id: selectedOverlayIdRef.current });
          selectedOverlayIdRef.current = null;
          persistCurrentDrawings();
        }
      } else if (e.key === "Escape") {
        if (inProgressOverlayIdRef.current) {
          chart.removeOverlay({ id: inProgressOverlayIdRef.current });
          inProgressOverlayIdRef.current = null;
        }
        selectedOverlayIdRef.current = null;
        onDrawingCompleteRef.current?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const isLite = currentTheme === "lite";
    const isDark = currentTheme === "dark";
    
    // High-contrast text colors for absolute clarity across all themes
    const textColor = isLite ? "#0f172a" : isDark ? "#f1f5f9" : "#cbd5e1";
    const gridColor = isLite ? "rgba(148,163,184,0.25)" : "rgba(42,46,57,0.35)";
    const candleType: CandleType = chartStyle === "heikin_ashi" ? "candle_solid" : chartStyle;

    chart.setStyles({
      grid: {
        show: true,
        horizontal: { color: gridColor },
        vertical: { color: gridColor },
      },
      common: {
        text: {
          color: textColor,
          size: 12,
        },
      },
      candle: {
        type: candleType,
        tooltip: {
          showRule: "always",
          text: {
            color: textColor,
            size: 12,
          },
          title: {
            show: false,
          },
        } as any,
        bar: {
          upColor: "#16a34a",
          downColor: "#dc2626",
          noChangeColor: "#64748b",
          upBorderColor: "#16a34a",
          downBorderColor: "#dc2626",
          noChangeBorderColor: "#64748b",
          upWickColor: "#16a34a",
          downWickColor: "#dc2626",
          noChangeWickColor: "#64748b",
        },
        priceMark: {
          last: {
            show: true,
            upColor: "#16a34a",
            downColor: "#dc2626",
            noChangeColor: "#64748b",
            line: { show: true, style: "dashed" },
          },
        },
      },
      indicator: {
        tooltip: {
          showRule: "always",
          text: {
            color: textColor,
            size: 12,
          },
        },
      },
    } as any);
  }, [currentTheme, chartStyle]);

  useEffect(() => {
    barsRef.current = consolidatedCandles;
    const chart = chartRef.current;
    if (!chart) return;
    chart.resetData();
    requestAnimationFrame(() => chart.resize());

    if (symbol && consolidatedCandles.length > 0 && hydratedSymbolRef.current !== symbol) {
      hydratedSymbolRef.current = symbol;
      selectedOverlayIdRef.current = null;
      setTimeout(() => {
        if (!chartRef.current || symbolRef.current !== symbol) return;
        chartRef.current.removeOverlay();
        chartRef.current.resize();
        try {
          const saved = localStorage.getItem(`aveon.chart.drawings.${symbol}`);
          if (saved) {
            const parsedDrawings = JSON.parse(saved);
            if (Array.isArray(parsedDrawings)) {
              parsedDrawings.forEach((item) => {
                if (item && item.name && Array.isArray(item.points)) {
                  chartRef.current?.createOverlay(
                    buildOverlayOptions({
                      name: item.name,
                      points: item.points,
                      paneId: item.paneId ?? "candle_pane",
                    })
                  );
                }
              });
            }
          }
        } catch {}
      }, 50);
    }
  }, [consolidatedCandles, symbol]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    chart.removeIndicator();

    const colorMap = overlays.indicatorColors ?? {};

    const emaList = overlays.emaPeriods ?? [];
    emaList.forEach((period, idx) => {
      const color = colorMap[`EMA_${period}`] || DEFAULT_EMA_COLORS[idx % DEFAULT_EMA_COLORS.length];
      chart.createIndicator(
        {
          name: "EMA",
          calcParams: [period],
          paneId: "candle_pane",
          styles: {
            lines: [{ color, size: 1.8, style: "solid" as any }],
          },
        },
        true
      );
    });

    const smaList = overlays.smaPeriods ?? [];
    smaList.forEach((period, idx) => {
      const color = colorMap[`SMA_${period}`] || DEFAULT_SMA_COLORS[idx % DEFAULT_SMA_COLORS.length];
      chart.createIndicator(
        {
          name: "SMA",
          calcParams: [period],
          paneId: "candle_pane",
          styles: {
            lines: [{ color, size: 1.8, style: "solid" as any }],
          },
        },
        true
      );
    });

    if (overlays.bollingerPeriod) {
      chart.createIndicator(
        { name: "BOLL", calcParams: [overlays.bollingerPeriod, 2], paneId: "candle_pane" },
        true
      );
    }

    if (overlays.vwap) {
      chart.createIndicator({ name: "VWAP", paneId: "candle_pane" }, true);
    }

    if (overlays.supertrend) {
      chart.createIndicator({ name: "SUPERTREND", paneId: "candle_pane" }, true);
    }

    if (overlays.cpr) {
      chart.createIndicator({ name: "CPR", paneId: "candle_pane" }, true);
    }

    if (overlays.volume !== false) {
      chart.createIndicator({ name: "VOL" }, false);
    }

    if (overlays.rsiPeriod) {
      chart.createIndicator({ name: "RSI", calcParams: [overlays.rsiPeriod] }, false);
    }

    if (overlays.macd) {
      chart.createIndicator({ name: "MACD" }, false);
    }

    if (overlays.atr) {
      chart.createIndicator({ name: "ATR" }, false);
    }

    if (overlays.dmi) {
      chart.createIndicator({ name: "DMI" }, false);
    }
  }, [overlays]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (!activeDrawingTool) {
      inProgressOverlayIdRef.current = null;
      return;
    }

    if (inProgressOverlayIdRef.current) {
      chart.removeOverlay({ id: inProgressOverlayIdRef.current });
      inProgressOverlayIdRef.current = null;
    }

    const createdId = chart.createOverlay(
      buildOverlayOptions({
        name: activeDrawingTool,
      })
    );
    if (typeof createdId === "string") {
      inProgressOverlayIdRef.current = createdId;
      selectedOverlayIdRef.current = createdId;
    }
  }, [activeDrawingTool]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || clearDrawingsVersion === 0) return;
    chart.removeOverlay();
    selectedOverlayIdRef.current = null;
    inProgressOverlayIdRef.current = null;
    if (symbolRef.current) {
      try {
        localStorage.removeItem(`aveon.chart.drawings.${symbolRef.current}`);
      } catch {}
    }
  }, [clearDrawingsVersion]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !mouseTradingEnabled) return;

    let downPos: { x: number; y: number; time: number; button: number } | null = null;

    const handleMouseDown = (e: MouseEvent) => {
      if (activeDrawingTool) return;
      if (e.button !== 0 && e.button !== 2) return;
      
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      downPos = { x: e.clientX, y: e.clientY, time: Date.now(), button: e.button };
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!downPos || activeDrawingTool) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const dist = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      const elapsed = Date.now() - downPos.time;
      const button = downPos.button;
      downPos = null;

      if (dist > 8 || elapsed > 400) return;
      if (Date.now() - lastOverlayActionTimeRef.current < 150) return;

      const chart = chartRef.current;
      if (!chart) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const converted =
        (chart as any).convertFromPixel?.([{ x, y }], { paneId: "candle_pane" }) ??
        (chart as any).convertFromPixel?.({ x, y });
      const point = Array.isArray(converted) ? converted[0] : converted;
      const rawPrice = Number(point?.value);

      if (Number.isFinite(rawPrice) && rawPrice > 0) {
        const validTickPrice = roundToTick(rawPrice, tickSize);
        if (button === 0) {
          onMouseTradeRef.current?.("BUY", validTickPrice);
        } else if (button === 2) {
          onMouseTradeRef.current?.("SELL", validTickPrice);
        }
      }
    };

    const handleWindowMouseUp = () => {
      downPos = null;
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (mouseTradingEnabled && !activeDrawingTool) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };

    container.addEventListener("mousedown", handleMouseDown, { capture: true });
    container.addEventListener("mouseup", handleMouseUp, { capture: true });
    window.addEventListener("mouseup", handleWindowMouseUp);
    container.addEventListener("contextmenu", handleContextMenu, { capture: true });

    return () => {
      container.removeEventListener("mousedown", handleMouseDown, { capture: true });
      container.removeEventListener("mouseup", handleMouseUp, { capture: true });
      window.removeEventListener("mouseup", handleWindowMouseUp);
      container.removeEventListener("contextmenu", handleContextMenu, { capture: true });
    };
  }, [mouseTradingEnabled, activeDrawingTool, tickSize]);

  useEffect(() => {
    const chart = chartRef.current;
    const ltp = Number(liveQuote?.ltp);
    if (!chart || !Number.isFinite(ltp) || ltp <= 0) return;

    const prev = lastRawBarRef.current;
    if (!prev) return;

    const nowMs = Date.now();
    const istDay = Math.floor((nowMs + IST_OFFSET_MS) / 86_400_000);
    if (lastSessionDayRef.current !== null && lastSessionDayRef.current !== istDay) {
      lastSessionCumulativeVolRef.current = null;
    }
    lastSessionDayRef.current = istDay;

    const rawCumVol = Number(liveQuote?.volume);
    let volumeDelta = 0;
    if (Number.isFinite(rawCumVol) && rawCumVol >= 0) {
      if (lastSessionCumulativeVolRef.current !== null) {
        volumeDelta = Math.max(0, rawCumVol - lastSessionCumulativeVolRef.current);
      }
      lastSessionCumulativeVolRef.current = rawCumVol;
    }

    const bucketMs = getMarketAlignedBucketMs(nowMs, timeframe);
    const sameBar = bucketMs <= prev.timestamp;

    const nextBar: KLineData = sameBar
      ? {
          timestamp: prev.timestamp,
          open: prev.open,
          high: Math.max(prev.high, ltp),
          low: Math.min(prev.low, ltp),
          close: ltp,
          volume: (prev.volume ?? 0) + volumeDelta,
        }
      : {
          timestamp: bucketMs,
          open: prev.close,
          high: Math.max(prev.close, ltp),
          low: Math.min(prev.close, ltp),
          close: ltp,
          volume: volumeDelta,
        };

    lastRawBarRef.current = nextBar;
    if (chartStyle === "heikin_ashi" && barsRef.current.length > 0) {
      const prevHa = barsRef.current[barsRef.current.length - 1];
      const haClose = (nextBar.open + nextBar.high + nextBar.low + nextBar.close) / 4;
      const haOpen = sameBar ? prevHa.open : (prevHa.open + prevHa.close) / 2;
      const haHigh = Math.max(nextBar.high, haOpen, haClose);
      const haLow = Math.min(nextBar.low, haOpen, haClose);
      realtimeCallbackRef.current?.({
        ...nextBar,
        open: haOpen,
        high: haHigh,
        low: haLow,
        close: haClose,
      });
    } else {
      realtimeCallbackRef.current?.(nextBar);
    }
  }, [liveQuote?.ltp, liveQuote?.volume, timeframe, chartStyle]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full select-none cursor-crosshair"
      style={{
        backgroundColor:
          currentTheme === "lite"
            ? "#f8f9fa" // Google Finance Lite warm off-white canvas tone
            : currentTheme === "dark"
              ? "#1f1f23" // Google Finance Dark matte charcoal tone
              : "#0B0E14", // Aveon Dark
        position: "relative",
      }}
    />
  );
}