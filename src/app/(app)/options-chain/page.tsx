"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Activity, BarChart3, Layers3, RefreshCw, Search, Target, SlidersHorizontal, Maximize2 } from "lucide-react";
import OrderTicketModal from "@/components/market/OrderTicketModal";
import { Badge, Button, Card, EmptyState, Input } from "@/components/ui/Primitives";
import { useMarketStream } from "@/hooks/useMarketStream";
import {
  exchangeSegmentFor,
  feedToken,
  instrumentDisplayName,
  normalizeInstrument,
  type Instrument,
} from "@/types/trading";

type ChainRow = { strike: number; ce?: Instrument; pe?: Instrument };
type ViewTab = "chain" | "greeks" | "strategy";

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function strikeValue(i: Instrument, _underlyingPrice = 0): number {
  const parsed = num(i.strikePrice);
  // SynapseWave option strike prices are returned in paisa.
  return parsed > 0 ? parsed / 100 : 0;
}

function expiryLabel(i?: Instrument): string {
  if (!i) return "";
  const date = num(i.expiryDate);
  if (Number.isInteger(date) && date >= 19000101 && date <= 21001231) {
    const year = Math.floor(date / 10000);
    const month = Math.floor((date % 10000) / 100);
    const day = date % 100;
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return `${String(day).padStart(2, "0")}-${months[month - 1]}-${year}`;
  }
  return i.expiryDateText?.trim() || (i.expiryDate ? String(i.expiryDate) : "");
}

function displayNumber(v: number, decimals = 2): string {
  if (!Number.isFinite(v) || v === 0) return "--";
  return v.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function compact(v: number): string {
  if (!Number.isFinite(v) || v === 0) return "--";
  const a = Math.abs(v);
  if (a >= 1e7) return `${(v / 1e7).toFixed(2)}Cr`;
  if (a >= 1e5) return `${(v / 1e5).toFixed(2)}L`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return Math.round(v).toLocaleString("en-IN");
}

function quoteFor(quotesByToken: Record<string, any>, instrument?: Instrument) {
  if (!instrument) return undefined;
  const key = feedToken(instrument);
  return key ? quotesByToken[key] : undefined;
}

function livePrice(quotesByToken: Record<string, any>, instrument?: Instrument): number {
  return num(quoteFor(quotesByToken, instrument)?.ltp);
}

function quoteValue(quotesByToken: Record<string, any>, instrument: Instrument | undefined, field: string): number {
  return num(quoteFor(quotesByToken, instrument)?.[field]);
}

const RISK_FREE = 0.065;
const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;
const MONTHS: Record<string, number> = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };

type Greeks = { iv: number; delta: number; gamma: number; theta: number; vega: number };
type GreeksModel =
  | { ok: false; reason: string }
  | { ok: true; forward: number; years: number; atmIv?: number; byStrike: Map<number, { ce?: Greeks; pe?: Greeks }> };

function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

function black76Price(isCall: boolean, f: number, k: number, t: number, sigma: number, r: number): number {
  const df = Math.exp(-r * t);
  const v = sigma * Math.sqrt(t);
  const d1 = (Math.log(f / k) + 0.5 * v * v) / v;
  const d2 = d1 - v;
  return isCall ? df * (f * normCdf(d1) - k * normCdf(d2)) : df * (k * normCdf(-d2) - f * normCdf(-d1));
}

function impliedVol(isCall: boolean, price: number, f: number, k: number, t: number, r: number): number | null {
  if (!(price > 0) || !(f > 0) || !(k > 0) || !(t > 0)) return null;
  const intrinsic = Math.exp(-r * t) * Math.max(isCall ? f - k : k - f, 0);
  if (price <= intrinsic + 0.01) return null;
  let lo = 0.01;
  let hi = 3;
  if (black76Price(isCall, f, k, t, hi, r) < price) return null;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (black76Price(isCall, f, k, t, mid, r) > price) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

function greeksFor(isCall: boolean, f: number, k: number, t: number, sigma: number, r: number): Greeks {
  const df = Math.exp(-r * t);
  const sq = Math.sqrt(t);
  const v = sigma * sq;
  const d1 = (Math.log(f / k) + 0.5 * v * v) / v;
  const pdf = normPdf(d1);
  const price = black76Price(isCall, f, k, t, sigma, r);
  return {
    iv: sigma * 100,
    delta: isCall ? df * normCdf(d1) : -df * normCdf(-d1),
    gamma: (df * pdf) / (f * v),
    theta: (r * price - (df * f * pdf * sigma) / (2 * sq)) / 365,
    vega: (df * f * pdf * sq) / 100,
  };
}

function expiryTimeMs(i?: Instrument): number {
  if (!i) return 0;
  const text = (i.expiryDateText ?? "").trim().toUpperCase();
  const m = text.match(/^(\d{1,2})[\s-]?([A-Z]{3})[\s-]?(\d{4})$/);
  if (m && m[2] in MONTHS) return Date.UTC(Number(m[3]), MONTHS[m[2]], Number(m[1]), 10, 0, 0);
  const n = num(i.expiryDate);
  if (n >= 19000101 && n <= 21001231) return Date.UTC(Math.floor(n / 10000), Math.floor((n % 10000) / 100) - 1, n % 100, 10, 0, 0);
  return 0;
}

type StrategyLeg = { id: number; contract: Instrument; side: "BUY" | "SELL"; lots: number; entry: number; autoEntry?: boolean };

function buildGreeksModel(rows: ChainRow[], atm: number, underlyingLtp: number, quotesByToken: Record<string, any>, expiryInstrument?: Instrument): GreeksModel {
  const expiryMs = expiryTimeMs(expiryInstrument);
  if (!expiryMs) return { ok: false, reason: "Expiry date couldn't be read for this contract." };
  const years = (expiryMs - Date.now()) / MS_PER_YEAR;
  if (years <= 0) return { ok: false, reason: "This expiry has already passed." };
  const atmRow = rows.find((r) => r.strike === atm);
  const atmCall = livePrice(quotesByToken, atmRow?.ce);
  const atmPut = livePrice(quotesByToken, atmRow?.pe);
  const forward = atm > 0 && atmCall > 0 && atmPut > 0
    ? atm + (atmCall - atmPut) * Math.exp(RISK_FREE * years)
    : underlyingLtp > 0 ? underlyingLtp * Math.exp(RISK_FREE * years) : 0;
  if (!(forward > 0)) return { ok: false, reason: "Waiting for live prices." };
  const byStrike = new Map<number, { ce?: Greeks; pe?: Greeks }>();
  for (const row of rows) {
    const k = row.strike;
    const ivCall = impliedVol(true, livePrice(quotesByToken, row.ce), forward, k, years, RISK_FREE);
    const ivPut = impliedVol(false, livePrice(quotesByToken, row.pe), forward, k, years, RISK_FREE);
    const sigma = k < forward ? (ivPut ?? ivCall) : (ivCall ?? ivPut);
    byStrike.set(k, sigma ? {
      ce: row.ce ? greeksFor(true, forward, k, years, sigma, RISK_FREE) : undefined,
      pe: row.pe ? greeksFor(false, forward, k, years, sigma, RISK_FREE) : undefined,
    } : {});
  }
  return { ok: true, forward, years, atmIv: byStrike.get(atm)?.ce?.iv, byStrike };
}

function money(v: number): string {
  if (!Number.isFinite(v)) return "--";
  const sign = v < 0 ? "-" : v > 0 ? "+" : "";
  return `${sign}₹${Math.abs(Math.round(v)).toLocaleString("en-IN")}`;
}

function inr(v: number): string {
  return Number.isFinite(v) ? `₹${Math.abs(Math.round(v)).toLocaleString("en-IN")}` : "--";
}

function shortMoney(v: number): string {
  if (Math.abs(v) < 1) return "0";
  return `${v < 0 ? "-" : ""}${compact(Math.abs(v))}`;
}

const STRATEGY_TEMPLATES: { name: string; legs: { type: "CE" | "PE"; side: "BUY" | "SELL"; off: number }[] }[] = [
  { name: "Long straddle", legs: [{ type: "CE", side: "BUY", off: 0 }, { type: "PE", side: "BUY", off: 0 }] },
  { name: "Short straddle", legs: [{ type: "CE", side: "SELL", off: 0 }, { type: "PE", side: "SELL", off: 0 }] },
  { name: "Long strangle", legs: [{ type: "CE", side: "BUY", off: 2 }, { type: "PE", side: "BUY", off: -2 }] },
  { name: "Short strangle", legs: [{ type: "CE", side: "SELL", off: 2 }, { type: "PE", side: "SELL", off: -2 }] },
  { name: "Bull call spread", legs: [{ type: "CE", side: "BUY", off: 0 }, { type: "CE", side: "SELL", off: 2 }] },
  { name: "Bear put spread", legs: [{ type: "PE", side: "BUY", off: 0 }, { type: "PE", side: "SELL", off: -2 }] },
  { name: "Iron condor", legs: [{ type: "PE", side: "BUY", off: -4 }, { type: "PE", side: "SELL", off: -2 }, { type: "CE", side: "SELL", off: 2 }, { type: "CE", side: "BUY", off: 4 }] },
  { name: "Iron butterfly", legs: [{ type: "PE", side: "BUY", off: -3 }, { type: "PE", side: "SELL", off: 0 }, { type: "CE", side: "SELL", off: 0 }, { type: "CE", side: "BUY", off: 3 }] },
];

export default function OptionsChainPage() {
  const [query, setQuery] = useState("NIFTY");
  const [searching, setSearching] = useState(false);
  const [contracts, setContracts] = useState<Instrument[]>([]);
  const [underlying, setUnderlying] = useState<Instrument | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState<number | string>("");
  const [range, setRange] = useState(7);
  const [error, setError] = useState("");
  const [orderInstrument, setOrderInstrument] = useState<Instrument | null>(null);
  const [orderSide, setOrderSide] = useState<"BUY" | "SELL">("BUY");
  const [orderPrice, setOrderPrice] = useState<number | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<ViewTab>("chain");
  const [legs, setLegs] = useState<StrategyLeg[]>([]);
  const [orderQueue, setOrderQueue] = useState<{ instrument: Instrument; side: "BUY" | "SELL"; price: number; lots: number }[]>([]);
  const [orderQuantity, setOrderQuantity] = useState<number | undefined>(undefined);
  const placedRef = useRef(false);

  const streamInstruments = useMemo(() => {
    const expiryContracts = contracts.filter((i) => String(i.expiryDate ?? "") === String(selectedExpiry));
    const rows = new Map<number, ChainRow>();
    for (const c of expiryContracts) {
      const strike = strikeValue(c);
      if (strike <= 0) continue;
      const row = rows.get(strike) ?? { strike };
      if ((c.optionType ?? "").toUpperCase() === "CE") row.ce = c;
      if ((c.optionType ?? "").toUpperCase() === "PE") row.pe = c;
      rows.set(strike, row);
    }
    const ordered = [...rows.values()].sort((a, b) => a.strike - b.strike);
    return [underlying, ...ordered.flatMap((r) => [r.ce, r.pe])].filter(Boolean) as Instrument[];
  }, [contracts, selectedExpiry, underlying]);

  const { quotesByToken, connected } = useMarketStream(streamInstruments, undefined, null, "option-chain");

  const expiries = useMemo(() => {
    const map = new Map<string, number | string>();
    for (const c of contracts) {
      if (c.expiryDate === undefined && !c.expiryDateText) continue;
      const key = String(c.expiryDate ?? c.expiryDateText ?? "");
      if (!map.has(key)) map.set(key, c.expiryDate ?? c.expiryDateText ?? "");
    }
    return [...map.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]))).map(([, v]) => v);
  }, [contracts]);

  const underlyingLtp = livePrice(quotesByToken, underlying ?? undefined);

  const allRows = useMemo<ChainRow[]>(() => {
    const map = new Map<number, ChainRow>();
    for (const c of contracts) {
      if (String(c.expiryDate ?? "") !== String(selectedExpiry)) continue;
      const strike = strikeValue(c, underlyingLtp);
      if (strike <= 0) continue;
      const row = map.get(strike) ?? { strike };
      if ((c.optionType ?? "").toUpperCase() === "CE") row.ce = c;
      if ((c.optionType ?? "").toUpperCase() === "PE") row.pe = c;
      map.set(strike, row);
    }
    return [...map.values()].sort((a, b) => a.strike - b.strike);
  }, [contracts, selectedExpiry, underlyingLtp]);

  const atm = useMemo(() => {
    if (!allRows.length) return 0;
    if (underlyingLtp > 0) {
      return allRows.reduce((best, row) => Math.abs(row.strike - underlyingLtp) < Math.abs(best.strike - underlyingLtp) ? row : best, allRows[0]).strike;
    }
    return allRows[Math.floor(allRows.length / 2)].strike;
  }, [allRows, underlyingLtp]);

  const rows = useMemo(() => {
    if (!allRows.length || !atm || range === 0) return allRows;
    const idx = allRows.findIndex((r) => r.strike === atm);
    if (idx < 0) return allRows;
    return allRows.slice(Math.max(0, idx - range), Math.min(allRows.length, idx + range + 1));
  }, [allRows, atm, range]);

  const visibleStats = useMemo(() => {
    let callOI = 0;
    let putOI = 0;
    let maxCall: ChainRow | undefined;
    let maxPut: ChainRow | undefined;
    for (const row of rows) {
      const ceOI = quoteValue(quotesByToken, row.ce, "open_interest");
      const peOI = quoteValue(quotesByToken, row.pe, "open_interest");
      callOI += ceOI;
      putOI += peOI;
      if (!maxCall || ceOI > quoteValue(quotesByToken, maxCall.ce, "open_interest")) maxCall = row;
      if (!maxPut || peOI > quoteValue(quotesByToken, maxPut.pe, "open_interest")) maxPut = row;
    }
    return { callOI, putOI, maxCall, maxPut };
  }, [rows, quotesByToken]);

  const loadChain = async (value = query) => {
    const clean = value.trim().toUpperCase();
    if (clean.length < 2) return;
    setSearching(true);
    setError("");
    try {
      const res = await fetch(`/api/broker/scrip-lookup?q=${encodeURIComponent(clean)}`, { credentials: "include" });
      const json = await res.json();
      if (!res.ok || json?.success === false) throw new Error(json?.message || "Unable to load option chain.");
      const hits = json?.data?.result?.hits?.hits ?? json?.data?.hits?.hits ?? json?.data?.hits ?? [];
      const instruments = (Array.isArray(hits) ? hits : []).map((h: unknown) => normalizeInstrument(h as Record<string, any>));
      const optionContracts = instruments
        .filter((i) => {
          const option = (i.optionType ?? "").toUpperCase();
          const name = (i.instrumentName ?? "").toUpperCase();
          const root = (i.symbol || "").trim().toUpperCase();
          const trading = (i.tradingSymbol || "").trim().toUpperCase();
          const desc = (i.derivativeDesc || "").toUpperCase();
          return (option === "CE" || option === "PE" || name.startsWith("OPT")) &&
            (root === clean || trading.startsWith(`${clean} `) || trading.startsWith(`${clean}26`) || desc.includes(clean));
        })
        .sort((a, b) => (a.expiryDate ?? 0) - (b.expiryDate ?? 0) || strikeValue(a) - strikeValue(b));
      const underlyingMatch = instruments.find((i) =>
        (i.symbol || "").trim().toUpperCase() === clean &&
        !["CE", "PE"].includes((i.optionType ?? "").toUpperCase()) &&
        !["FUTIDX", "FUTSTK", "OPTIDX", "OPTSTK"].includes((i.instrumentName ?? "").toUpperCase())
      );
      const nextExpiries = [...new Set(optionContracts.map((i) => i.expiryDate).filter((x): x is number => Boolean(x)))].sort((a, b) => a - b);
      setContracts(optionContracts);
      setUnderlying(underlyingMatch ?? null);
      setSelectedExpiry(nextExpiries[0] ?? optionContracts[0]?.expiryDate ?? "");
      if (!optionContracts.length) setError(`No option contracts found for ${clean}.`);
    } catch (e) {
      setContracts([]);
      setUnderlying(null);
      setSelectedExpiry("");
      setError(e instanceof Error ? e.message : "Unable to load option chain.");
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => { void loadChain("NIFTY"); }, []);

  useEffect(() => { setLegs([]); }, [underlying?.symbol]);

  useEffect(() => {
    if (!allRows.length) return;
    setLegs((prev) => {
      if (!prev.length) return prev;
      let changed = false;
      const next: StrategyLeg[] = [];
      for (const leg of prev) {
        if (String(leg.contract.expiryDate ?? "") === String(selectedExpiry)) { next.push(leg); continue; }
        changed = true;
        const strike = strikeValue(leg.contract, underlyingLtp);
        const isCall = (leg.contract.optionType ?? "").toUpperCase() === "CE";
        const candidates = allRows.filter((r) => (isCall ? r.ce : r.pe));
        if (!candidates.length) continue;
        const row = candidates.find((r) => r.strike === strike) ?? candidates.reduce((best, r) => (Math.abs(r.strike - strike) < Math.abs(best.strike - strike) ? r : best), candidates[0]);
        next.push({ ...leg, contract: (isCall ? row.ce : row.pe) as Instrument, entry: 0, autoEntry: true });
      }
      return changed ? next : prev;
    });
  }, [selectedExpiry, allRows]);

  useEffect(() => {
    if (!legs.some((l) => l.autoEntry)) return;
    let changed = false;
    const next = legs.map((l) => {
      if (!l.autoEntry) return l;
      const q = quoteFor(quotesByToken, l.contract) ?? {};
      const px = l.side === "BUY" ? num(q.ask_price) : num(q.bid_price);
      const price = px > 0 ? px : num(q.ltp);
      if (price > 0) { changed = true; return { ...l, entry: price, autoEntry: false }; }
      return l;
    });
    if (changed) setLegs(next);
  }, [quotesByToken, legs]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = scrollRef.current;
    const target = box?.querySelector<HTMLElement>('[data-atm="true"]');
    if (!box || !target) return;
    box.scrollTop = Math.max(0, target.offsetTop - box.clientHeight / 2 + target.clientHeight / 2);
  }, [selectedExpiry, range, atm, rows.length, activeTab]);

  const underlyingChange = quoteValue(quotesByToken, underlying ?? undefined, "change_percent");

  const openOrder = (instrument: Instrument, side: "BUY" | "SELL", price: number, lots?: number) => {
    placedRef.current = false;
    setOrderInstrument(instrument);
    setOrderSide(side);
    setOrderPrice(price > 0 ? price : undefined);
    setOrderQuantity(lots && lots > 0 ? lots : undefined);
  };

  // Called when the ticket closes. If it closed without an order being placed
  // (Cancel / X / backdrop), any queued strategy legs are dropped.
  const closeOrder = () => {
    if (!placedRef.current) setOrderQueue([]);
    setOrderInstrument(null);
  };

  // Called when the "Order placed" popup is dismissed: continue with the next queued leg.
  const continueQueue = () => {
    placedRef.current = false;
    if (orderQueue.length === 0) return;
    const [next, ...rest] = orderQueue;
    setOrderQueue(rest);
    openOrder(next.instrument, next.side, next.price, next.lots);
  };

  const tradeAll = (list: { instrument: Instrument; side: "BUY" | "SELL"; price: number; lots: number }[]) => {
    if (!list.length) return;
    const [first, ...rest] = [...list].sort((a, b) => (a.side === b.side ? 0 : a.side === "BUY" ? -1 : 1));
    setOrderQueue(rest);
    openOrder(first.instrument, first.side, first.price, first.lots);
  };

  return (
    <div className="space-y-2">
      <Card className="overflow-hidden !p-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-1.5">
          <div className="flex items-center gap-2">
            <div className="relative w-[260px]">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-aveon-muted" />
              <Input className="!h-9 !py-0 pl-9" value={query} onChange={(e) => setQuery(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === "Enter") void loadChain(); }} placeholder="Search underlying — NIFTY, BANKNIFTY, RELIANCE" />
            </div>
            <Button className="!h-9 !py-0" onClick={() => void loadChain()} disabled={searching}>{searching ? "Loading…" : "Load Chain"}</Button>
          </div>

          {underlying && contracts.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <div className="flex items-center gap-2"><span className="text-sm font-bold">{instrumentDisplayName(underlying)}</span><Badge>{exchangeSegmentFor(underlying)}</Badge></div>
              <div className="flex items-baseline gap-2">
                <span className={`text-xl font-semibold tracking-tight tabular-nums ${underlyingChange > 0 ? "text-aveon-buy" : underlyingChange < 0 ? "text-aveon-sell" : "text-aveon-text"}`}>₹{displayNumber(underlyingLtp)}</span>
                <span className={`text-[13px] font-medium tabular-nums ${underlyingChange >= 0 ? "text-aveon-buy" : "text-aveon-sell"}`}>{underlyingChange ? `${underlyingChange >= 0 ? "+" : ""}${underlyingChange.toFixed(2)}%` : "--"}</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-md border border-aveon-border bg-aveon-panel2 px-2.5 py-1"><Target size={14} className="text-aveon-primary" /><span className="text-[11px] uppercase tracking-wide text-aveon-muted">ATM</span><span className="text-[13px] font-semibold tabular-nums">{atm ? displayNumber(atm, 0) : "--"}</span></div>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${connected ? "bg-aveon-buy/10 text-aveon-buy" : "bg-aveon-panel2 text-aveon-muted"}`}>
              {connected ? "● LIVE" : "○ CONNECTING"}
            </span>
            <Button variant="ghost" className="!h-9 !px-2 !py-0" onClick={() => void loadChain()} disabled={searching}><RefreshCw size={14} /></Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-aveon-border bg-aveon-panel2">
          <div className="flex">
            <WorkspaceTab active={activeTab === "chain"} icon={<Activity size={14} />} label="Option Chain" onClick={() => setActiveTab("chain")} />
            <WorkspaceTab active={activeTab === "greeks"} icon={<BarChart3 size={14} />} label="Greeks" onClick={() => setActiveTab("greeks")} />
            <WorkspaceTab active={activeTab === "strategy"} icon={<Layers3 size={14} />} label="Strategy & Payoff" onClick={() => setActiveTab("strategy")} />
          </div>
          {expiries.length > 0 && <div className="flex gap-1.5 overflow-x-auto px-3 py-1.5">{expiries.map((expiry) => <button key={String(expiry)} onClick={() => setSelectedExpiry(expiry)} className={`shrink-0 rounded-md border px-3 py-1 text-xs font-semibold ${String(selectedExpiry) === String(expiry) ? "border-aveon-primary bg-aveon-primary/15 text-aveon-primary" : "border-aveon-border text-aveon-muted hover:bg-aveon-panel"}`}>{expiryLabel(contracts.find((c) => String(c.expiryDate ?? "") === String(expiry)))}</button>)}</div>}
        </div>
      </Card>

      {activeTab === "chain" && rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-aveon-border bg-aveon-panel">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-aveon-border px-3 py-1.5">
            <div className="flex items-center gap-3">
              <div className="text-[13px] font-semibold">{underlying?.symbol ?? query}</div>
              <span className="text-xs text-aveon-muted">{rows.length} strikes</span>
              <span className="h-3 w-px bg-aveon-border" />
              <span className="text-xs text-aveon-muted">PCR <b className="text-aveon-text">{visibleStats.callOI > 0 ? (visibleStats.putOI / visibleStats.callOI).toFixed(2) : "--"}</b></span>
              <span className="h-3 w-px bg-aveon-border" />
              <span className="text-xs text-aveon-muted">Call OI <b className="text-aveon-text">{compact(visibleStats.callOI)}</b></span>
              <span className="text-xs text-aveon-muted">Put OI <b className="text-aveon-text">{compact(visibleStats.putOI)}</b></span>
              <span className="text-xs text-aveon-muted">Max Call OI <b className="text-aveon-text">{visibleStats.maxCall ? displayNumber(visibleStats.maxCall.strike, 0) : "--"}</b></span>
              <span className="text-xs text-aveon-muted">Max Put OI <b className="text-aveon-text">{visibleStats.maxPut ? displayNumber(visibleStats.maxPut.strike, 0) : "--"}</b></span>
            </div>
            <div className="flex items-center gap-1">
              {[5, 10, 15, 25, 50, 0].map((value) => (
                <button key={value} type="button" onClick={() => setRange(value)} className={`rounded px-2 py-1 text-xs font-semibold ${range === value ? "bg-aveon-primary/15 text-aveon-primary" : "text-aveon-muted hover:bg-aveon-panel2 hover:text-aveon-text"}`}>
                  {value === 0 ? "ALL" : `±${value}`}
                </button>
              ))}
              <button type="button" className="ml-1 rounded p-1.5 text-aveon-muted hover:bg-aveon-panel2 hover:text-aveon-text" title="Column settings"><SlidersHorizontal size={15} /></button>
              <button type="button" className="rounded p-1.5 text-aveon-muted hover:bg-aveon-panel2 hover:text-aveon-text" title="Fullscreen"><Maximize2 size={15} /></button>
            </div>
          </div>

          <div ref={scrollRef} className="relative max-h-[calc(100vh-230px)] min-h-[320px] overflow-auto">
            <div className="min-w-[1240px]">
              <div className="sticky top-0 z-10 bg-aveon-panel">
                <div className={`grid ${CHAIN_GRID} border-b border-aveon-border bg-aveon-panel2/70 text-[11px] font-semibold uppercase tracking-wide`}>
                  <div className="px-3 py-1.5 text-center text-aveon-primary">Calls / CE</div>
                  <div className="border-x border-aveon-border px-2 py-1.5 text-center text-aveon-muted">Strike</div>
                  <div className="px-3 py-1.5 text-center text-[#F5A524]">Puts / PE</div>
                </div>
                <div className={`grid ${CHAIN_GRID} border-b border-aveon-border bg-aveon-panel2 text-[11px] font-medium uppercase tracking-wide text-aveon-muted`}>
                  <QuoteHeader side="CE" />
                  <div className="flex items-center justify-center border-x border-aveon-border px-1 py-1.5">Price</div>
                  <QuoteHeader side="PE" />
                </div>
              </div>
              <div>
                {rows.map((row, i) => (
                  <Fragment key={row.strike}>
                    <ChainRowView row={row} isAtm={row.strike === atm} underlyingLtp={underlyingLtp} quotesByToken={quotesByToken} onOrder={openOrder} maxCallOI={visibleStats.callOI} maxPutOI={visibleStats.putOI} />
                    {underlyingLtp > 0 && row.strike <= underlyingLtp && (rows[i + 1]?.strike ?? Infinity) > underlyingLtp && rows[i + 1] && (
                      <div className="flex items-center" aria-label="Spot price marker">
                        <span className="h-px flex-1 bg-aveon-primary/70" />
                        <span className="rounded-full bg-aveon-primary px-2 py-px text-[11px] font-semibold tabular-nums text-white">Spot {displayNumber(underlyingLtp)}</span>
                        <span className="h-px flex-1 bg-aveon-primary/70" />
                      </div>
                    )}
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end border-t border-aveon-border px-3 py-1.5 text-xs text-aveon-muted">
            <span>Click Bid to SELL · Ask to BUY · Hover a row for contract, lot and volume</span>
          </div>
        </div>
      )}

      {activeTab === "greeks" && rows.length > 0 && (
        <GreeksTable rows={rows} atm={atm} underlyingLtp={underlyingLtp} quotesByToken={quotesByToken} symbol={underlying?.symbol ?? query} expiryInstrument={contracts.find((c) => String(c.expiryDate ?? "") === String(selectedExpiry))} range={range} setRange={setRange} scrollRef={scrollRef} />
      )}

      {activeTab === "strategy" && allRows.length > 0 && (
        <StrategyView legs={legs} setLegs={setLegs} allRows={allRows} atm={atm} underlyingLtp={underlyingLtp} quotesByToken={quotesByToken} expiryInstrument={contracts.find((c) => String(c.expiryDate ?? "") === String(selectedExpiry))} onOrder={openOrder} onTradeAll={tradeAll} />
      )}

      {error ? <Card><EmptyState title="Option Chain" subtitle={error} /></Card> : !searching && !rows.length ? <Card><EmptyState title="Search an underlying" subtitle="Enter NIFTY, BANKNIFTY or an F&O-enabled symbol to load its option chain." /></Card> : null}

      <OrderTicketModal
        open={Boolean(orderInstrument)}
        instrument={orderInstrument}
        onClose={closeOrder}
        onOrderPlaced={() => { placedRef.current = true; }}
        onSuccessClose={continueQueue}
        initialQuantity={orderQuantity}
        initialSide={orderSide}
        initialPrice={orderPrice}
        quotes={quotesByToken}
      />
    </div>
  );
}

const CHAIN_GRID = "grid-cols-[minmax(560px,1fr)_88px_minmax(560px,1fr)]";
const QUOTE_GRID = "grid-cols-[1fr_1.1fr_0.85fr_1.35fr_0.95fr_1.1fr_1.1fr_0.95fr]";

function WorkspaceTab({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`flex items-center gap-2 border-b-2 px-4 py-2 text-[13px] font-semibold transition ${active ? "border-aveon-primary text-aveon-primary" : "border-transparent text-aveon-muted hover:bg-aveon-panel hover:text-aveon-text"}`}>{icon}{label}</button>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <Card className="p-2.5"><div className="text-[9px] uppercase tracking-wide text-aveon-muted">{label}</div><div className="mt-0.5 text-sm font-semibold">{value}</div></Card>;
}

function QuoteHeader({ side }: { side: "CE" | "PE" }) {
  const labels = ["OI", "LTP", "LTQ", "Chg%", "Bid Qty", "Bid", "Ask", "Ask Qty"];
  return <div className={`grid ${QUOTE_GRID} items-center px-2 py-1.5 text-right`}>{labels.map((label) => <span key={`${side}-${label}`} className="pr-2 leading-tight">{label}</span>)}</div>;
}

function ChainRowView({ row, isAtm, underlyingLtp, quotesByToken, onOrder, maxCallOI, maxPutOI }: { row: ChainRow; isAtm: boolean; underlyingLtp: number; quotesByToken: Record<string, any>; onOrder: (i: Instrument, side: "BUY" | "SELL", price: number) => void; maxCallOI: number; maxPutOI: number }) {
  return <div data-atm={isAtm ? "true" : undefined} className={`grid ${CHAIN_GRID} border-b border-aveon-border/60 transition-colors hover:bg-aveon-panel2/35 ${isAtm ? "bg-aveon-primary/10" : ""}`}>
    <ContractCell contract={row.ce} side="CE" itm={underlyingLtp > 0 && row.strike < underlyingLtp} quotesByToken={quotesByToken} onOrder={onOrder} maxOI={maxCallOI} />
    <div title={isAtm ? "At the money" : undefined} className={`flex h-[34px] items-center justify-center border-x border-aveon-border/70 bg-aveon-panel2/60 px-1 ${isAtm ? "!bg-aveon-primary/20" : ""}`}><span className={`text-sm font-semibold tabular-nums ${isAtm ? "text-aveon-primary" : "text-aveon-text"}`}>{row.strike.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span></div>
    <ContractCell contract={row.pe} side="PE" itm={underlyingLtp > 0 && row.strike > underlyingLtp} quotesByToken={quotesByToken} onOrder={onOrder} maxOI={maxPutOI} />
  </div>;
}

function ContractCell({ contract, side, itm, quotesByToken, onOrder, maxOI }: { contract?: Instrument; side: "CE" | "PE"; itm: boolean; quotesByToken: Record<string, any>; onOrder: (i: Instrument, side: "BUY" | "SELL", price: number) => void; maxOI: number }) {
  if (!contract) return <div className="flex h-[34px] items-center justify-center text-xs text-aveon-muted">--</div>;
  const q = quoteFor(quotesByToken, contract) ?? {};
  const ltp = num(q.ltp), ltq = num(q.ltq), change = num(q.change_percent);
  const bid = num(q.bid_price), bidQty = num(q.bid_qty), ask = num(q.ask_price), askQty = num(q.ask_qty), oi = num(q.open_interest);
  const volume = num(q.volume);
  const changeClass = change >= 0 ? "text-aveon-buy" : "text-aveon-sell";
  const itmTint = itm ? (side === "CE" ? "bg-aveon-primary/[0.07]" : "bg-[#F5A524]/[0.07]") : "";
  const detail = `${contract.tradingSymbol || instrumentDisplayName(contract)} · ${side} ${itm ? "ITM" : "OTM"} · Lot ${contract.regularLot ?? "--"} · Vol ${volume ? compact(volume) : "--"}`;

  const priceButton = (price: number, action: "BUY" | "SELL") => (
    <button type="button" disabled={price <= 0} title={`${action} ${contract.tradingSymbol || contract.symbol} @ ₹${price > 0 ? price.toFixed(2) : "--"}`} onClick={() => onOrder(contract, action, price)} className={`rounded px-1.5 py-1 text-right text-[13px] font-medium tabular-nums transition ${action === "BUY" ? "text-aveon-buy hover:bg-aveon-buy/15" : "text-aveon-sell hover:bg-aveon-sell/15"}`}>
      {displayNumber(price)}
    </button>
  );

  return <div title={detail} className={`grid ${QUOTE_GRID} h-[34px] items-center px-2 ${itmTint}`}>
    <div className="relative flex h-full items-center justify-end pr-2"><div className={`absolute inset-y-1.5 left-0 rounded-sm ${side === "CE" ? "bg-aveon-primary/25" : "bg-[#F5A524]/25"}`} style={{ width: `${Math.min(100, Math.max(0, maxOI > 0 ? (oi / maxOI) * 100 : 0))}%` }} /><span className="relative text-[13px] font-medium tabular-nums">{oi ? compact(oi) : "--"}</span></div>
    <div className={`pr-2 text-right text-sm font-semibold tabular-nums ${change > 0 ? "text-aveon-buy" : change < 0 ? "text-aveon-sell" : "text-aveon-text"}`}>{displayNumber(ltp)}</div>
    <span className="pr-2 text-right text-xs tabular-nums text-aveon-muted">{ltq ? compact(ltq) : "--"}</span>
    <span className={`pr-2 text-right text-[13px] font-medium tabular-nums ${changeClass}`}>{change ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "--"}</span>
    <span className="pr-2 text-right text-xs tabular-nums text-aveon-muted">{bidQty ? compact(bidQty) : "--"}</span>
    {priceButton(bid, "SELL")}
    {priceButton(ask, "BUY")}
    <span className="pr-2 text-right text-xs tabular-nums text-aveon-muted">{askQty ? compact(askQty) : "--"}</span>
  </div>;
}

const GREEKS_GRID = "grid-cols-[minmax(440px,1fr)_88px_minmax(440px,1fr)]";
const GREEKS_SIDE = "grid-cols-[1.2fr_1fr_1fr_1.1fr_1fr_1fr]";

function GreeksTable({ rows, atm, underlyingLtp, quotesByToken, symbol, expiryInstrument, range, setRange, scrollRef }: { rows: ChainRow[]; atm: number; underlyingLtp: number; quotesByToken: Record<string, any>; symbol: string; expiryInstrument?: Instrument; range: number; setRange: (v: number) => void; scrollRef: React.Ref<HTMLDivElement> }) {
  const model = useMemo<GreeksModel>(() => buildGreeksModel(rows, atm, underlyingLtp, quotesByToken, expiryInstrument), [rows, atm, underlyingLtp, quotesByToken, expiryInstrument]);

  const labels = ["LTP", "IV %", "Delta", "Gamma", "Theta", "Vega"];
  const header = (side: "CE" | "PE") => <div className={`grid ${GREEKS_SIDE} items-center px-2 py-1.5 text-right`}>{labels.map((label) => <span key={`${side}-${label}`} className="pr-2 leading-tight">{label}</span>)}</div>;

  return (
    <div className="overflow-hidden rounded-xl border border-aveon-border bg-aveon-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-aveon-border px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-[13px] font-semibold">{symbol}</div>
          <span className="text-xs text-aveon-muted">{rows.length} strikes</span>
          <span className="h-3 w-px bg-aveon-border" />
          <span className="text-xs text-aveon-muted">Synthetic future <b className="text-aveon-text">{model.ok ? displayNumber(model.forward) : "--"}</b></span>
          <span className="text-xs text-aveon-muted">DTE <b className="text-aveon-text">{model.ok ? (model.years * 365).toFixed(1) : "--"}</b></span>
          <span className="text-xs text-aveon-muted">ATM IV <b className="text-aveon-text">{model.ok && model.atmIv ? `${model.atmIv.toFixed(2)}%` : "--"}</b></span>
        </div>
        <div className="flex items-center gap-1">
          {[5, 10, 15, 25, 50, 0].map((value) => (
            <button key={value} type="button" onClick={() => setRange(value)} className={`rounded px-2 py-1 text-xs font-semibold ${range === value ? "bg-aveon-primary/15 text-aveon-primary" : "text-aveon-muted hover:bg-aveon-panel2 hover:text-aveon-text"}`}>
              {value === 0 ? "ALL" : `±${value}`}
            </button>
          ))}
        </div>
      </div>

      {!model.ok && <div className="border-b border-aveon-border bg-aveon-panel2/50 px-3 py-2 text-xs text-aveon-muted">{model.reason}</div>}

      <div ref={scrollRef} className="relative max-h-[calc(100vh-230px)] min-h-[320px] overflow-auto">
        <div className="min-w-[1000px]">
          <div className="sticky top-0 z-10 bg-aveon-panel">
            <div className={`grid ${GREEKS_GRID} border-b border-aveon-border bg-aveon-panel2/70 text-[11px] font-semibold uppercase tracking-wide`}>
              <div className="px-3 py-1.5 text-center text-aveon-primary">Calls / CE</div>
              <div className="border-x border-aveon-border px-2 py-1.5 text-center text-aveon-muted">Strike</div>
              <div className="px-3 py-1.5 text-center text-[#F5A524]">Puts / PE</div>
            </div>
            <div className={`grid ${GREEKS_GRID} border-b border-aveon-border bg-aveon-panel2 text-[11px] font-medium uppercase tracking-wide text-aveon-muted`}>
              {header("CE")}
              <div className="flex items-center justify-center border-x border-aveon-border px-1 py-1.5">Price</div>
              {header("PE")}
            </div>
          </div>
          <div>
            {rows.map((row, i) => {
              const isAtm = row.strike === atm;
              const g = model.ok ? model.byStrike.get(row.strike) : undefined;
              return (
                <Fragment key={row.strike}>
                  <div data-atm={isAtm ? "true" : undefined} className={`grid ${GREEKS_GRID} border-b border-aveon-border/60 transition-colors hover:bg-aveon-panel2/35 ${isAtm ? "bg-aveon-primary/10" : ""}`}>
                    <GreeksCells contract={row.ce} side="CE" greeks={g?.ce} itm={underlyingLtp > 0 && row.strike < underlyingLtp} quotesByToken={quotesByToken} />
                    <div title={isAtm ? "At the money" : undefined} className={`flex h-[34px] items-center justify-center border-x border-aveon-border/70 bg-aveon-panel2/60 px-1 ${isAtm ? "!bg-aveon-primary/20" : ""}`}><span className={`text-sm font-semibold tabular-nums ${isAtm ? "text-aveon-primary" : "text-aveon-text"}`}>{row.strike.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span></div>
                    <GreeksCells contract={row.pe} side="PE" greeks={g?.pe} itm={underlyingLtp > 0 && row.strike > underlyingLtp} quotesByToken={quotesByToken} />
                  </div>
                  {underlyingLtp > 0 && row.strike <= underlyingLtp && (rows[i + 1]?.strike ?? Infinity) > underlyingLtp && rows[i + 1] && (
                    <div className="flex items-center" aria-label="Spot price marker">
                      <span className="h-px flex-1 bg-aveon-primary/70" />
                      <span className="rounded-full bg-aveon-primary px-2 py-px text-[11px] font-semibold tabular-nums text-white">Spot {displayNumber(underlyingLtp)}</span>
                      <span className="h-px flex-1 bg-aveon-primary/70" />
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-aveon-border px-3 py-1.5 text-xs text-aveon-muted">
        <span>Black-76 model · risk-free rate {(RISK_FREE * 100).toFixed(1)}% · IV taken from the OTM option at each strike</span>
        <span>Theta in ₹ per day · Vega per 1% change in IV</span>
      </div>
    </div>
  );
}

function GreeksCells({ contract, side, greeks, itm, quotesByToken }: { contract?: Instrument; side: "CE" | "PE"; greeks?: Greeks; itm: boolean; quotesByToken: Record<string, any> }) {
  if (!contract) return <div className="flex h-[34px] items-center justify-center text-xs text-aveon-muted">--</div>;
  const q = quoteFor(quotesByToken, contract) ?? {};
  const ltp = num(q.ltp), change = num(q.change_percent);
  const itmTint = itm ? (side === "CE" ? "bg-aveon-primary/[0.07]" : "bg-[#F5A524]/[0.07]") : "";
  const fixed = (v: number | undefined, d: number) => (v === undefined || !Number.isFinite(v) ? "--" : v.toFixed(d));
  return <div title={contract.tradingSymbol || instrumentDisplayName(contract)} className={`grid ${GREEKS_SIDE} h-[34px] items-center px-2 ${itmTint}`}>
    <div className={`pr-2 text-right text-sm font-semibold tabular-nums ${change > 0 ? "text-aveon-buy" : change < 0 ? "text-aveon-sell" : "text-aveon-text"}`}>{displayNumber(ltp)}</div>
    <span className="pr-2 text-right text-[13px] font-medium tabular-nums">{fixed(greeks?.iv, 2)}</span>
    <span className="pr-2 text-right text-[13px] font-medium tabular-nums">{fixed(greeks?.delta, 3)}</span>
    <span className="pr-2 text-right text-xs tabular-nums text-aveon-muted">{fixed(greeks?.gamma, 4)}</span>
    <span className="pr-2 text-right text-[13px] tabular-nums text-aveon-sell">{fixed(greeks?.theta, 2)}</span>
    <span className="pr-2 text-right text-xs tabular-nums text-aveon-muted">{fixed(greeks?.vega, 2)}</span>
  </div>;
}

const FIELD = "h-8 rounded-md border border-aveon-border bg-aveon-panel2 px-2 text-[13px] text-aveon-text outline-none focus:border-aveon-primary";

function Stat({ label, value, tone }: { label: string; value: string; tone?: "buy" | "sell" }) {
  return <div className="min-w-0 rounded-lg border border-aveon-border bg-aveon-panel2/60 px-2.5 py-1.5"><div className="truncate text-[11px] uppercase tracking-wide text-aveon-muted">{label}</div><div className={`truncate text-sm font-semibold tabular-nums ${tone === "buy" ? "text-aveon-buy" : tone === "sell" ? "text-aveon-sell" : "text-aveon-text"}`}>{value}</div></div>;
}

function StrategyView({ legs, setLegs, allRows, atm, underlyingLtp, quotesByToken, expiryInstrument, onOrder, onTradeAll }: { legs: StrategyLeg[]; setLegs: React.Dispatch<React.SetStateAction<StrategyLeg[]>>; allRows: ChainRow[]; atm: number; underlyingLtp: number; quotesByToken: Record<string, any>; expiryInstrument?: Instrument; onOrder: (i: Instrument, side: "BUY" | "SELL", price: number, lots?: number) => void; onTradeAll: (list: { instrument: Instrument; side: "BUY" | "SELL"; price: number; lots: number }[]) => void }) {
  const model = useMemo<GreeksModel>(() => buildGreeksModel(allRows, atm, underlyingLtp, quotesByToken, expiryInstrument), [allRows, atm, underlyingLtp, quotesByToken, expiryInstrument]);
  const [addSide, setAddSide] = useState<"BUY" | "SELL">("BUY");
  const [addType, setAddType] = useState<"CE" | "PE">("CE");
  const [addStrike, setAddStrike] = useState(0);
  const [addLots, setAddLots] = useState(1);
  const [days, setDays] = useState(0);
  const [ivShift, setIvShift] = useState(0);
  const [hoverS, setHoverS] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [confirmAll, setConfirmAll] = useState(false);

  const entryPrice = (contract: Instrument, side: "BUY" | "SELL"): number => {
    const q = quoteFor(quotesByToken, contract) ?? {};
    const px = side === "BUY" ? num(q.ask_price) : num(q.bid_price);
    return px > 0 ? px : num(q.ltp);
  };

  const addLeg = () => {
    const strike = addStrike || atm;
    const row = allRows.find((r) => r.strike === strike);
    const contract = addType === "CE" ? row?.ce : row?.pe;
    if (!contract) { setMsg("That contract isn't available."); return; }
    setMsg("");
    setLegs((prev) => [...prev, { id: Date.now() * 100 + prev.length, contract, side: addSide, lots: addLots, entry: entryPrice(contract, addSide) }]);
  };

  const applyTemplate = (t: (typeof STRATEGY_TEMPLATES)[number]) => {
    const idx = allRows.findIndex((r) => r.strike === atm);
    if (idx < 0) return;
    const next: StrategyLeg[] = [];
    for (let i = 0; i < t.legs.length; i++) {
      const l = t.legs[i];
      const row = allRows[idx + l.off];
      const contract = l.type === "CE" ? row?.ce : row?.pe;
      if (!contract) { setMsg(`${t.name} needs strikes that aren't in this chain.`); return; }
      next.push({ id: Date.now() * 100 + i, contract, side: l.side, lots: 1, entry: entryPrice(contract, l.side) });
    }
    setMsg("");
    setLegs(next);
  };

  const patchLeg = (id: number, patch: Partial<StrategyLeg>) => setLegs((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const changeLeg = (leg: StrategyLeg, strike: number, isCall: boolean) => {
    const row = allRows.find((r) => r.strike === strike);
    const contract = isCall ? row?.ce : row?.pe;
    if (!contract) { setMsg(`${strike.toLocaleString("en-IN")} ${isCall ? "CE" : "PE"} isn't available.`); return; }
    setMsg("");
    patchLeg(leg.id, { contract, entry: entryPrice(contract, leg.side) });
  };

  const flipLeg = (leg: StrategyLeg) => {
    const side = leg.side === "BUY" ? "SELL" : "BUY";
    patchLeg(leg.id, { side, entry: entryPrice(leg.contract, side) });
  };

  const tradeAllLegs = () => {
    setConfirmAll(false);
    onTradeAll(legs.map((l) => ({ instrument: l.contract, side: l.side, price: entryPrice(l.contract, l.side), lots: l.lots })));
  };

  const info = legs.map((leg) => {
    const isCall = (leg.contract.optionType ?? "").toUpperCase() === "CE";
    const strike = strikeValue(leg.contract, underlyingLtp);
    const lotSize = num(leg.contract.regularLot) || 1;
    return {
      leg, isCall, strike, lotSize,
      qty: leg.lots * lotSize,
      sign: leg.side === "BUY" ? 1 : -1,
      ltp: livePrice(quotesByToken, leg.contract),
      greeks: model.ok ? model.byStrike.get(strike)?.[isCall ? "ce" : "pe"] : undefined,
    };
  });

  const intrinsic = (isCall: boolean, strike: number, s: number) => (isCall ? Math.max(s - strike, 0) : Math.max(strike - s, 0));
  const expiryPnl = (s: number) => info.reduce((a, l) => a + l.sign * l.qty * (intrinsic(l.isCall, l.strike, s) - l.leg.entry), 0);

  const years = model.ok ? model.years : 0;
  const maxDays = Math.max(0, Math.floor(years * 365));
  const dShift = Math.min(days, maxDays);
  const targetYears = Math.max(0, years - dShift / 365);
  const fwdRatio = model.ok && underlyingLtp > 0 ? model.forward / underlyingLtp : 1;
  const atmSigma = model.ok && model.atmIv ? model.atmIv / 100 : 0;
  const targetPnl = (s: number): number | null => {
    if (!model.ok) return null;
    let total = 0;
    for (const l of info) {
      let value: number;
      if (targetYears <= 1e-6) value = intrinsic(l.isCall, l.strike, s);
      else {
        const sigma = (l.greeks ? l.greeks.iv / 100 : atmSigma) + ivShift / 100;
        if (!(sigma > 0.005)) return null;
        value = black76Price(l.isCall, s * fwdRatio, l.strike, targetYears, sigma, RISK_FREE);
      }
      total += l.sign * l.qty * (value - l.leg.entry);
    }
    return total;
  };

  const strikes = [...new Set(info.map((l) => l.strike))].sort((a, b) => a - b);
  const upSlope = info.filter((l) => l.isCall).reduce((a, l) => a + l.sign * l.qty, 0);
  const pts = [0, ...strikes];
  const vals = pts.map(expiryPnl);
  const maxProfit = info.length === 0 ? 0 : upSlope > 0 ? Infinity : Math.max(...vals);
  const maxLoss = info.length === 0 ? 0 : upSlope < 0 ? -Infinity : Math.min(...vals);
  const breakevens: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    if (vals[i] * vals[i + 1] < 0) breakevens.push(pts[i] + ((0 - vals[i]) * (pts[i + 1] - pts[i])) / (vals[i + 1] - vals[i]));
    if (i > 0 && Math.abs(vals[i]) < 0.005) breakevens.push(pts[i]);
  }
  if (pts.length > 1) {
    const lastVal = vals[vals.length - 1];
    if (Math.abs(lastVal) < 0.005) breakevens.push(pts[pts.length - 1]);
    else if (upSlope !== 0 && lastVal * upSlope < 0) breakevens.push(pts[pts.length - 1] - lastVal / upSlope);
  }
  const be = [...new Set(breakevens.map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b);

  const netPremium = -info.reduce((a, l) => a + l.sign * l.qty * l.leg.entry, 0);
  const livePnl = info.reduce((a, l) => a + (l.ltp > 0 ? l.sign * l.qty * (l.ltp - l.leg.entry) : 0), 0);
  const haveGreeks = info.length > 0 && info.every((l) => l.greeks);
  const net = info.reduce((a, l) => {
    const g = l.greeks;
    if (!g) return a;
    const w = l.sign * l.qty;
    return { delta: a.delta + w * g.delta, gamma: a.gamma + w * g.gamma, theta: a.theta + w * g.theta, vega: a.vega + w * g.vega };
  }, { delta: 0, gamma: 0, theta: 0, vega: 0 });

  const W = 900, H = 320, ML = 64, MR = 16, MT = 16, MB = 28;
  const spot = underlyingLtp || atm;
  const farthest = Math.max(0, ...strikes.map((k) => Math.abs(k - spot)), ...be.map((b) => Math.abs(b - spot)));
  const half = Math.max(spot * 0.05, farthest * 1.35);
  const lo = Math.max(0, spot - half);
  const hi = spot + half;
  const N = 160;
  const xs = Array.from({ length: N + 1 }, (_, i) => lo + ((hi - lo) * i) / N);
  const ys = info.length ? xs.map(expiryPnl) : [];
  const ts = info.length ? xs.map(targetPnl) : [];
  const allY = [0, ...ys, ...ts.filter((v): v is number => v !== null)];
  let yMin = Math.min(...allY), yMax = Math.max(...allY);
  if (yMax - yMin < 1) { yMax += 1; yMin -= 1; }
  const pad = (yMax - yMin) * 0.08;
  yMin -= pad; yMax += pad;
  const xScale = (v: number) => ML + ((v - lo) / (hi - lo)) * (W - ML - MR);
  const yScale = (v: number) => MT + ((yMax - v) / (yMax - yMin)) * (H - MT - MB);
  const zeroY = yScale(0);
  const linePath = (arr: (number | null)[]) => {
    let d = "";
    arr.forEach((v, i) => { if (v === null) return; d += `${d === "" || arr[i - 1] === null ? "M" : "L"}${xScale(xs[i]).toFixed(1)} ${yScale(v).toFixed(1)} `; });
    return d;
  };
  const areaPath = info.length ? `M${xScale(xs[0]).toFixed(1)} ${zeroY.toFixed(1)} ` + ys.map((v, i) => `L${xScale(xs[i]).toFixed(1)} ${yScale(v).toFixed(1)}`).join(" ") + ` L${xScale(xs[N]).toFixed(1)} ${zeroY.toFixed(1)} Z` : "";
  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) * i) / 4);
  const xTicks = Array.from({ length: 6 }, (_, i) => lo + ((hi - lo) * i) / 5);
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    setHoverS(Math.min(hi, Math.max(lo, lo + ((x - ML) / (W - ML - MR)) * (hi - lo))));
  };
  const hoverExpiry = hoverS !== null && info.length ? expiryPnl(hoverS) : null;
  const hoverTarget = hoverS !== null && info.length ? targetPnl(hoverS) : null;

  const chip = "rounded-md border border-aveon-border px-2 py-1 text-xs font-semibold text-aveon-muted hover:bg-aveon-panel2 hover:text-aveon-text";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-aveon-border bg-aveon-panel px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {STRATEGY_TEMPLATES.map((t) => <button key={t.name} type="button" onClick={() => applyTemplate(t)} className={chip}>{t.name}</button>)}
        </div>
        <span className="hidden h-5 w-px bg-aveon-border xl:block" />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-aveon-muted">Add leg</span>
          <div className="flex overflow-hidden rounded-md border border-aveon-border">
            {(["BUY", "SELL"] as const).map((v) => <button key={v} type="button" onClick={() => setAddSide(v)} className={`px-2.5 py-1 text-xs font-semibold ${addSide === v ? (v === "BUY" ? "bg-aveon-buy/20 text-aveon-buy" : "bg-aveon-sell/20 text-aveon-sell") : "text-aveon-muted hover:bg-aveon-panel2"}`}>{v}</button>)}
          </div>
          <div className="flex overflow-hidden rounded-md border border-aveon-border">
            {(["CE", "PE"] as const).map((v) => <button key={v} type="button" onClick={() => setAddType(v)} className={`px-2.5 py-1 text-xs font-semibold ${addType === v ? "bg-aveon-primary/15 text-aveon-primary" : "text-aveon-muted hover:bg-aveon-panel2"}`}>{v}</button>)}
          </div>
          <select className={FIELD} value={addStrike || atm} onChange={(e) => setAddStrike(Number(e.target.value))}>
            {allRows.map((r) => <option key={r.strike} value={r.strike}>{r.strike.toLocaleString("en-IN", { maximumFractionDigits: 2 })}{r.strike === atm ? " (ATM)" : ""}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-aveon-muted">Lots<input type="number" min={1} className={`${FIELD} w-14`} value={addLots} onChange={(e) => setAddLots(Math.max(1, Math.floor(Number(e.target.value) || 1)))} /></label>
          <button type="button" onClick={addLeg} className="h-8 rounded-md bg-aveon-primary px-3 text-xs font-semibold text-white hover:opacity-90">Add</button>
        </div>
        {msg && <span className="text-xs text-aveon-sell">{msg}</span>}
        <div className="ml-auto flex items-center gap-2">
          {legs.length > 0 && !confirmAll && <button type="button" onClick={() => setConfirmAll(true)} className="h-8 rounded-md bg-aveon-primary px-3 text-xs font-semibold text-white hover:opacity-90">Trade all legs</button>}
          {confirmAll && (
            <div className="flex items-center gap-2 rounded-md border border-aveon-border bg-aveon-panel2 px-2 py-1 text-xs">
              <span className="text-aveon-muted">Open {legs.length} order ticket{legs.length === 1 ? "" : "s"} one by one, buys first? Cancel a ticket to stop.</span>
              <button type="button" onClick={tradeAllLegs} className="rounded bg-aveon-primary px-2.5 py-1 font-semibold text-white hover:opacity-90">Start</button>
              <button type="button" onClick={() => setConfirmAll(false)} className="rounded px-2 py-1 font-semibold text-aveon-muted hover:bg-aveon-panel">Cancel</button>
            </div>
          )}
          <button type="button" onClick={() => { setLegs([]); setMsg(""); setConfirmAll(false); }} className="rounded-md px-2.5 py-1 text-xs font-semibold text-aveon-sell hover:bg-aveon-sell/10">Clear all</button>
        </div>
      </div>

      {info.length === 0 && (
        <div className="rounded-xl border border-aveon-border bg-aveon-panel px-3 py-10 text-center text-sm text-aveon-muted">Pick a template or add a leg to see the payoff.</div>
      )}

      {info.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-2 rounded-xl border border-aveon-border bg-aveon-panel p-2 md:grid-cols-5 xl:grid-cols-9">
            <Stat label={netPremium >= 0 ? "Net credit" : "Net debit"} value={inr(netPremium)} tone={netPremium >= 0 ? "buy" : "sell"} />
            <Stat label="Max profit" value={maxProfit === Infinity ? "Unlimited" : money(maxProfit)} tone="buy" />
            <Stat label="Max loss" value={maxLoss === -Infinity ? "Unlimited" : money(maxLoss)} tone="sell" />
            <Stat label="Breakeven" value={be.length ? be.map((b) => Math.round(b).toLocaleString("en-IN")).join(" · ") : "--"} />
            <Stat label="P&L now" value={money(livePnl)} tone={livePnl > 0 ? "buy" : livePnl < 0 ? "sell" : undefined} />
            <Stat label="Delta" value={haveGreeks ? net.delta.toFixed(2) : "--"} />
            <Stat label="Gamma" value={haveGreeks ? net.gamma.toFixed(3) : "--"} />
            <Stat label="Theta / day" value={haveGreeks ? money(net.theta) : "--"} />
            <Stat label="Vega / 1% IV" value={haveGreeks ? money(net.vega) : "--"} />
          </div>

          <div className="grid gap-2 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div className="space-y-2">
              <div className="overflow-hidden rounded-xl border border-aveon-border bg-aveon-panel">
                <div className="max-h-[300px] overflow-auto">
                  <div className="min-w-[680px]">
                    <div className="sticky top-0 z-10 grid grid-cols-[64px_1.7fr_1.2fr_1fr_0.9fr_1fr_56px_28px] gap-1 border-b border-aveon-border bg-aveon-panel2 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-aveon-muted">
                      <span>Side</span><span>Contract</span><span className="text-right">Lots × size</span><span className="text-right">Entry</span><span className="text-right">LTP</span><span className="text-right">P&amp;L now</span><span /><span />
                    </div>
                    {info.map((l) => {
                      const pnl = l.ltp > 0 ? l.sign * l.qty * (l.ltp - l.leg.entry) : 0;
                      return (
                        <div key={l.leg.id} className="grid grid-cols-[64px_1.7fr_1.2fr_1fr_0.9fr_1fr_56px_28px] items-center gap-1 border-b border-aveon-border/60 px-3 py-1 text-[13px]">
                          <button type="button" onClick={() => flipLeg(l.leg)} title="Click to flip Buy and Sell" className={`w-fit rounded px-2 py-0.5 text-xs font-semibold ${l.leg.side === "BUY" ? "bg-aveon-buy/15 text-aveon-buy" : "bg-aveon-sell/15 text-aveon-sell"}`}>{l.leg.side}</button>
                          <div className="flex items-center gap-1">
                            <select className={`${FIELD} !h-7 w-[92px] !px-1.5 font-semibold tabular-nums`} value={l.strike} onChange={(e) => changeLeg(l.leg, Number(e.target.value), l.isCall)} aria-label="Strike">
                              {allRows.map((r) => <option key={r.strike} value={r.strike}>{r.strike.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</option>)}
                            </select>
                            <button type="button" onClick={() => changeLeg(l.leg, l.strike, !l.isCall)} title="Click to switch between CE and PE" className={`rounded px-2 py-0.5 text-xs font-semibold ${l.isCall ? "bg-aveon-primary/15 text-aveon-primary" : "bg-[#F5A524]/15 text-[#F5A524]"}`}>{l.isCall ? "CE" : "PE"}</button>
                          </div>
                          <div className="flex items-center justify-end gap-1"><input type="number" min={1} className={`${FIELD} !h-7 w-14 text-right`} value={l.leg.lots} onChange={(e) => patchLeg(l.leg.id, { lots: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} /><span className="text-xs text-aveon-muted">×{l.lotSize}</span></div>
                          <div className="flex justify-end"><input type="number" min={0} step={0.05} className={`${FIELD} !h-7 w-20 text-right`} value={l.leg.entry || ""} onChange={(e) => patchLeg(l.leg.id, { entry: Math.max(0, Number(e.target.value) || 0) })} /></div>
                          <span className="text-right tabular-nums">{displayNumber(l.ltp)}</span>
                          <span className={`text-right font-semibold tabular-nums ${pnl > 0 ? "text-aveon-buy" : pnl < 0 ? "text-aveon-sell" : ""}`}>{l.ltp > 0 ? money(pnl) : "--"}</span>
                          <button type="button" onClick={() => onOrder(l.leg.contract, l.leg.side, entryPrice(l.leg.contract, l.leg.side), l.leg.lots)} title={`${l.leg.side} ${l.leg.lots} lot${l.leg.lots === 1 ? "" : "s"} · ${l.leg.contract.tradingSymbol || l.leg.contract.symbol}`} className="justify-self-end rounded bg-aveon-primary/15 px-2 py-0.5 text-xs font-semibold text-aveon-primary hover:bg-aveon-primary/25">Trade</button>
                          <button type="button" aria-label="Remove leg" onClick={() => setLegs((prev) => prev.filter((x) => x.id !== l.leg.id))} className="justify-self-end rounded px-1.5 text-base leading-none text-aveon-muted hover:bg-aveon-sell/10 hover:text-aveon-sell">×</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-aveon-border bg-aveon-panel p-3">
                <label className="block text-xs text-aveon-muted">
                  <div className="mb-1 flex justify-between"><span>Target date</span><b className="text-aveon-text">{dShift === 0 ? "Today" : `+${dShift} day${dShift === 1 ? "" : "s"}`}{model.ok ? ` · expiry in ${(years * 365).toFixed(1)}d` : ""}</b></div>
                  <input type="range" min={0} max={maxDays} step={1} value={dShift} onChange={(e) => setDays(Number(e.target.value))} disabled={!model.ok || maxDays === 0} className="w-full accent-aveon-primary" />
                </label>
                <label className="block text-xs text-aveon-muted">
                  <div className="mb-1 flex justify-between"><span>IV change</span><b className="text-aveon-text">{ivShift > 0 ? "+" : ""}{ivShift} pts</b></div>
                  <input type="range" min={-10} max={10} step={1} value={ivShift} onChange={(e) => setIvShift(Number(e.target.value))} disabled={!model.ok} className="w-full accent-aveon-primary" />
                </label>
                <div className="text-xs leading-5 text-aveon-muted">{model.ok ? "" : `Target-date curve unavailable: ${model.reason} `}Entry defaults to Ask for buys and Bid for sells. Black-76 at {(RISK_FREE * 100).toFixed(1)}%. Brokerage, taxes and margin not included.</div>
              </div>
            </div>

            <div className="rounded-xl border border-aveon-border bg-aveon-panel p-3">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
                <div className="flex items-center gap-4 text-xs text-aveon-muted">
                  <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-aveon-text" />At expiry</span>
                  <span className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed border-aveon-primary" />Target date</span>
                </div>
                <div className="min-h-[18px] text-xs tabular-nums text-aveon-muted">
                  {hoverS !== null ? <>Underlying <b className="text-aveon-text">{displayNumber(hoverS)}</b> · Expiry <b className={hoverExpiry !== null && hoverExpiry < 0 ? "text-aveon-sell" : "text-aveon-buy"}>{hoverExpiry !== null ? money(hoverExpiry) : "--"}</b>{hoverTarget !== null && <> · Target <b className={hoverTarget < 0 ? "text-aveon-sell" : "text-aveon-buy"}>{money(hoverTarget)}</b></>}</> : "Hover the chart to read P&L at any price"}
                </div>
              </div>

              <svg viewBox={`0 0 ${W} ${H}`} className="w-full text-aveon-text" onMouseMove={onMove} onMouseLeave={() => setHoverS(null)} role="img" aria-label="Strategy payoff chart">
                <defs>
                  <clipPath id="payoff-above"><rect x={ML} y={0} width={W - ML - MR} height={Math.max(0, zeroY)} /></clipPath>
                  <clipPath id="payoff-below"><rect x={ML} y={zeroY} width={W - ML - MR} height={Math.max(0, H - zeroY)} /></clipPath>
                </defs>
                {yTicks.map((v, i) => <g key={`y${i}`}><line x1={ML} x2={W - MR} y1={yScale(v)} y2={yScale(v)} className="stroke-aveon-border" strokeWidth={1} /><text x={ML - 8} y={yScale(v) + 4} textAnchor="end" fontSize={11} className="fill-aveon-muted">{shortMoney(v)}</text></g>)}
                {xTicks.map((v, i) => <text key={`x${i}`} x={xScale(v)} y={H - 8} textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"} fontSize={11} className="fill-aveon-muted">{Math.round(v).toLocaleString("en-IN")}</text>)}
                <path d={areaPath} className="fill-aveon-buy/20" clipPath="url(#payoff-above)" />
                <path d={areaPath} className="fill-aveon-sell/20" clipPath="url(#payoff-below)" />
                <line x1={ML} x2={W - MR} y1={zeroY} y2={zeroY} stroke="currentColor" strokeOpacity={0.35} strokeWidth={1} />
                {spot >= lo && spot <= hi && <g><line x1={xScale(spot)} x2={xScale(spot)} y1={MT} y2={H - MB} className="stroke-aveon-primary" strokeWidth={1} strokeDasharray="4 4" /><text x={xScale(spot) + 4} y={MT + 10} fontSize={11} className="fill-aveon-primary">Spot</text></g>}
                <path d={linePath(ts)} fill="none" className="stroke-aveon-primary" strokeWidth={2} strokeDasharray="6 4" />
                <path d={linePath(ys)} fill="none" stroke="currentColor" strokeWidth={2} />
                {be.filter((b) => b >= lo && b <= hi).map((b) => <circle key={b} cx={xScale(b)} cy={zeroY} r={4} className="fill-aveon-panel stroke-aveon-text" strokeWidth={1.5} />)}
                {hoverS !== null && <g><line x1={xScale(hoverS)} x2={xScale(hoverS)} y1={MT} y2={H - MB} stroke="currentColor" strokeOpacity={0.4} strokeWidth={1} />{hoverExpiry !== null && <circle cx={xScale(hoverS)} cy={yScale(hoverExpiry)} r={4} fill="currentColor" />}</g>}
              </svg>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
