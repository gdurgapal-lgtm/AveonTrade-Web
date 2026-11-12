import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/session";

type Action = "approval" | "revoke";

function configured(name: string): string {
  return (process.env[name] ?? "").trim();
}

function secureHttpsUrl(value: string): boolean {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

export async function POST(req: NextRequest) {
  if (!readSession()) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }

  let body: Record<string, any>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ success: false, message: "Invalid request." }, { status: 400 }); }

  const action = body.action as Action;
  if (action !== "approval" && action !== "revoke") {
    return NextResponse.json({ success: false, message: "Unsupported EDIS action." }, { status: 400 });
  }

  const envPrefix = action === "approval" ? "EDIS_APPROVAL" : "EDIS_REVOKE";
  const baseUrl = configured(`${envPrefix}_URL`);
  const userCode = configured("EDIS_USER_CODE");
  const managerIP = configured("EDIS_MANAGER_IP");
  const sessionID = configured("EDIS_SESSION_ID");
  const channel = configured("EDIS_CHANNEL") || "WEB";
  const productCode = configured("EDIS_PRODUCT_CODE") || "WEBAPI";
  const marketSegId = configured("EDIS_MARKET_SEGMENT_ID") || "1";
  const exchangeCd = configured("EDIS_EXCHANGE_CD") || "NSE";
  const productType = configured("EDIS_PRODUCT_TYPE") || "D";
  const amo = configured("EDIS_AMO") || "N";
  const settlementCycle = configured("EDIS_SETTLEMENT_CYCLE") || "T1";
  const revokeTheme = configured("EDIS_REVOKE_THEME") || "L";

  if (!baseUrl || !secureHttpsUrl(baseUrl) || !userCode || !managerIP || !sessionID) {
    return NextResponse.json({
      success: false,
      message: "EDIS is not fully configured on the server. Ask your administrator to configure the EDIS redirect URLs and broker session settings.",
    }, { status: 503 });
  }

  const dp = body.dp && typeof body.dp === "object" ? body.dp : {};
  const options = body.options && typeof body.options === "object" ? body.options : {};
  const details = Array.isArray(body.scripDetails) ? body.scripDetails : [];
  const requestId = String(body.requestId ?? "").trim();
  const depository = String(body.depository ?? "").toUpperCase();

  if (!requestId || !dp.dpId || !dp.clientId || !details.length ||
      details.some((item: any) => !item?.ISIN || !Number.isFinite(Number(item?.Quantity)) || Number(item.Quantity) <= 0)) {
    return NextResponse.json({ success: false, message: "Select securities with valid quantities and refresh DP Details before continuing." }, { status: 400 });
  }
  if (action === "revoke" && depository !== "CDSL" && depository !== "NSDL") {
    return NextResponse.json({ success: false, message: "The broker returned an unsupported depository type." }, { status: 400 });
  }

  const params = action === "approval"
    ? new URLSearchParams({
        userCode, managerIP, sessionID, channel,
        isin: String(details[0].ISIN), isinName: String(details[0].ISINName ?? details[0].ISIN),
        exchangeCd: exchangeCd, product: "1", instrument: "Equity",
        quantity: String(details.reduce((sum: number, item: any) => sum + Number(item.Quantity), 0)),
        dpId: String(dp.dpId), clientId: String(dp.clientId), depository,
        productcode: productCode, MarketSegId: marketSegId,
        ScripDetails: JSON.stringify(details.map((item: any) => ({ ...item, SettlmtCycle: settlementCycle }))), ReqId: requestId,
        userId: String(dp.userId ?? ""), groupId: String(dp.groupId ?? ""),
        ProductType: productType,
        AMO: amo,
        SettlmtCycle: settlementCycle,
      })
    : new URLSearchParams({
        userCode, depository, userId: String(dp.userId ?? ""), groupId: String(dp.groupId ?? ""),
        managerIP, sessionID, dpId: String(dp.dpId), clientId: String(dp.clientId),
        productcode: productCode, ScripDetails: JSON.stringify(details), channel,
        theme: revokeTheme,
      });

  if (action === "revoke" && depository === "CDSL") {
    params.set("exchangeCd", exchangeCd);
    params.set("product", "1");
    params.set("ReqId", requestId);
  }

  const encoded = Buffer.from(params.toString(), "utf8").toString("base64");
  const target = new URL(baseUrl);
  target.searchParams.set("enct", encoded);

  return NextResponse.json({ success: true, url: target.toString(), requestId }, {
    headers: { "Cache-Control": "no-store" },
  });
}
