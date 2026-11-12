import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Deterministic, rule-based commentary on a scanner setup.
 *
 * This is NOT a language-model call: every sentence is derived from the numbers the scanner already
 * computed, so it can never contradict them or invent levels. (The previous version returned a canned
 * string and referenced `tradePlan.target`, which does not exist - it rendered "₹undefined".)
 * If you later add an LLM here, keep it to wording only and never let it produce price levels.
 */

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function POST(req: Request) {
  try {
    // The proxy only checks that a cookie exists; verify the session is real.
    const session = await readSession();
    if (!session) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const symbol = typeof body?.symbol === "string" ? body.symbol.replace(/[^A-Za-z0-9&_.\- ]/g, "").slice(0, 40) : "";
    const timeframe = ["5m", "15m", "1h", "1D"].includes(body?.timeframe) ? (body.timeframe as string) : null;
    const side = body?.tradePlan?.side === "BUY" || body?.tradePlan?.side === "SELL" ? (body.tradePlan.side as "BUY" | "SELL") : null;
    const ltp = num(body?.ltp);
    const rsi = num(body?.indicators?.rsi14);
    const atr = num(body?.indicators?.atr14);
    const volumeRatio = num(body?.indicators?.volumeRatio);
    const stop = num(body?.tradePlan?.stopLoss);
    const t1 = num(body?.tradePlan?.target1);
    const t2 = num(body?.tradePlan?.target2);
    const rr = num(body?.tradePlan?.riskRewardRatio);

    if (!symbol || !timeframe || !side || ltp === null || ltp <= 0 || rsi === null || stop === null || t1 === null) {
      return NextResponse.json({ success: false, message: "Invalid or incomplete setup payload." }, { status: 400 });
    }

    const risk = Math.abs(ltp - stop);
    const lines = [
      `• Trend: ${side === "BUY" ? "bullish" : "bearish"} setup on ${symbol} (${timeframe}); RSI ${rsi.toFixed(1)}${
        side === "BUY" ? (rsi > 75 ? " is overbought - avoid chasing" : "") : rsi < 25 ? " is oversold - avoid chasing" : ""
      }.`,
      `• Risk: stop at ₹${stop.toFixed(2)} (₹${risk.toFixed(2)}/share${atr ? `, ${(risk / atr).toFixed(1)} ATR` : ""}); Target 1 ₹${t1.toFixed(2)}${
        t2 !== null ? `, Target 2 ₹${t2.toFixed(2)}` : ""
      }${rr !== null ? `; room-adjusted R:R 1:${rr.toFixed(2)}` : ""}.`,
      `• Participation: ${
        volumeRatio === null ? "volume not available" : volumeRatio >= 1.5 ? `strong (${volumeRatio.toFixed(1)}x average)` : volumeRatio >= 1 ? `adequate (${volumeRatio.toFixed(1)}x average)` : `weak (${volumeRatio.toFixed(1)}x average)`
      }.`,
    ];

    return NextResponse.json({ success: true, source: "rule-based", analysis: lines.join("\n") });
  } catch {
    return NextResponse.json({ success: false, message: "Analysis failed" }, { status: 500 });
  }
}
