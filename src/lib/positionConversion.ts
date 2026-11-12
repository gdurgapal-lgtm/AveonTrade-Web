import { apiClient } from "@/lib/apiClient";
import { Endpoints, positionConversionInquiryPath } from "@/lib/endpoints";
import { fetchShared, invalidateShared } from "@/lib/sharedFetch";
import type { PositionModel } from "@/types/trading";

/**
 * Position conversion is accepted by the broker first and applied by the OMS a
 * moment later, so the PUT succeeding does NOT mean the position list has
 * changed yet. This module confirms the change against the positions list
 * itself (the source of truth) before telling the user it worked.
 */

export interface ConversionBaseline {
  exchange: string;
  token: string;
  oldProduct: string;
  newProduct: string;
  oldQty: number;
  newQty: number;
  quantity: number;
}

export interface ConversionOutcome {
  status: "confirmed" | "rejected" | "timeout";
  message: string;
}

const norm = (v: unknown) => String(v ?? "").trim().toUpperCase();
const tokenOf = (r: Record<string, any>) => String(r.preferred_scrip_token ?? r.scrip_token ?? "");
const exchangeOf = (r: Record<string, any>) => norm(r.preferred_exchange || r.exchange);

function absQty(rows: Record<string, any>[], exchange: string, token: string, product: string): number {
  return rows
    .filter((r) => exchangeOf(r) === exchange && tokenOf(r) === token && norm(r.product_type) === product)
    .reduce((sum, r) => sum + Math.abs(Number(r.net_quantity) || 0), 0);
}

const asRows = (data: unknown): Record<string, any>[] => (Array.isArray(data) ? (data as Record<string, any>[]) : []);

/** Snapshot taken BEFORE sending the conversion, to compare against afterwards. */
export function conversionBaseline(positions: PositionModel[], selected: PositionModel, newProduct: string, quantity: number): ConversionBaseline {
  const rows = positions as unknown as Record<string, any>[];
  const exchange = norm(selected.preferred_exchange || selected.exchange);
  const token = String(selected.preferred_scrip_token ?? selected.scrip_token ?? "");
  const oldProduct = norm(selected.product_type);
  const target = norm(newProduct);
  return {
    exchange,
    token,
    oldProduct,
    newProduct: target,
    oldQty: absQty(rows, exchange, token, oldProduct),
    newQty: absQty(rows, exchange, token, target),
    quantity,
  };
}

/** True once the list shows the converted quantity moved from the old product to the new one. */
function isApplied(data: unknown, b: ConversionBaseline): boolean {
  const rows = asRows(data);
  const oldNow = absQty(rows, b.exchange, b.token, b.oldProduct);
  const newNow = absQty(rows, b.exchange, b.token, b.newProduct);
  return oldNow < b.oldQty || newNow > b.newQty;
}

// Waits before each check (~10 s in total). The OMS normally applies it within a second or two.
const CHECK_DELAYS_MS = [600, 900, 1300, 1800, 2400, 3000];
const REJECTED = /reject|fail|declin|cancel|invalid|error|not allowed/i;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function confirmPositionConversion(args: {
  positionsPath: string;
  baseline: ConversionBaseline;
  orderId?: string;
  onProgress?: (message: string) => void;
}): Promise<ConversionOutcome> {
  const { positionsPath, baseline, orderId, onProgress } = args;
  const label = `${baseline.oldProduct} → ${baseline.newProduct}`;
  let inquiryMessage = "";

  for (let i = 0; i < CHECK_DELAYS_MS.length; i++) {
    await sleep(CHECK_DELAYS_MS[i]);
    onProgress?.(`Waiting for OMS to apply the conversion… (${i + 1}/${CHECK_DELAYS_MS.length})`);

    // The inquiry only tells us if the OMS refused it; success is judged from the position list below.
    if (orderId) {
      const inquiry = await apiClient.get(positionConversionInquiryPath(orderId));
      if (inquiry.message) inquiryMessage = inquiry.message;
      if (!inquiry.success) {
        const detail = `${inquiry.message ?? ""} ${typeof inquiry.data === "string" ? inquiry.data : ""}`;
        if (REJECTED.test(detail)) {
          return { status: "rejected", message: `Conversion was not applied${inquiryMessage ? `: ${inquiryMessage}` : "."}` };
        }
      }
    }

    // Refetch positions everywhere (dashboard, positions page, market-watch panel…), then check the result.
    invalidateShared(Endpoints.positions.list);
    const res = await fetchShared(positionsPath, true);
    if (res.success && isApplied(res.data, baseline)) {
      return { status: "confirmed", message: `Converted ${baseline.quantity} (${label}). Positions updated.` };
    }
  }

  return {
    status: "timeout",
    message: `Conversion ${orderId ? `${orderId} ` : ""}(${label}) was accepted but the position list hasn't changed yet. It will update automatically; check again shortly.`,
  };
}
