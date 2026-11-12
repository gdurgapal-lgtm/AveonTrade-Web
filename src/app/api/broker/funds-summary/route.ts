import { NextResponse } from "next/server";
import { ServerConfig } from "@/lib/serverConfig";
import { readSession } from "@/lib/session";

const KNOWN_LABELS = [
  "Net Available Funds",
  "For Trading",
  "For Allocation/Withdrawal",
  "Total Trading Power Limit",
  "Total Utilization",
  "Limit Utilization",
  "Deposit",
  "Cash Deposit",
  "Funds Transferred Today",
  "Collateral",
  "Credit for Sale",
  "Exposure Margin",
  "Booked P&L",
  "MTM P&L",
] as const;

function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const parsed = parseFloat(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function findMaps(node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    node.forEach((child) => findMaps(child, out));
  } else if (node && typeof node === "object") {
    out.push(node as Record<string, unknown>);
    Object.values(node as Record<string, unknown>).forEach((child) => findMaps(child, out));
  }
  return out;
}

// Reusable business logic execution shared by both handlers
async function processFundsSummaryRequest() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }
  if (!ServerConfig.hasTradingConfiguration) {
    return NextResponse.json(
      { success: false, message: "Broker connection is not securely configured." },
      { status: 500 }
    );
  }

  const url = `${ServerConfig.baseUrl}/transactional/${ServerConfig.tenantId}/v1/getFundsViewSummary`;

  try {
    const res = await fetch(url, {
      method: "POST", // Downstream API always expects POST
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        tenantid: ServerConfig.tenantId,
        Authorization: `Bearer ${session.accessToken}`,
        session_token: session.sessionToken,
        "x-api-key": ServerConfig.apiKey,
      },
      body: JSON.stringify({
        userId: session.userId,
        groupId: session.groupId || "HO",
        periodicityName: "All Exchange Combined",
        productType: 1,
      }),
      cache: "no-store",
    });

    const text = await res.text();
    console.log("[AveonTrade] Downstream /getFundsViewSummary response status ->", res.status);

    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      return NextResponse.json(
        { success: false, message: `Unexpected non-JSON response (HTTP ${res.status}).` },
        { status: res.status || 502 }
      );
    }

    const payload = json?.data ?? json?.result ?? json;
    const rows = findMaps(payload).filter((row) => "Net Available Funds" in row);
    const row = rows[0];

    if (!row) {
      return NextResponse.json({
        success: false,
        message: json?.message || "No funds summary rows returned.",
        data: null,
      });
    }

    const lines = KNOWN_LABELS.filter((label) => label in row).map((label) => ({
      label,
      value: asNumber(row[label]),
    }));

    const byLabel = Object.fromEntries(lines.map((l) => [l.label, l.value]));

    return NextResponse.json({
      success: true,
      message: "Funds loaded successfully.",
      data: {
        lines,
        available_margin: byLabel["Net Available Funds"] ?? 0,
        used_margin: byLabel["Total Utilization"] ?? 0,
        total_balance: byLabel["Total Trading Power Limit"] ?? byLabel["Net Available Funds"] ?? 0,
        collateral: byLabel["Collateral"] ?? 0,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Unable to reach the broker. Check your connection and retry." },
      { status: 502 }
    );
  }
}

// Support incoming client requests using GET
export async function GET() {
  return processFundsSummaryRequest();
}

// Support incoming client requests using POST (Resolves the HTTP 405 error)
export async function POST() {
  return processFundsSummaryRequest();
}