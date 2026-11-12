/** Types + display helpers for the IPO module (Synapsewave CloudRest "IPO" APIs). */

export interface IpoListItem {
  IPOCode: string;
  OfferName: string;
  OfferType?: string; // "IPO" | "FPO"
  MinPrice?: number | string;
  MaxPrice?: number | string;
  StartDate?: string;
  EndDate?: string;
  IssueSize?: string | number;
  FaceValue?: number | string;
  LotSize?: string | number;
  IssueType?: string;
  MinOrderQty?: number | string;
  MinAmount?: number | string;
  nMarketLotBIDQty?: string | number;
  nMinimumLotBIDQty?: string | number;
  dtStartDate?: string | null;
  dtDailyStartTime?: string | null;
  dtDailyEndTime?: string | null;
  brokerReco?: string;
  exchange?: string;
  bidStatus?: string; // ONGOING | CLOSED | UPCOMING …
  placeModifyBid?: boolean;
  cardDisplay?: boolean;
}

export interface IpoListData {
  CurrentIPOList?: IpoListItem[];
  FutureIPOList?: IpoListItem[];
  PastIPOList?: IpoListItem[];
}

export interface IpoCategory {
  AppCategoryCode?: string;
  AppCategoryName?: string;
  MinPrice?: number | string;
  MaxPrice?: number | string;
  StartDateTime?: string;
  EndDateTime?: string;
  MaxBidLots?: string | number;
  MinAmount?: number | string;
  MaxAmount?: number | string;
  DiscountType?: string | number;
  DiscountValue?: number | string;
  /** Whether this category may bid at the cut-off price (sample response: BidCutOffFlag). */
  BidCutOffFlag?: boolean | string;
  BidCutOffLag?: boolean | string;
}

export interface IpoDetails {
  IPOCode?: string;
  Name?: string;
  OfferType?: string;
  Series?: string;
  MinPrice?: number | string;
  MaxPrice?: number | string;
  IssueType?: string;
  StartDate?: string;
  EndDate?: string;
  IssueSize?: string | number;
  FaceValue?: number | string;
  LotSize?: string | number;
  MinOrderQty?: number | string;
  TickSize?: number | string;
  DailyBiddingStartTime?: string;
  DailyBiddingEndTime?: string;
  RegisterName?: string;
  Ratings?: string;
  RatingAgency?: string;
  ProspectusLink?: string;
  /** Normalised from the API key, which arrives as "RTALink " (trailing space). */
  RTAlink?: string;
  BrokerReco?: string;
  Symbol?: string;
  CategoryWise?: IpoCategory[];
}

export const EMPTY = "—";

/** Parses numbers that may arrive as strings; null when blank / non-numeric. */
export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function formatRupees(value: unknown, zeroAsEmpty = true): string {
  const n = toNumber(value);
  if (n === null || (zeroAsEmpty && n === 0)) return EMPTY;
  return n.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
}

export function formatCount(value: unknown): string {
  const n = toNumber(value);
  if (n === null) return value ? String(value) : EMPTY; // e.g. "2000 Cr"
  return n.toLocaleString("en-IN");
}

export function priceBand(min: unknown, max: unknown): string {
  const lo = toNumber(min);
  const hi = toNumber(max);
  if (!lo && !hi) return EMPTY;
  if (lo && hi && lo !== hi) return `${formatRupees(lo)} – ${formatRupees(hi)}`;
  return formatRupees(hi || lo);
}

export function dateRange(start?: string, end?: string): string {
  const s = (start ?? "").trim();
  const e = (end ?? "").trim();
  if (!s && !e) return EMPTY;
  return `${s || EMPTY} → ${e || EMPTY}`;
}

/**
 * The broker sends bidding hours as "1970-01-01T10:00:00.000Z" (or a plain
 * "10:00"). The hour is the wall-clock bidding time, so it is read in UTC
 * with no timezone shift.
 */
export function timeOfDay(value?: string | null): string {
  if (!value) return EMPTY;
  const plain = /^(\d{1,2}):(\d{2})/.exec(value);
  if (plain) return `${plain[1].padStart(2, "0")}:${plain[2]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return EMPTY;
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function biddingWindow(start?: string | null, end?: string | null): string {
  const s = timeOfDay(start);
  const e = timeOfDay(end);
  return s === EMPTY && e === EMPTY ? EMPTY : `${s} – ${e}`;
}

/** Date-time as sent by the broker (UTC fields are the wall-clock values). */
export function dateTimeLabel(value?: string | null): string {
  if (!value) return EMPTY;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value.trim()); // e.g. "2022-03-30" — no time part
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-IN", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(dateOnly ? {} : { hour: "2-digit", minute: "2-digit", hour12: false }),
  });
}

export type IpoStatusTone = "buy" | "warn" | "neutral";

export function ipoStatus(raw?: string): { label: string; tone: IpoStatusTone } {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "ONGOING" || s === "OPEN" || s === "CURRENT") return { label: "Open", tone: "buy" };
  if (s === "UPCOMING" || s === "FUTURE") return { label: "Upcoming", tone: "warn" };
  if (s === "CLOSED" || s === "PAST") return { label: "Closed", tone: "neutral" };
  return { label: raw ? String(raw) : EMPTY, tone: "neutral" };
}

/** Only ever link out to http(s) URLs coming from the API. */
export function safeExternalUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The list API nests the three lists under `data`; accept either shape. */
export function readIpoLists(data: unknown): Required<IpoListData> {
  const root = (data && typeof data === "object" ? data : {}) as Record<string, any>;
  const source = root.CurrentIPOList || root.FutureIPOList || root.PastIPOList ? root : root.data ?? {};
  const asList = (v: unknown): IpoListItem[] => (Array.isArray(v) ? (v as IpoListItem[]) : []);
  return {
    CurrentIPOList: asList(source.CurrentIPOList),
    FutureIPOList: asList(source.FutureIPOList),
    PastIPOList: asList(source.PastIPOList),
  };
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value === "string") {
    const t = value.trim();
    if (t.startsWith("{") || t.startsWith("[")) {
      try {
        return JSON.parse(t);
      } catch {
        /* not JSON — keep the string */
      }
    }
  }
  return value;
}

/** Finds the object that actually holds the IPO details, however deeply the broker wrapped it. */
function findDetailsNode(value: unknown, depth = 0): Record<string, any> | null {
  const v = parseMaybeJson(value);
  if (Array.isArray(v)) {
    for (const item of v) {
      const found = findDetailsNode(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const obj = v as Record<string, any>;
  if (pickField(obj, ["ipocode", "categorywise"]) !== undefined) return obj;
  if (depth >= 3) return null;
  for (const child of Object.values(obj)) {
    if (child && (typeof child === "object" || typeof child === "string")) {
      const found = findDetailsNode(child, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/** Category rows arrive as `CategoryWise` — but tolerate other names, JSON strings and keyed objects. */
function readCategories(details: Record<string, any>): IpoCategory[] {
  const preferred = ["categorywise", "categories", "categorylist", "categorywisedetails", "categorydetails"];
  const entries = Object.entries(details).map(([key, value]) => [normKey(key), value] as const);
  const candidates = [
    ...preferred.map((name) => entries.find(([k]) => k === name)?.[1]),
    ...entries.filter(([k]) => k.includes("categor") && !preferred.includes(k)).map(([, v]) => v),
  ];
  for (const candidate of candidates) {
    const parsed = parseMaybeJson(candidate);
    const rows: any[] = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" ? Object.values(parsed) : [];
    const categories = rows
      .filter((row) => row && typeof row === "object")
      .map((row): IpoCategory => {
        const code = pickText(row, ["appcategorycode", "categorycode", "code", "category"]);
        const name = pickText(row, ["appcategoryname", "categoryname", "name", "description"]);
        return {
          AppCategoryCode: code || name,
          AppCategoryName: name || code,
          MinPrice: pickField(row, ["minprice"]) as any,
          MaxPrice: pickField(row, ["maxprice"]) as any,
          StartDateTime: pickText(row, ["startdatetime", "startdate"]),
          EndDateTime: pickText(row, ["enddatetime", "enddate"]),
          MaxBidLots: pickField(row, ["maxbidlots", "maxlots"]) as any,
          MinAmount: pickField(row, ["minamount"]) as any,
          MaxAmount: pickField(row, ["maxamount"]) as any,
          DiscountType: pickField(row, ["discounttype"]) as any,
          DiscountValue: pickField(row, ["discountvalue"]) as any,
          BidCutOffFlag: pickField(row, ["bidcutoffflag", "bidcutofflag", "bidcutoff", "cutoff"]) as any,
        };
      })
      .filter((c) => c.AppCategoryCode);
    if (categories.length) return categories;
  }
  return [];
}

/** Retail first: the category an individual investor normally applies under. */
export function defaultCategory(categories: IpoCategory[]): IpoCategory | undefined {
  const label = (c: IpoCategory) => `${c.AppCategoryCode ?? ""} ${c.AppCategoryName ?? ""}`.toLowerCase();
  return (
    categories.find((c) => String(c.AppCategoryCode ?? "").toLowerCase() === "retail") ??
    categories.find((c) => label(c).includes("retail")) ??
    categories.find((c) => /\b(ind|rii|individual)\b/.test(label(c))) ??
    categories[0]
  );
}

/** Details may come wrapped in `data`, in an array, or even as a JSON string. */
export function readIpoDetails(data: unknown): IpoDetails | null {
  const root = parseMaybeJson(data);
  const node = findDetailsNode(root) ?? (Array.isArray(root) ? root[0] : root);
  if (!node || typeof node !== "object") return null;
  const details = { ...(node as Record<string, any>) } as IpoDetails & Record<string, any>;
  // The API has shipped `Series`/`series` and an `RTALink ` key with a trailing space — normalise both.
  details.Series = pickText(details, ["series"]) || details.Series;
  details.RTAlink = pickText(details, ["rtalink"]) || details.RTAlink;
  details.CategoryWise = readCategories(details);
  return details;
}

/** May this category bid at the cut-off price? Unknown (flag missing) is treated as allowed. */
export function cutoffAllowed(category?: IpoCategory | null): boolean {
  const flag = category?.BidCutOffFlag ?? category?.BidCutOffLag;
  if (flag === undefined || flag === null || flag === "") return true;
  return /^(true|1|y|yes)$/i.test(String(flag));
}

/* ------------------------- Apply / modify / cancel ------------------------- */

/** Case/prefix-insensitive field lookup — the broker mixes `sDPId`, `DPId`, `dp_id`… */
const normKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");

export function pickField(row: Record<string, any> | null | undefined, aliases: string[]): unknown {
  if (!row || typeof row !== "object") return undefined;
  const entries = Object.entries(row).map(([key, value]) => [normKey(key), value] as const);
  for (const alias of aliases) {
    // exact match first, then a single Hungarian-style prefix letter (sDPId / nTransactionNo)
    const hit =
      entries.find(([k]) => k === alias) ??
      entries.find(([k]) => k.length === alias.length + 1 && k.endsWith(alias));
    if (hit && hit[1] !== null && hit[1] !== undefined && hit[1] !== "") return hit[1];
  }
  return undefined;
}

export const pickText = (row: Record<string, any> | null | undefined, aliases: string[]): string => {
  const value = pickField(row, aliases);
  return value === undefined || value === null ? "" : String(value).trim();
};

export const IPO_FIELD = {
  ipoCode: ["ipocode", "ipo", "symbol"],
  series: ["series"],
  category: ["appcategorycode", "categorycode", "category"],
  dpId: ["dpid", "dpcode", "dpidno"],
  beneficiary: ["beneficiaryid", "clientbeneficiaryid", "benificiaryid", "boid", "beneficiaryaccountno", "clientbenid", "dematno", "demataccountno"],
  upi: ["upiid", "upi", "vpa"],
  transactionNo: ["transactionno", "transactionnumber", "transno", "txnno"],
  referenceNo: ["referenceno", "referencenumber", "refno"],
  status: ["status", "orderstatus", "applicationstatus"],
  bidNo: ["bidno", "bidnumber"],
  qty: ["qty", "quantity"],
  price: ["price", "bidprice", "rate"],
  cutoff: ["cutoff", "iscutoff"],
} as const;

/** Orders in these states can no longer be changed. */
export function isFinalOrderStatus(status: string): boolean {
  return /cancel|reject|fail|allot|expire|refund|withdraw/i.test(status);
}

export interface IpoBidInput {
  /** "N" = new bid, "M" = modify an existing bid. */
  activityType: "N" | "M";
  bidNo: number;
  qty: number;
  price: number;
  cutoff: boolean;
}

export interface IpoOrderPayloadInput {
  userId: string;
  groupId: string;
  ipoCode: string;
  series: string;
  categoryCode: string;
  dpId: string;
  beneficiaryId: string;
  upiId: string;
  bids: IpoBidInput[];
  /** Both set => this is a modification of an existing order. */
  transactionNo?: string;
  referenceNo?: string;
}

/**
 * Body for POST /transactional/v1/ipo/orders (place AND modify) — field names
 * follow the Postman collection (BidMode, BeneficiaryId, BankId, Cutoff).
 * The API reference page spells a few differently (Bidmode, BenificiaryID,
 * BankID, CutOff); change them here, in one place, if the broker needs those.
 */
export function buildIpoOrderPayload(input: IpoOrderPayloadInput) {
  return {
    UserID: input.userId,
    GroupID: input.groupId || "HO",
    UCCClientID: "",
    UCCGroupID: "",
    BidMode: "N",
    IPOCode: input.ipoCode,
    Series: input.series || "EQ",
    AppCategoryCode: input.categoryCode,
    DPId: input.dpId,
    BeneficiaryId: input.beneficiaryId,
    PaymentMode: "UPI",
    UpiId: input.upiId,
    BankId: "",
    BankAccountNo: "",
    TransactionNo: input.transactionNo ?? "",
    ReferenceNo: input.referenceNo ?? "",
    Bids: input.bids.map((b) => ({
      ActivityType: b.activityType,
      Cutoff: b.cutoff,
      Price: b.price,
      BidNo: b.bidNo,
      Qty: b.qty,
    })),
  };
}

export const UPI_ID_PATTERN = /^[a-zA-Z0-9._-]{2,}@[a-zA-Z0-9.-]{2,}$/;

export interface BidDraft {
  lots: string;
  price: string;
  cutoff: boolean;
}

export interface BidRules {
  lotSize: number;
  minQty: number;
  priceMin: number;
  priceMax: number;
  maxLots: number | null;
  minAmount: number | null;
  /** Category cap on the bid amount (0 / missing = no cap). */
  maxAmount: number | null;
  /** Price increment (details TickSize); null = not enforced. */
  tickSize: number | null;
}

/** Smallest lot count that satisfies both the minimum quantity and the minimum amount. */
export function defaultLots(rules: BidRules, price: number): number {
  const byQty = Math.ceil(rules.minQty / rules.lotSize);
  const byAmount = rules.minAmount && price > 0 ? Math.ceil(rules.minAmount / (rules.lotSize * price)) : 1;
  return Math.max(1, byQty, byAmount);
}

/** Quantity and price a bid draft resolves to (cut-off bids use the top of the band). */
export function resolveBid(draft: BidDraft, rules: BidRules): { qty: number; price: number } {
  const lots = Math.floor(Number(draft.lots));
  const qty = Number.isFinite(lots) ? lots * rules.lotSize : 0;
  const price = draft.cutoff ? rules.priceMax : Number(draft.price);
  return { qty, price: Number.isFinite(price) ? price : 0 };
}

/** Returns an error message, or "" when the bid is acceptable. */
export function validateBid(draft: BidDraft, rules: BidRules): string {
  const lots = Number(draft.lots);
  if (!Number.isInteger(lots) || lots < 1) return "Enter the number of lots (a whole number, at least 1).";
  const { qty, price } = resolveBid(draft, rules);
  if (qty < rules.minQty) return `Minimum quantity is ${rules.minQty.toLocaleString("en-IN")}.`;
  if (rules.maxLots !== null && lots > rules.maxLots) return `Maximum ${rules.maxLots.toLocaleString("en-IN")} lots allowed for this category.`;
  if (!(price > 0)) return "Enter a bid price.";
  if (rules.priceMin > 0 && price < rules.priceMin) return `Price cannot be below ${formatRupees(rules.priceMin)}.`;
  if (rules.priceMax > 0 && price > rules.priceMax) return `Price cannot be above ${formatRupees(rules.priceMax)}.`;
  const fixed = rules.priceMin > 0 && rules.priceMin === rules.priceMax;
  if (rules.tickSize && rules.tickSize > 0 && !draft.cutoff && !fixed) {
    const steps = price / rules.tickSize;
    if (Math.abs(steps - Math.round(steps)) > 1e-6) return `Price must be in multiples of ${formatRupees(rules.tickSize)}.`;
  }
  if (rules.minAmount && qty * price < rules.minAmount) return `Minimum bid amount is ${formatRupees(rules.minAmount)}.`;
  if (rules.maxAmount && qty * price > rules.maxAmount) return `Maximum bid amount for this category is ${formatRupees(rules.maxAmount)}.`;
  return "";
}

/** Reads the existing bids off an order-book row (a Bids array, or one flattened bid). */
export function readOrderBids(row: Record<string, any>): { bidNo: number; qty: number; price: number; cutoff: boolean }[] {
  const nested = Object.entries(row).find(([key, value]) => /^bids?(list)?$/i.test(key) && Array.isArray(value))?.[1] as Record<string, any>[] | undefined;
  const source = nested && nested.length ? nested : [row];
  return source
    .map((bid, index) => ({
      bidNo: toNumber(pickField(bid, [...IPO_FIELD.bidNo])) ?? index + 1,
      qty: toNumber(pickField(bid, [...IPO_FIELD.qty])) ?? 0,
      price: toNumber(pickField(bid, [...IPO_FIELD.price])) ?? 0,
      cutoff: /^(true|1|y|yes)$/i.test(String(pickField(bid, [...IPO_FIELD.cutoff]) ?? "")),
    }))
    .filter((bid) => bid.qty > 0);
}

/** Best-effort demat details from the account's DP-details response. */
export function readDpOptions(rows: Record<string, any>[]): { dpId: string; beneficiaryId: string }[] {
  const seen = new Set<string>();
  const out: { dpId: string; beneficiaryId: string }[] = [];
  // The default demat account (profile `defaultDP`) comes first.
  const isDefault = (row: Record<string, any>) => /^(true|1|y|yes)$/i.test(String(pickField(row, ["defaultdp", "isdefault"]) ?? ""));
  const ordered = [...rows].sort((a, b) => Number(isDefault(b)) - Number(isDefault(a)));
  for (const row of ordered) {
    const beneficiaryId = pickText(row, [...IPO_FIELD.beneficiary]);
    let dpId = pickText(row, [...IPO_FIELD.dpId]);
    if (!dpId && beneficiaryId.length === 16) dpId = beneficiaryId.slice(0, 8); // 16-char BO ID = 8-char DP ID + 8-char client ID
    if (!dpId && !beneficiaryId) continue;
    const key = `${dpId}|${beneficiaryId}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ dpId, beneficiaryId });
    }
  }
  return out;
}

export function readUpiOptions(rows: Record<string, any>[]): string[] {
  return Array.from(new Set(rows.map((row) => pickText(row, [...IPO_FIELD.upi])).filter((v) => UPI_ID_PATTERN.test(v))));
}

/** Identity fields of an order-book row (used for Modify / Cancel). */
export function readOrderMeta(order: Record<string, any>) {
  return {
    ipoCode: pickText(order, [...IPO_FIELD.ipoCode]),
    name: pickText(order, ["offername", "ipoName", "companyname", "name"]),
    transactionNo: pickText(order, [...IPO_FIELD.transactionNo]),
    referenceNo: pickText(order, [...IPO_FIELD.referenceNo]),
    status: pickText(order, [...IPO_FIELD.status]),
  };
}
