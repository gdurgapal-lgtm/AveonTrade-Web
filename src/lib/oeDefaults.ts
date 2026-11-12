import type { OrderKind, ProductType, Validity } from "@/types/trading";

/**
 * Per-exchange Order Entry defaults ("Settings → Order Entry").
 * Each exchange segment can store its own default validity, product and order
 * type. Anything left unset falls back to the app's built-in behaviour.
 * Stored in this browser (localStorage), like the app's other UI preferences.
 */
export interface OeSegmentDefaults {
  validity?: Validity;
  productType?: ProductType;
  orderKind?: OrderKind;
}
export type OeDefaultsMap = Record<string, OeSegmentDefaults>;

export const OE_DEFAULTS_STORAGE_KEY = "aveon_oe_defaults_v1";
export const OE_DEFAULTS_EVENT = "aveon-oe-defaults-change";

/** Friendly names for the exchange codes in the broker's Reference Catalog. */
const SEGMENT_LABELS: Record<string, string> = {
  NSE_EQ: "NSE Equity",
  BSE_EQ: "BSE Equity",
  NSE_FO: "NSE Derivatives",
  BSE_FO: "BSE Derivatives",
  MCX_FO: "MCX Commodity",
  NCDEX_FO: "NCDEX Commodity",
  ICEX_FO: "ICEX Commodity",
  NSE_CUR: "NSE Currency",
  BSE_CUR: "BSE Currency",
  MSE_CUR: "MSE Currency",
  NSE_COMM: "NSE Commodity",
  BSE_COMM: "BSE Commodity",
  NSE_OTS: "NSE Odd Lot",
  NSE_EGR: "NSE Electronic Gold Receipt",
};

export function segmentLabel(key: string): string {
  const code = normalizeSegmentKey(key);
  return SEGMENT_LABELS[code] ?? code.replace(/_/g, " ");
}

/**
 * The exchanges to show in Settings: the ones the account is allowed to trade
 * (login `exchanges`, in the broker's order). Falls back to the standard list
 * only when the allowed list isn't available (e.g. a session from before it was captured).
 */
export function segmentsForExchanges(allowed: string[] | null | undefined): { key: string; label: string; cash: boolean }[] {
  const keys = Array.from(new Set((allowed ?? []).map(normalizeSegmentKey).filter(Boolean)));
  if (!keys.length) return OE_SEGMENTS;
  return keys.map((key) => ({ key, label: segmentLabel(key), cash: isCashSegmentKey(key) }));
}

/** Standard exchange list — only used as a fallback (see segmentsForExchanges). */
export const OE_SEGMENTS: { key: string; label: string; cash: boolean }[] = [
  { key: "NSE_EQ", label: "NSE Equity", cash: true },
  { key: "BSE_EQ", label: "BSE Equity", cash: true },
  { key: "NSE_FO", label: "NSE Derivatives", cash: false },
  { key: "BSE_FO", label: "BSE Derivatives", cash: false },
  { key: "MCX_FO", label: "MCX Commodity", cash: false },
  { key: "NCDEX_FO", label: "NCDEX Commodity", cash: false },
  { key: "NSE_CUR", label: "NSE Currency", cash: false },
  { key: "BSE_CUR", label: "BSE Currency", cash: false },
  { key: "MSE_CUR", label: "MSE Currency", cash: false },
  { key: "NSE_COMM", label: "NSE Commodity", cash: false },
  { key: "BSE_COMM", label: "BSE Commodity", cash: false },
];

export const ORDER_KIND_OPTIONS: { value: OrderKind; label: string }[] = [
  { value: "MARKET", label: "Market" },
  { value: "LIMIT", label: "Limit" },
  { value: "SL_LIMIT", label: "SL (Limit)" },
  { value: "SL_MARKET", label: "SL-M (Market)" },
];

/** Plain "NSE" / "BSE" (no segment suffix) are cash-equity. */
export function normalizeSegmentKey(segmentLike?: string): string {
  const value = String(segmentLike ?? "").trim().toUpperCase();
  if (value === "NSE") return "NSE_EQ";
  if (value === "BSE") return "BSE_EQ";
  return value;
}

export function isCashSegmentKey(segmentKey: string): boolean {
  return segmentKey === "NSE_EQ" || segmentKey === "BSE_EQ";
}

/** BSE segments additionally offer EOS (sent to the API as EOSESS). */
export function validityOptionsFor(segmentKey: string): Validity[] {
  return normalizeSegmentKey(segmentKey).startsWith("BSE") ? ["EOS", "DAY", "IOC", "GTD"] : ["DAY", "IOC", "GTD"];
}

/**
 * Same product choices Order Entry offers: cash = CNC/MIS, everything else = MIS/NRML.
 * When the broker's allowed products for the exchange are known (login
 * `product_types_exchange`), only the ones it permits are offered:
 * MIS needs INTRADAY, CNC needs DELIVERY, NRML needs DELIVERY (or CARRYFORWARD).
 */
export function productOptionsFor(segmentKey: string, allowedApiProducts?: string[]): ProductType[] {
  const base: ProductType[] = isCashSegmentKey(normalizeSegmentKey(segmentKey)) ? ["CNC", "MIS"] : ["MIS", "NRML"];
  const allowed = new Set((allowedApiProducts ?? []).map((p) => String(p).toUpperCase()));
  if (!allowed.size) return base;
  const filtered = base.filter((code) =>
    code === "MIS" ? allowed.has("INTRADAY")
    : code === "CNC" ? allowed.has("DELIVERY")
    : allowed.has("DELIVERY") || allowed.has("CARRYFORWARD")
  );
  return filtered.length ? filtered : base;
}

function sanitize(segmentKey: string, raw: unknown): OeSegmentDefaults {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: OeSegmentDefaults = {};
  if (validityOptionsFor(segmentKey).includes(row.validity as Validity)) out.validity = row.validity as Validity;
  if (productOptionsFor(segmentKey).includes(row.productType as ProductType)) out.productType = row.productType as ProductType;
  if (ORDER_KIND_OPTIONS.some((o) => o.value === row.orderKind)) out.orderKind = row.orderKind as OrderKind;
  return out;
}

export function loadOeDefaults(): OeDefaultsMap {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(OE_DEFAULTS_STORAGE_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object") return {};
    const map: OeDefaultsMap = {};
    for (const [rawKey, value] of Object.entries(parsed as Record<string, unknown>)) {
      const key = normalizeSegmentKey(rawKey);
      const clean = sanitize(key, value);
      if (Object.keys(clean).length) map[key] = clean;
    }
    return map;
  } catch {
    return {};
  }
}

export function saveOeDefaults(map: OeDefaultsMap) {
  try {
    window.localStorage.setItem(OE_DEFAULTS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* storage full / blocked — defaults simply won't persist */
  }
  window.dispatchEvent(new Event(OE_DEFAULTS_EVENT));
}

/** The user's saved defaults for one exchange segment (validated for that segment). */
export function getOeDefaultsFor(segmentLike?: string): OeSegmentDefaults {
  const key = normalizeSegmentKey(segmentLike);
  return sanitize(key, loadOeDefaults()[key]);
}
