import { NextRequest, NextResponse } from "next/server";

/**
 * Ports YahooHistoricalProvider from
 * lib/features/chart/services/yahoo_historical_provider.dart — the Flutter
 * app's own fallback history source. Free, public, unauthenticated:
 *   https://query1.finance.yahoo.com/v8/finance/chart/{yahooSymbol}
 *
 * Deliberately unrelated to the broker session — this is not proprietary
 * data, so it doesn't go through the /api/broker proxy or need auth
 * headers. Only NSE/BSE equities and a couple of named indices are
 * supported, exactly like the Dart version (V64 rule: never query Yahoo for
 * derivatives/commodities/currency — those need the broker's own feed).
 */

const NSE_EQUITY = new Set(["NSE_EQ", "NSE_CM"]);
const BSE_EQUITY = new Set(["BSE_EQ", "BSE_CM"]);
const NSE_INDEX = new Set(["NSE_INDICES", "NSE_INDEX", "NSE_IDX"]);
const BSE_INDEX = new Set(["BSE_INDICES", "BSE_INDEX", "BSE_IDX"]);

function toNseIndexSymbol(symbol: string): string | null {
  const compact = symbol.replace(/[\s\-_^]/g, "").toUpperCase();
  if (["NIFTY", "NIFTY50", "NSEI"].includes(compact)) return "^NSEI";
  if (["BANKNIFTY", "NIFTYBANK", "NSEBANK"].includes(compact)) return "^NSEBANK";
  return null;
}

function toBseIndexSymbol(symbol: string): string | null {
  const compact = symbol.replace(/[\s\-_^]/g, "").toUpperCase();
  if (["SENSEX", "BSESN"].includes(compact)) return "^BSESN";
  return null;
}

function toYahooSymbol(symbol: string, exchange: string): string | null {
  const segment = exchange.trim().toUpperCase();
  const sym = symbol.trim().toUpperCase();
  if (!sym) return null;

  if (NSE_INDEX.has(segment)) return toNseIndexSymbol(sym);
  if (BSE_INDEX.has(segment)) return toBseIndexSymbol(sym);
  if (NSE_EQUITY.has(segment)) return `${sym}.NS`;
  if (BSE_EQUITY.has(segment)) return `${sym}.BO`;

  // Lenient fallback: some broker responses return a bare "NSE"/"BSE"
  // rather than a segment code like "NSE_EQ". Treat those as equity too,
  // but only exact "NSE"/"BSE" — never guess for FO/CD/COMM segments.
  if (segment === "NSE") return `${sym}.NS`;
  if (segment === "BSE") return `${sym}.BO`;

  return null;
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.trim() ?? "";
  const exchange = req.nextUrl.searchParams.get("exchange")?.trim() ?? "NSE_EQ";
  const interval = req.nextUrl.searchParams.get("interval") ?? "1d";
  const range = req.nextUrl.searchParams.get("range") ?? "6mo";

  const yahooSymbol = toYahooSymbol(symbol, exchange);
  if (!yahooSymbol) {
    return NextResponse.json(
      { success: false, message: `No Yahoo mapping for ${symbol} (${exchange}).`, data: [] },
      { status: 200 }
    );
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      yahooSymbol
    )}?interval=${interval}&range=${range}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AveonTradeWeb/1.0)" },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { success: false, message: `Yahoo history failed (${res.status}).`, data: [] },
        { status: 200 }
      );
    }

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const timestamps: number[] = result?.timestamp ?? [];
    const quote = result?.indicators?.quote?.[0] ?? {};
    const { open = [], high = [], low = [], close = [], volume = [] } = quote;

    const candles = timestamps
      .map((t: number, i: number) => ({
        time: t,
        open: open[i],
        high: high[i],
        low: low[i],
        close: close[i],
        volume: volume?.[i] ?? 0,
      }))
      .filter(
        (c: any) =>
          c.open !== null && c.high !== null && c.low !== null && c.close !== null && c.open !== undefined
      )
      .sort((a: any, b: any) => a.time - b.time);

    return NextResponse.json({ success: true, message: "OK", data: candles });
  } catch {
    return NextResponse.json(
      { success: false, message: "Unable to reach Yahoo Finance.", data: [] },
      { status: 200 }
    );
  }
}
