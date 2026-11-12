"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Input, Select } from "@/components/ui/Primitives";
import OrderTicketModal from "@/components/market/OrderTicketModal";
import { usePolledData } from "@/hooks/usePolledData";
import { useMarketStream } from "@/hooks/useMarketStream";
import { Endpoints } from "@/lib/endpoints";
import { formatCurrency, pnlTone } from "@/lib/format";
import { feedToken, normalizeHolding, type HoldingModel, type Instrument, type RawHoldingModel } from "@/types/trading";

export default function HoldingsPage() {
  const raw = usePolledData<RawHoldingModel[]>(Endpoints.holdings.list, 30_000);
  const holdings = useMemo(() => (raw.data ?? []).map(normalizeHolding), [raw.data]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"symbol" | "current" | "day" | "pnl">("symbol");
  const [selected, setSelected] = useState<HoldingModel | null>(null);
  const [sell, setSell] = useState(false);

  const instruments = useMemo(() => holdings.map(holdingInstrument).filter(Boolean) as Instrument[], [holdings]);
  const { quotesByToken } = useMarketStream(instruments);
  const rows = useMemo(() => holdings.map((h) => {
    const i = holdingInstrument(h);
    const quoteKey = i ? feedToken(i) : null;
    const quote = quoteKey ? quotesByToken[quoteKey] : undefined;
    const ltp = quote?.ltp || h.ltp;
    const current = ltp > 0 ? ltp * h.quantity : h.current_value;
    const pnl = current - h.invested_value;
    const day = h.close_price > 0 && ltp > 0 ? (ltp - h.close_price) * h.quantity : h.day_pnl;
    return { h, ltp, current, pnl, day };
  }), [holdings, quotesByToken]);

  const visible = useMemo(() => {
    const q = query.trim().toUpperCase();
    const list = rows.filter(({ h }) => !q || [h.trading_symbol, h.isin, h.exchange].some((x) => String(x).toUpperCase().includes(q)));
    return [...list].sort((a,b) => sort === "current" ? b.current-a.current : sort === "day" ? b.day-a.day : sort === "pnl" ? b.pnl-a.pnl : a.h.trading_symbol.localeCompare(b.h.trading_symbol));
  }, [rows, query, sort]);

  const totals = rows.reduce((a, r) => ({ invested: a.invested + r.h.invested_value, current: a.current + r.current, pnl: a.pnl + r.pnl, day: a.day + r.day }), { invested:0,current:0,pnl:0,day:0 });

  function openTrade(h: HoldingModel, isSell: boolean) { setSelected(h); setSell(isSell); }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-semibold">Holdings</h1><p className="text-xs text-aveon-muted">Mobile-parity holdings with live LTP, day P&amp;L and trade actions.</p></div><div className="grid grid-cols-2 gap-4 text-right md:grid-cols-4"><Stat label="Invested" value={formatCurrency(totals.invested)} /><Stat label="Current" value={formatCurrency(totals.current)} /><Stat label="Day P&amp;L" value={formatCurrency(totals.day)} tone={pnlTone(totals.day)} /><Stat label="Overall P&amp;L" value={formatCurrency(totals.pnl)} tone={pnlTone(totals.pnl)} /></div></div>
    <Card className="p-3"><div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_180px]"><Input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search symbol, ISIN or exchange" /><Select value={sort} onChange={(e)=>setSort(e.target.value as typeof sort)}><option value="symbol">Sort: Symbol</option><option value="current">Sort: Current Value</option><option value="day">Sort: Day P&amp;L</option><option value="pnl">Sort: Overall P&amp;L</option></Select></div></Card>
    <Card className="overflow-x-auto p-0">{raw.loading ? <p className="p-6 text-xs text-aveon-muted">Loading holdings…</p> : raw.error ? <EmptyState title="Unable to load holdings" subtitle={raw.error} /> : !visible.length ? <EmptyState title="No holdings" /> : <table className="w-full min-w-[1100px] text-xs"><thead className="border-b border-aveon-border text-left text-aveon-muted"><tr>{['Symbol','Exchange','Qty','DP Free','T1','Avg Price','LTP','Current Value','Day P&L','Overall P&L','Actions'].map(h=><th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead><tbody>{visible.map(({h,ltp,current,pnl,day},i)=><tr key={`${h.isin}-${h.exchange}-${i}`} className="table-row-hover border-b border-aveon-border/40"><td className="px-3 py-2"><p className="font-medium">{h.trading_symbol}</p><p className="text-[10px] text-aveon-muted">{h.isin}</p></td><td className="px-3 py-2">{h.exchange}</td><td className="px-3 py-2">{h.quantity}</td><td className="px-3 py-2">{h.dp_free}</td><td className="px-3 py-2">{h.t1_quantity}</td><td className="px-3 py-2">{formatCurrency(h.avg_price)}</td><td className="px-3 py-2">{formatCurrency(ltp)}</td><td className="px-3 py-2">{formatCurrency(current)}</td><td className="px-3 py-2"><Badge tone={pnlTone(day)}>{formatCurrency(day)} ({h.close_price ? `${((ltp-h.close_price)/h.close_price*100).toFixed(2)}%` : '—'})</Badge></td><td className="px-3 py-2"><Badge tone={pnlTone(pnl)}>{formatCurrency(pnl)} ({h.invested_value ? `${(pnl/h.invested_value*100).toFixed(2)}%` : '0.00%'})</Badge></td><td className="px-3 py-2"><div className="flex gap-1"><Button variant="buy" className="px-2 py-1 text-[10px]" onClick={()=>openTrade(h,false)}>Add</Button><Button variant="sell" className="px-2 py-1 text-[10px]" disabled={h.quantity<=0} onClick={()=>openTrade(h,true)}>Sell</Button></div></td></tr>)}</tbody></table>}</Card>
    {selected && <OrderTicketModal open={!!selected} instrument={holdingInstrument(selected)} cashOptions={holdingInstruments(selected)} initialSide={sell ? 'SELL' : 'BUY'} initialProductType={(selected.product as any) || 'CNC'} initialQuantity={sell ? selected.quantity : 1} initialPrice={rows.find(r=>r.h===selected)?.ltp || selected.ltp} onClose={()=>setSelected(null)} onOrderPlaced={()=>{setSelected(null); raw.reload();}} />}
  </div>;
}
function holdingInstruments(h: HoldingModel): Instrument[] {
  // Holdings can contain multiple exchange-specific securities for the same ISIN.
  // Preserve each API-provided exchange/token pair so OE can offer NSE and BSE separately.
  const securities = Array.isArray((h as any).security_info) ? (h as any).security_info : [];
  const mapped = securities.map((sec: any): Instrument | null => {
    const exchange = String(sec.exchange || sec.Exchange || '').toUpperCase();
    const token = String(sec.scrip_token || sec.scripToken || sec.token || '');
    if (!exchange || !token) return null;
    const segment = exchange.includes('BSE') ? 'BSE_EQ' : exchange.includes('NSE') ? 'NSE_EQ' : exchange;
    return {
      exchange: segment,
      exchangeSegment: segment,
      marketSegmentId: segmentId(segment),
      token,
      symbol: sec.symbol || sec.trading_symbol || sec.tradingSymbol || h.trading_symbol,
      tradingSymbol: sec.symbol || sec.trading_symbol || sec.tradingSymbol || h.trading_symbol,
      companyName: h.trading_symbol,
      series: 'EQ',
      regularLot: 1,
      priceTick: 0.05,
    } as Instrument;
  }).filter(Boolean) as Instrument[];

  if (mapped.length) {
    return mapped.sort((a, b) => a.exchange.includes('NSE') ? -1 : b.exchange.includes('NSE') ? 1 : 0);
  }
  if (!h.exchange || !h.scrip_token) return [];
  return [{ exchange: h.exchange, exchangeSegment: h.exchange, marketSegmentId: segmentId(h.exchange), token: String(h.scrip_token), symbol: h.trading_symbol, tradingSymbol: h.trading_symbol, companyName: h.trading_symbol, series: 'EQ', regularLot: 1, priceTick: 0.05 } as Instrument];
}
function holdingInstrument(h: HoldingModel): Instrument | null { return holdingInstruments(h)[0] ?? null; }
function segmentId(exchange: string) { return ({NSE_EQ:1,NSE_FO:2,BSE_EQ:3,BSE_FO:4,MCX_FO:5,MCX_SPOT:6,NCDEX_FO:7,NCDEX_SPOT:8,NSEL_SPOT:9,NSEL_COM:10,MSE_CDS:11,MSE_CDS_SPOT:12,NSE_CDS:13,NSE_CDS_SPOT:14,MSE_EQ:15,MSE_FO:16,BSE_COMM:18,NSE_COMM:19,BSE_OFS:25,NSE_OFS:33} as Record<string,number>)[exchange.toUpperCase()] ?? 0; }
function Stat({label,value,tone}:{label:string;value:string;tone?:'buy'|'sell'|'neutral'}) { return <div><p className="text-[10px] text-aveon-muted">{label}</p><p className={`text-sm font-semibold ${tone==='buy'?'text-aveon-buy':tone==='sell'?'text-aveon-sell':'text-aveon-text'}`}>{value}</p></div>; }
