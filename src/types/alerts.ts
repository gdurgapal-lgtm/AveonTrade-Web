import type { Instrument } from "@/types/trading";
import { exchangeSegmentFor } from "@/types/trading";

export interface PriceAlert {
  serverAlertId: string;
  uniqueId: string;
  symbol: string;
  alertType: string;
  category: string;
  remarks: string;
  operator: string;
  leftField: string;
  rightField: string;
  value: number;
  marketSegment: number;
  token: number;
  triggered: boolean;
  createDate: string;
  entryTime: string;
  raw: Record<string, any>;
}

function str(value: unknown): string {
  return value == null ? "" : String(value).trim();
}
function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function map(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

export function normalizePriceAlert(value: unknown): PriceAlert {
  const raw = map(value);
  const data = map(raw.data);
  const conditions = Array.isArray(raw.condition) ? raw.condition : [];
  const condition = map(conditions[0]);
  const operand1 = map(condition.operand1);
  const operand2 = map(condition.operand2);
  return {
    serverAlertId: str(raw.serverAlertId),
    uniqueId: str(raw.UniqueId),
    symbol: str(data.symbol),
    alertType: str(data.alertType),
    category: str(data.category),
    remarks: str(data.remarks),
    operator: str(condition.operator),
    leftField: str(operand1.field),
    rightField: str(operand2.field),
    value: num(operand2.value) / 100,
    marketSegment: Math.trunc(num(operand1.marketsegment)),
    token: Math.trunc(num(operand1.token)),
    triggered: num(raw.triggered) === 1,
    createDate: str(raw.createDate),
    entryTime: str(raw.entryTime),
    raw,
  };
}

export function normalizeAlertList(data: unknown): PriceAlert[] {
  if (Array.isArray(data)) return data.map(normalizePriceAlert);
  const root = map(data);
  if (Array.isArray(root.data)) return root.data.map(normalizePriceAlert);
  if (Array.isArray(root.result)) return root.result.map(normalizePriceAlert);
  if (Array.isArray(map(root.data).data)) return map(root.data).data.map(normalizePriceAlert);
  if (Array.isArray(map(root.data).result)) return map(root.data).result.map(normalizePriceAlert);
  if (Array.isArray(map(root.data).alerts)) return map(root.data).alerts.map(normalizePriceAlert);
  return [];
}

export function alertFieldLabel(field: string): string {
  switch (field.toUpperCase()) {
    case "LASTTRADEDPRICE": return "LTP";
    case "LIFETIMEHIGH": return "Life high";
    case "LIFETIMELOW": return "Life low";
    default: return field || "Value";
  }
}

export function alertOperatorLabel(op: string): string {
  switch (op) {
    case ">": return "above";
    case "<": return "below";
    case ">=": return "at/above";
    case "<=": return "at/below";
    case "=": return "at";
    default: return op || "--";
  }
}

export function alertConditionText(alert: PriceAlert): string {
  const right = alert.rightField.toUpperCase() === "USE_VALUE"
    ? `₹${alert.value.toFixed(2)}`
    : alertFieldLabel(alert.rightField);
  return `${alertFieldLabel(alert.leftField)} ${alertOperatorLabel(alert.operator)} ${right}`;
}

export function alertInstrumentFromRecord(alert: PriceAlert): Instrument {
  return {
    exchange: "",
    token: String(alert.token),
    symbol: alert.symbol || "",
    tradingSymbol: alert.symbol || "",
    companyName: alert.symbol || "",
    marketSegmentId: alert.marketSegment || undefined,
    exchangeSegment: exchangeSegmentFor({ marketSegmentId: alert.marketSegment } as Instrument),
  };
}
