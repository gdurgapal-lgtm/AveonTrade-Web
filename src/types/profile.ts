/** Shape of GET /authentication/v1/user/profile (fields may be missing or blank). */
export interface ProfileBank {
  [key: string]: unknown; // the API may add fields — they are kept and displayed
  bank_name?: string;
  branch_name?: string;
  branch_city?: string;
  account_no?: string | number;
  account_type?: string | number;
  is_default?: boolean;
}

export interface ProfileDp {
  [key: string]: unknown;
  dpId?: string;
  clientBeneficiaryId?: string;
  holdingType?: string | number;
  dpType?: string; // CDSL | NSDL
  defaultDP?: boolean;
  dpName?: string;
}

export interface UserProfile {
  [key: string]: unknown;
  user_name?: string;
  email?: string;
  mobile_no?: string;
  pan?: string;
  address?: string;
  mpin_enabled?: boolean;
  fingerprint_enabled?: boolean;
  dob?: string;
  gender?: string;
  productAllowed?: number;
  bank_details?: ProfileBank[];
  dp_details?: ProfileDp[];
  mf_details?: Record<string, unknown> | unknown[] | null;
}

export const DASH = "—";

export const text = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

/** Keeps the last `keep` characters, hides the rest: ••••••3210 */
export function maskTail(value: unknown, keep = 4): string {
  const v = text(value);
  if (!v) return "";
  return v.length > keep ? "•".repeat(v.length - keep) + v.slice(-keep) : v;
}

/** ABCDE1234F -> ABCDE••••F */
export function maskPan(value: unknown): string {
  const v = text(value);
  if (v.length < 10) return maskTail(v, 1);
  return `${v.slice(0, 5)}••••${v.slice(-1)}`;
}

/** 9999999999 -> 99••••••99 */
export function maskMobile(value: unknown): string {
  const v = text(value);
  if (v.length <= 4) return v;
  return `${v.slice(0, 2)}${"•".repeat(v.length - 4)}${v.slice(-2)}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Accepts the profile whether it comes wrapped in `data` or as a one-element array. */
export function readProfile(data: unknown): UserProfile | null {
  let node: any = data;
  if (Array.isArray(node)) node = node[0];
  if (node && typeof node === "object" && node.data && typeof node.data === "object" && !("user_name" in node) && !("email" in node)) node = node.data;
  if (Array.isArray(node)) node = node[0];
  return node && typeof node === "object" ? (node as UserProfile) : null;
}

export function listOf<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Scalar key/value pairs of an arbitrary object (used for the MF details block). */
export function scalarEntries(value: unknown): [string, string][] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && v !== "" && typeof v !== "object")
    .map(([k, v]) => [k.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase()), String(v)]);
}

/* ----------------------- show-everything helpers ----------------------- */

export const PROFILE_KNOWN_KEYS = [
  "user_name", "email", "mobile_no", "pan", "address", "mpin_enabled", "fingerprint_enabled",
  "dob", "gender", "productAllowed", "bank_details", "dp_details", "mf_details",
];
export const BANK_KNOWN_KEYS = ["bank_name", "branch_name", "branch_city", "account_no", "account_type", "is_default"];
export const DP_KNOWN_KEYS = ["dpId", "clientBeneficiaryId", "holdingType", "dpType", "defaultDP", "dpName"];

const normKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Fields of `obj` that are not in `known` (so nothing the API sends is ever dropped). */
export function extraEntries(obj: unknown, known: string[]): [string, unknown][] {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
  const knownSet = new Set(known.map(normKey));
  return Object.entries(obj as Record<string, unknown>).filter(([key]) => !knownSet.has(normKey(key)));
}

/** "clientBeneficiaryId" -> "Client Beneficiary Id", "branch_city" -> "Branch City" */
export function humanize(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

/** Is this a field holding an identifier that should be hidden until the user reveals it? */
export function isSensitiveKey(key: string): boolean {
  const tokens = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (tokens.includes("type") || tokens.includes("name") || tokens.includes("flag")) return false;
  return tokens.some((t) => ["pan", "mobile", "phone", "aadhaar", "aadhar", "passport", "ucc", "account", "acct", "beneficiary", "demat"].includes(t));
}

export function maskValueForKey(key: string, value: unknown): string {
  const tokens = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/);
  if (tokens.includes("pan")) return maskPan(value);
  if (tokens.includes("mobile") || tokens.includes("phone")) return maskMobile(value);
  return maskTail(value);
}

/** Display text for any value: scalars as text, objects/arrays as compact JSON. */
export function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Deep copy of the response with sensitive identifiers masked (for the raw-response view). */
export function maskDeep(value: unknown, reveal: boolean, key = ""): unknown {
  if (Array.isArray(value)) return value.map((v) => maskDeep(v, reveal, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, maskDeep(v, reveal, k)]));
  }
  if (!reveal && key && isSensitiveKey(key) && value !== null && value !== undefined && value !== "") return maskValueForKey(key, value);
  return value;
}

/** The demat account flagged default (falls back to the first one). */
export function defaultDp(profile: UserProfile | null | undefined): ProfileDp | undefined {
  const dps = listOf<ProfileDp>(profile?.dp_details);
  return dps.find((d) => d.defaultDP === true) ?? dps[0];
}

/** The bank account flagged default (falls back to the first one). */
export function defaultBank(profile: UserProfile | null | undefined): ProfileBank | undefined {
  const banks = listOf<ProfileBank>(profile?.bank_details);
  return banks.find((b) => b.is_default === true) ?? banks[0];
}
