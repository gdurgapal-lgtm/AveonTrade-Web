import "server-only";

type Bucket = { count: number; resetAt: number };

// This is deliberately only a local safety net. Multi-instance deployments
// must enforce the same limits in their edge/WAF or a shared store.
const state = globalThis as typeof globalThis & { __aveonRateLimit?: Map<string, Bucket> };
const buckets = state.__aveonRateLimit ?? (state.__aveonRateLimit = new Map<string, Bucket>());

export function takeRateLimit(scope: string, subject: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const key = `${scope}:${subject.trim().toLowerCase().slice(0, 160) || "anonymous"}`;
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}
