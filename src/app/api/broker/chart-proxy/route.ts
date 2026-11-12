import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { isTrustedChartUrl, ServerConfig } from "@/lib/serverConfig";

const segmentPattern = /^[A-Z0-9_]{2,32}$/;
const tokenPattern = /^\d{1,20}$/;

export async function GET(request: NextRequest) {
  if (!readSession()) {
    return NextResponse.json({ status: "error", message: "Not authenticated." }, { status: 401 });
  }
  if (!isTrustedChartUrl(ServerConfig.chartBaseUrl)) {
    return NextResponse.json({ status: "error", message: "Chart service is not securely configured." }, { status: 500 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const segment = (searchParams.get("segment") || "").trim().toUpperCase();
    const token = (searchParams.get("token") || "").trim();
    const interval = (searchParams.get("interval") || "MIN").trim().toUpperCase();
    if (!segmentPattern.test(segment) || !tokenPattern.test(token) || !["MIN", "DAY"].includes(interval)) {
      return NextResponse.json({ status: "error", message: "Invalid chart request." }, { status: 400 });
    }
    const parsedCount = Number(searchParams.get("countBack") ?? "500");
    const countBack = Number.isFinite(parsedCount) ? String(Math.max(1, Math.min(5000, Math.floor(parsedCount)))) : "500";
    const targetBrokerUrl = new URL(`/v1/chart/data/${segment}/${token}/1/${interval}/WAVE`, ServerConfig.chartBaseUrl);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (from) targetBrokerUrl.searchParams.set("from", from);
    if (to) targetBrokerUrl.searchParams.set("to", to);
    targetBrokerUrl.searchParams.set("countBack", countBack);

    const res = await fetch(targetBrokerUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { status: "error", message: `Broker server returned error code: ${res.status}` }, 
        { status: res.status }
      );
    }

    const dataPayload = await res.json();
    return NextResponse.json(dataPayload);

  } catch {
    return NextResponse.json(
      { status: "error", message: "Unable to reach the chart service." },
      { status: 500 }
    );
  }
}
