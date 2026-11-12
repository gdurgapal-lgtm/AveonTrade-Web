export function formatCurrency(value: number | undefined | null): string {
  const n = Number(value ?? 0);
  return n.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
}

export function formatNumber(value: number | undefined | null, digits = 2): string {
  const n = Number(value ?? 0);
  return n.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function pnlTone(value: number | undefined | null): "buy" | "sell" | "neutral" {
  const n = Number(value ?? 0);
  if (n > 0) return "buy";
  if (n < 0) return "sell";
  return "neutral";
}
