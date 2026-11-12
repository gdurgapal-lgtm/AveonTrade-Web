import { apiClient } from "@/lib/apiClient";
import type { Instrument } from "@/types/trading";
import { normalizeAlertList, type PriceAlert } from "@/types/alerts";

const ALERTS_ENDPOINT = "/alerts";

function categoryFor(instrument: Instrument): string {
  const segment = String(instrument.exchangeSegment ?? instrument.exchange ?? "").toUpperCase();
  const name = String(instrument.instrumentName ?? "").toUpperCase();
  if (segment.includes("FO") || name.startsWith("FUT") || name.startsWith("OPT")) return "FO";
  if (segment.includes("COMM") || segment.includes("MCX") || segment.includes("NCDEX")) return "COMM";
  if (instrument.isIndex) return "INDEX";
  return "EQ";
}

function fieldForApi(field: string): string {
  switch (field.toUpperCase()) {
    case "LASTTRADEDPRICE": return "LastTradedPrice";
    case "LIFETIMEHIGH": return "LifeTimeHigh";
    case "LIFETIMELOW": return "LifeTimeLow";
    case "USE_VALUE": return "USE_VALUE";
    default: return field;
  }
}

export async function fetchPriceAlerts(): Promise<{ success: boolean; message: string; alerts: PriceAlert[] }> {
  const response = await apiClient.get(ALERTS_ENDPOINT);
  return {
    success: response.success,
    message: response.message,
    alerts: response.success ? normalizeAlertList(response.data) : [],
  };
}

export async function createPriceAlert(args: {
  instrument: Instrument;
  operator: string;
  price: number;
  goodTillTrigger?: boolean;
}): Promise<{ success: boolean; message: string; data?: unknown }> {
  const { instrument, operator, price, goodTillTrigger = true } = args;
  const marketSegment = Number(instrument.marketSegmentId ?? instrument.tradingMarketSegmentId ?? 0);
  const token = Number(instrument.token);
  const symbol = String(instrument.symbol ?? "").trim() || String(instrument.tradingSymbol ?? "").trim();
  if (!marketSegment || !token || !symbol) return { success: false, message: "Market segment, token or symbol is missing." };
  if (!Number.isFinite(price) || price <= 0) return { success: false, message: "Enter a valid alert price." };

  const payload = {
    condition: [{
      operand1: { marketsegment: marketSegment, token, field: fieldForApi("LASTTRADEDPRICE") },
      operand2: { marketsegment: marketSegment, token, field: fieldForApi("USE_VALUE"), value: Math.round(price * 100) },
      operator,
    }],
    data: {
      remarks: `${symbol} LTP ${operator} ${price.toFixed(2)}`,
      userid: "",
      tenantid: "",
      symbol,
      alertType: "PRICE",
      category: categoryFor(instrument),
    },
    expiration: -1,
    goodTillTrigger,
    createDate: new Date().toISOString(),
  };

  const response = await apiClient.post(ALERTS_ENDPOINT, payload);
  return { success: response.success, message: response.message || (response.success ? "Alert created successfully." : "Unable to create alert."), data: response.data };
}

export async function deletePriceAlert(alert: PriceAlert): Promise<{ success: boolean; message: string }> {
  const id = alert.serverAlertId || alert.uniqueId;
  if (!id) return { success: false, message: "Alert id is missing." };
  const response = await apiClient.delete(`${ALERTS_ENDPOINT}/${encodeURIComponent(id)}`);
  return { success: response.success, message: response.message || (response.success ? "Alert deleted successfully." : "Unable to delete alert.") };
}
