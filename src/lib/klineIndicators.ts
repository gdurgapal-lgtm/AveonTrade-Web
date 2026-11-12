import { registerIndicator, type KLineData } from "klinecharts";

let isRegistered = false;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function ensureCustomIndicatorsRegistered() {
  if (isRegistered) return;
  isRegistered = true;

  // 1. Custom Configurable EMA (Automatically inherits per-instance styles.lines[0].color)
  registerIndicator({
    name: "EMA",
    shortName: "EMA",
    series: "price",
    precision: 2,
    calcParams: [20],
    figures: [
      { key: "ema", title: "EMA: ", type: "line" },
    ],
    calc: (dataList: KLineData[], indicator) => {
      const period = Math.max(1, Number(indicator.calcParams[0] || 20));
      const k = 2 / (period + 1);
      let emaPrev: number | undefined = undefined;

      return dataList.map((bar, idx) => {
        const close = Number(bar.close);
        if (!Number.isFinite(close)) return {};
        if (idx === 0 || emaPrev === undefined) {
          emaPrev = close;
        } else {
          emaPrev = close * k + emaPrev * (1 - k);
        }
        return { ema: emaPrev };
      });
    },
  });

  // 2. Custom Configurable SMA (Automatically inherits per-instance styles.lines[0].color)
  registerIndicator({
    name: "SMA",
    shortName: "SMA",
    series: "price",
    precision: 2,
    calcParams: [50],
    figures: [
      { key: "sma", title: "SMA: ", type: "line" },
    ],
    calc: (dataList: KLineData[], indicator) => {
      const period = Math.max(1, Number(indicator.calcParams[0] || 50));
      let runningSum = 0;

      return dataList.map((bar, idx, arr) => {
        const close = Number(bar.close);
        if (!Number.isFinite(close)) return {};

        runningSum += close;
        if (idx >= period) {
          runningSum -= Number(arr[idx - period].close || 0);
          return { sma: runningSum / period };
        }

        // Progressive cumulative fallback if loaded history is shorter than period
        if (arr.length < period && idx >= Math.min(10, arr.length - 1)) {
          return { sma: runningSum / (idx + 1) };
        }

        if (idx === period - 1) {
          return { sma: runningSum / period };
        }

        return {};
      });
    },
  });

  // 3. Intraday Session VWAP with Standard Deviation Bands
  registerIndicator({
    name: "VWAP",
    shortName: "VWAP",
    series: "price",
    precision: 2,
    calcParams: [1.5],
    figures: [
      { key: "vwap", title: "VWAP: ", type: "line", styles: () => ({ color: "#ec4899", size: 2 }) },
      { key: "upper", title: "+1.5SD: ", type: "line", styles: () => ({ color: "rgba(236,72,153,0.45)", style: "dashed" }) },
      { key: "lower", title: "-1.5SD: ", type: "line", styles: () => ({ color: "rgba(236,72,153,0.45)", style: "dashed" }) },
    ],
    calc: (dataList: KLineData[], indicator) => {
      const mult = Number(indicator.calcParams[0] || 1.5);
      let currentDay = -1;
      let cumPV = 0;
      let cumVol = 0;
      let cumPV2 = 0;

      return dataList.map((bar) => {
        const istDay = Math.floor((bar.timestamp + IST_OFFSET_MS) / 86_400_000);
        if (istDay !== currentDay) {
          currentDay = istDay;
          cumPV = 0;
          cumVol = 0;
          cumPV2 = 0;
        }
        const tp = (bar.high + bar.low + bar.close) / 3;
        const vol = Math.max(bar.volume ?? 1, 1);
        cumPV += tp * vol;
        cumVol += vol;
        cumPV2 += tp * tp * vol;

        const vwap = cumPV / cumVol;
        const variance = Math.max(0, cumPV2 / cumVol - vwap * vwap);
        const std = Math.sqrt(variance);
        return {
          vwap,
          upper: vwap + mult * std,
          lower: vwap - mult * std,
        };
      });
    },
  });

  // 4. Supertrend (10, 3) - Single continuous line with dynamic color shifting
  registerIndicator({
    name: "SUPERTREND",
    shortName: "Supertrend",
    series: "price",
    precision: 2,
    calcParams: [10, 3],
    figures: [
      {
        key: "st",
        title: "ST: ",
        type: "line",
        styles: (params: any) => {
          const trend = params?.data?.current?.trend ?? params?.data?.result?.trend ?? params?.result?.trend;
          return { color: trend === -1 ? "#ef4444" : "#22c55e", size: 2 };
        },
      },
    ],
    calc: (dataList: KLineData[], indicator) => {
      const period = Number(indicator.calcParams[0] || 10);
      const multiplier = Number(indicator.calcParams[1] || 3);
      const out: Array<{ st?: number; trend?: number }> = dataList.map(() => ({}));
      if (dataList.length < period) return out;

      const trs = dataList.map((c, idx) => {
        if (idx === 0) return c.high - c.low;
        const prevClose = dataList[idx - 1].close;
        return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
      });

      let atr = trs.slice(0, period).reduce((acc, v) => acc + v, 0) / period;
      let finalUpper = 0;
      let finalLower = 0;
      let trend: 1 | -1 = 1;

      for (let i = period - 1; i < dataList.length; i++) {
        if (i >= period) atr = (atr * (period - 1) + trs[i]) / period;
        const c = dataList[i];
        const mid = (c.high + c.low) / 2;
        const basicUpper = mid + multiplier * atr;
        const basicLower = mid - multiplier * atr;

        if (i === period - 1) {
          finalUpper = basicUpper;
          finalLower = basicLower;
        } else {
          const prevClose = dataList[i - 1].close;
          finalUpper = basicUpper < finalUpper || prevClose > finalUpper ? basicUpper : finalUpper;
          finalLower = basicLower > finalLower || prevClose < finalLower ? basicLower : finalLower;
          if (c.close > finalUpper) trend = 1;
          else if (c.close < finalLower) trend = -1;
        }
        const val = trend === 1 ? finalLower : finalUpper;
        out[i] = { st: val, trend };
      }
      return out;
    },
  });

  // 5. Intraday CPR + PDH/PDL
  registerIndicator({
    name: "CPR",
    shortName: "CPR+PDH/L",
    series: "price",
    precision: 2,
    figures: [
      { key: "tc", title: "TC: ", type: "line", styles: () => ({ color: "#6366f1", style: "dashed" }) },
      { key: "pivot", title: "P: ", type: "line", styles: () => ({ color: "#8b5cf6", size: 2 }) },
      { key: "bc", title: "BC: ", type: "line", styles: () => ({ color: "#6366f1", style: "dashed" }) },
      { key: "pdh", title: "PDH: ", type: "line", styles: () => ({ color: "#f59e0b" }) },
      { key: "pdl", title: "PDL: ", type: "line", styles: () => ({ color: "#06b6d4" }) },
    ],
    calc: (dataList: KLineData[]) => {
      let currentDay = -1;
      let dHigh = -Infinity;
      let dLow = Infinity;
      let dClose = 0;

      let prevH: number | null = null;
      let prevL: number | null = null;
      let prevC: number | null = null;

      return dataList.map((bar) => {
        const istDay = Math.floor((bar.timestamp + IST_OFFSET_MS) / 86_400_000);
        if (istDay !== currentDay) {
          if (currentDay !== -1) {
            prevH = dHigh;
            prevL = dLow;
            prevC = dClose;
          }
          currentDay = istDay;
          dHigh = bar.high;
          dLow = bar.low;
          dClose = bar.close;
        } else {
          dHigh = Math.max(dHigh, bar.high);
          dLow = Math.min(dLow, bar.low);
          dClose = bar.close;
        }

        if (prevH === null || prevL === null || prevC === null) return {};
        const pivot = (prevH + prevL + prevC) / 3;
        const bc = (prevH + prevL) / 2;
        const tc = pivot - bc + pivot;
        return { tc, pivot, bc, pdh: prevH, pdl: prevL };
      });
    },
  });
}