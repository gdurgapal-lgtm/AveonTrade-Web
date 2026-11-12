import { NextRequest, NextResponse } from "next/server";
import { ServerConfig } from "@/lib/serverConfig";
import { readSession } from "@/lib/session";
export const dynamic = "force-dynamic";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function formatDateTime(d: Date): string {
  const istDate = new Date(d.getTime() + IST_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${istDate.getUTCFullYear()}-${pad(istDate.getUTCMonth() + 1)}-${pad(
    istDate.getUTCDate()
  )} ${pad(istDate.getUTCHours())}:${pad(istDate.getUTCMinutes())}:${pad(
    istDate.getUTCSeconds()
  )}`;
}

function parseChartDateTime(value: unknown): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const normalized = text.includes("T") ? text : text.replace(" ", "T");
  const zoned = /(?:Z|[+-]\d\d:\d\d)$/.test(normalized) ? normalized : `${normalized}+05:30`;
  const ms = Date.parse(zoned);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

export async function GET(req: NextRequest) {
  try {
    const session = await readSession();
    if (!session) {
      return NextResponse.json({ success: false, message: "Not authenticated.", data: [] }, { status: 401 });
    }
    if (!ServerConfig.chartBaseUrl) {
      return NextResponse.json(
        { success: false, message: "AVEON_CHART_BASE_URL is not configured.", data: [] },
        { status: 200 }
      );
    }

    const params = req.nextUrl.searchParams;
    const exchangeSegment = params.get("exchangeSegment")?.toUpperCase() ?? "";
    const token = params.get("token") ?? "";
    const interval = params.get("interval") === "MIN" ? "MIN" : "DAY";
    const days = Number(params.get("days") ?? "180");
    
    // Safely cap countBack to prevent crashing the external chart server
    const rawCountBack = Number(params.get("countBack") ?? "1200");
    const countBack = Math.min(rawCountBack, 3000); 
    
    const source = params.get("source") || "WAVE";

    if (!exchangeSegment || !token) {
      return NextResponse.json(
        { success: false, message: "exchangeSegment and token are required.", data: [] },
        { status: 400 }
      );
    }

    const to = new Date(Date.now() + 5 * 60 * 1000);
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

    const url = new URL(
      `${ServerConfig.chartBaseUrl.replace(/\/$/, "")}/v1/chart/data/${encodeURIComponent(
        exchangeSegment
      )}/${encodeURIComponent(token)}/1/${interval}/${encodeURIComponent(source)}`
    );
    url.searchParams.set("from", formatDateTime(from));
    url.searchParams.set("to", formatDateTime(to));
    url.searchParams.set("countBack", String(countBack));

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
      },
      cache: "no-store",
    });

    const text = await res.text();

    if (!res.ok) {
      // Only log failures. The scanner refreshes ~50 symbols every 45s; logging every body floods the console.
      // eslint-disable-next-line no-console
      console.warn("[AveonTrade] chart-history upstream error", res.status, exchangeSegment, token, text.slice(0, 200));
      return NextResponse.json(
        { success: false, message: `Chart API returned HTTP ${res.status}.`, data: [] },
        { status: 200 }
      );
    }

    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      return NextResponse.json(
        { success: false, message: "Chart API returned invalid JSON.", data: [] },
        { status: 200 }
      );
    }

    const status = String(json?.status ?? "").trim().toLowerCase();
    if (status && status !== "success") {
      return NextResponse.json(
        { success: false, message: json?.message || `Chart API returned status "${status}".`, data: [] },
        { status: 200 }
      );
    }

    const rawData = Array.isArray(json?.data) ? json.data : [];
    const candles = rawData
      .map((row: any) => {
        const time = parseChartDateTime(row.DT ?? row.datetime ?? row.time);
        const open = Number(row.O ?? row.open);
        const high = Number(row.H ?? row.high);
        const low = Number(row.L ?? row.low);
        const close = Number(row.C ?? row.close);
        const volume = Number(row.V ?? row.volume ?? 0);
        if (time === null || [open, high, low, close].some((n) => !Number.isFinite(n))) return null;
        return { time, open, high, low, close, volume };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.time - b.time);

    return NextResponse.json({ success: true, message: "OK", data: candles });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[AveonTrade] Chart history route error:", err);
    return NextResponse.json(
      { success: false, message: "Unable to reach the chart service.", data: [] },
      { status: 200 }
    );
  }
}