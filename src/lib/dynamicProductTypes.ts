import { apiClient } from "@/lib/apiClient";
import { Endpoints } from "@/lib/endpoints";

export interface DynamicProductType { code: string }

let cachedProducts: DynamicProductType[] | null = null;
let productsRequest: Promise<DynamicProductType[]> | null = null;

function extract(value: unknown): DynamicProductType[] {
  const root = value as { result?: unknown; data?: { result?: unknown } | unknown } | null;
  const raw = root?.result ?? (root?.data && typeof root.data === "object" && "result" in root.data
    ? (root.data as { result?: unknown }).result
    : root?.data) ?? value;
  if (!Array.isArray(raw)) return [];
  const mapped = raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const code = String(row.sDefaultProductType ?? row.productType ?? row.product_type ?? "").trim().toUpperCase();
    if (["DELIVERY", "INTRADAY", "CARRYFORWARD", "COVER", "COVER ORDER", "BRACKET", "BRACKET ORDER"].includes(code)) {
      return [{ code: code === "COVER ORDER" ? "COVER" : code === "BRACKET ORDER" ? "BRACKET" : code }];
    }
    return [];
  });
  return mapped.filter((item, index) => mapped.findIndex((other) => other.code === item.code) === index);
}

/** Fetch once per browser session; both Order Entry and chart Mouse Trading reuse the same result/promise. */
export function getDynamicProductTypes(): Promise<DynamicProductType[]> {
  if (cachedProducts) return Promise.resolve(cachedProducts);
  if (productsRequest) return productsRequest;
  productsRequest = apiClient.get(Endpoints.auth.dynamicProductTypes)
    .then((response) => {
      const products = response.success ? extract(response.data ?? response) : [];
      if (products.length) cachedProducts = products;
      return products;
    })
    .catch(() => [])
    .finally(() => { productsRequest = null; });
  return productsRequest;
}
