"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState } from "@/components/ui/Primitives";
import OrderTicketModal from "@/components/market/OrderTicketModal";
import { usePolledData } from "@/hooks/usePolledData";
import { useMarketStream } from "@/hooks/useMarketStream";
import { positionsPath, Endpoints } from "@/lib/endpoints";
import { formatCurrency, pnlTone } from "@/lib/format";
import { normalizeHolding, feedToken, type PositionModel, type RawHoldingModel, type HoldingModel, type Instrument, type TransactionType } from "@/types/trading";

export default function PortfolioPage() {
  const positions = usePolledData<PositionModel[]>(positionsPath("daily"), 5_000);
  const rawHoldings = usePolledData<RawHoldingModel[]>(Endpoints.holdings.list, 30_000);
  const holdings = useMemo(() => (rawHoldings.data ?? []).map(normalizeHolding), [rawHoldings.data]);

  // Subscribe to real-time market stream for ALL exchange tokens in security_info with correct marketSegmentId
  const holdingInstruments = useMemo(() => {
    const list: Instrument[] = [];
    for (const h of holdings) {
      const rawSecs = h.security_info || [];
      for (const sec of rawSecs) {
        const s = sec as any;
        const rawExchange = String(s.exchange || s.Exchange || "").toUpperCase();
        const exchangeSegment = rawExchange.includes("BSE")
          ? "BSE_EQ"
          : rawExchange.includes("NSE")
            ? "NSE_EQ"
            : rawExchange;
        const token = String(s.scrip_token || s.scripToken || s.token || "");
        if (token && token !== "0" && exchangeSegment) {
          list.push({
            exchange: exchangeSegment,
            exchangeSegment,
            token,
            symbol: s.symbol || s.trading_symbol || h.trading_symbol,
            tradingSymbol: s.symbol || s.trading_symbol || h.trading_symbol,
          } as Instrument);
        }
      }
    }
    return list;
  }, [holdings]);

  const { quotesByToken: holdingQuotes } = useMarketStream(holdingInstruments);

  // Order Ticket modal state for DP Holding actions
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketInstrument, setTicketInstrument] = useState<Instrument | null>(null);
  const [ticketSide, setTicketSide] = useState<TransactionType>("BUY");
  const [ticketQty, setTicketQty] = useState(1);
  const [ticketPrice, setTicketPrice] = useState(0);

  const positionsValue = (positions.data ?? []).reduce((s, p) => s + Math.abs(p.net_value ?? 0), 0);

  // Resolve each exchange independently using the feed's segment/token key.
  function getHoldingExchangeLtp(h: HoldingModel, wantedExchange: "NSE" | "BSE") {
    const sec = (h.security_info || []).find((item: any) => String(item.exchange || "").toUpperCase().includes(wantedExchange));
    if (!sec) return 0;
    const s = sec as any;
    const token = String(s.scrip_token || s.scripToken || s.token || "");
    const rawExchange = String(s.exchange || s.Exchange || "").toUpperCase();
    const exchangeSegment = rawExchange.includes("BSE")
      ? "BSE_EQ"
      : rawExchange.includes("NSE")
        ? "NSE_EQ"
        : rawExchange;
    const quoteKey = feedToken({
      exchange: exchangeSegment,
      exchangeSegment,
      token,
    } as Instrument);
    const quote = quoteKey ? holdingQuotes[quoteKey] : undefined;
    return Number(quote?.ltp) > 0 ? Number(quote?.ltp) : 0;
  }

  function getBestHoldingLtp(h: HoldingModel) {
    const nseLtp = getHoldingExchangeLtp(h, "NSE");
    const bseLtp = getHoldingExchangeLtp(h, "BSE");
    const rawSecs = h.security_info || [];
    const nseSec = rawSecs.some((s: any) => String(s.exchange || "").toUpperCase().includes("NSE"));
    const bseSec = rawSecs.some((s: any) => String(s.exchange || "").toUpperCase().includes("BSE"));
    if (nseLtp > 0) return { ltp: nseLtp, exchange: "NSE_EQ", nseLtp, bseLtp, nseSec, bseSec };
    if (bseLtp > 0) return { ltp: bseLtp, exchange: "BSE_EQ", nseLtp, bseLtp, nseSec, bseSec };
    return { ltp: h.ltp || 0, exchange: nseSec ? "NSE_EQ" : "BSE_EQ", nseLtp, bseLtp, nseSec, bseSec };
  }

  // Calculate live holdings value and P&L using real-time quotes
  const { holdingsValue, holdingsPnl } = useMemo(() => {
    let val = 0;
    let pnl = 0;
    for (const h of holdings) {
      const bestObj = getBestHoldingLtp(h);
      const ltp = bestObj.ltp;
      const avgPrice = h.avg_price || 0;
      const currentVal = h.quantity * (ltp > 0 ? ltp : avgPrice);
      const itemPnl = ltp > 0 ? (ltp - avgPrice) * h.quantity : (h.pnl || 0);

      val += currentVal;
      pnl += itemPnl;
    }
    return { holdingsValue: val, holdingsPnl: pnl };
  }, [holdings, holdingQuotes]);

  function openHoldingAction(holding: HoldingModel, side: TransactionType) {
    const rawSecs = holding.security_info || [];

    const normalizedSecs = rawSecs.map((sec: any) => {
      const ex = (sec.exchange || sec.Exchange || "NSE_EQ").toUpperCase();
      const seg = ex.includes("BSE") ? "BSE_EQ" : "NSE_EQ";
      const marketSegId = seg.includes("BSE") ? 3 : 1;
      return {
        exchange: seg,
        exchangeSegment: seg,
        marketSegmentId: marketSegId,
        token: String(sec.scrip_token || sec.scripToken || sec.token || ""),
        scrip_token: String(sec.scrip_token || sec.scripToken || sec.token || ""),
        symbol: sec.symbol || sec.tradingSymbol || holding.trading_symbol,
        tradingSymbol: sec.symbol || sec.tradingSymbol || holding.trading_symbol,
      };
    });

    // Prioritize NSE first, then BSE for default selection in OE
    const sortedSecs = [...normalizedSecs].sort((a, b) => {
      if (a.exchange.includes("NSE")) return -1;
      if (b.exchange.includes("NSE")) return 1;
      return 0;
    });

    const primarySec = sortedSecs[0] || {
      exchange: "NSE_EQ",
      exchangeSegment: "NSE_EQ",
      marketSegmentId: 1,
      token: String(holding.scrip_token || ""),
      symbol: holding.trading_symbol,
      tradingSymbol: holding.trading_symbol,
    };

    const bestObj = getBestHoldingLtp(holding);

    const instrument: Instrument = {
      exchange: primarySec.exchange,
      exchangeSegment: primarySec.exchangeSegment,
      marketSegmentId: primarySec.marketSegmentId,
      token: String(primarySec.token),
      symbol: primarySec.symbol,
      tradingSymbol: primarySec.tradingSymbol,
      companyName: holding.trading_symbol,
      security_info: sortedSecs,
    } as any;

    setTicketInstrument(instrument);
    setTicketSide(side);
    setTicketQty(side === "SELL" ? Math.max(1, holding.quantity) : 1);
    setTicketPrice(bestObj.ltp || holding.ltp || holding.avg_price || 0);
    setTicketOpen(true);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Portfolio</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs text-aveon-muted">Positions Value</p>
          <p className="mt-2 text-lg font-semibold">{formatCurrency(positionsValue)}</p>
        </Card>
        <Card>
          <p className="text-xs text-aveon-muted">Holdings Value</p>
          <p className="mt-2 text-lg font-semibold">{formatCurrency(holdingsValue)}</p>
        </Card>
        <Card>
          <p className="text-xs text-aveon-muted">Holdings P&amp;L</p>
          <p
            className={`mt-2 text-lg font-semibold ${
              pnlTone(holdingsPnl) === "buy" ? "text-aveon-buy" : pnlTone(holdingsPnl) === "sell" ? "text-aveon-sell" : ""
            }`}
          >
            {formatCurrency(holdingsPnl)}
          </p>
        </Card>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-aveon-text">DP Holdings</h2>
        <Card className="overflow-x-auto p-0">
          {rawHoldings.loading ? (
            <p className="p-6 text-xs text-aveon-muted">Loading holdings…</p>
          ) : rawHoldings.error ? (
            <EmptyState title="Unable to load holdings" subtitle={rawHoldings.error} />
          ) : !holdings.length ? (
            <EmptyState title="No holdings found." />
          ) : (
            <table className="w-full min-w-[1050px] text-xs">
              <thead className="border-b border-aveon-border text-left text-aveon-muted">
                <tr>
                  {["Symbol", "NSE LTP", "BSE LTP", "Qty", "Avg Price", "Current Value", "P&L", "Action"].map((h) => (
                    <th key={h} className="px-3 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {holdings.map((h, i) => {
                  const bestObj = getBestHoldingLtp(h);
                  const ltp = bestObj.ltp;
                  const avgPrice = h.avg_price || 0;
                  const currentValue = h.quantity * (ltp > 0 ? ltp : avgPrice);
                  const pnl = ltp > 0 ? (ltp - avgPrice) * h.quantity : (h.pnl || 0);

                  return (
                    <tr key={i} className="table-row-hover border-b border-aveon-border/40">
                      <td className="px-3 py-2 font-medium">{h.trading_symbol}</td>
                      <td className="px-3 py-2">{bestObj.nseLtp > 0 ? formatCurrency(bestObj.nseLtp) : "—"}</td>
                      <td className="px-3 py-2">{bestObj.bseLtp > 0 ? formatCurrency(bestObj.bseLtp) : "—"}</td>
                      <td className="px-3 py-2 font-semibold">{h.quantity}</td>
                      <td className="px-3 py-2">{formatCurrency(avgPrice)}</td>
                      <td className="px-3 py-2">{ltp > 0 ? formatCurrency(ltp) : "—"}</td>
                      <td className="px-3 py-2">{formatCurrency(currentValue)}</td>
                      <td className="px-3 py-2">
                        <span className={pnl >= 0 ? "text-aveon-buy" : "text-aveon-sell"}>{formatCurrency(pnl)}</span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => openHoldingAction(h, "BUY")}
                            className="rounded border border-aveon-buy/60 bg-aveon-buy/15 px-2.5 py-1 text-[11px] font-semibold text-aveon-buy hover:bg-aveon-buy hover:text-white"
                          >
                            Buy
                          </button>
                          <button
                            disabled={h.quantity <= 0}
                            onClick={() => openHoldingAction(h, "SELL")}
                            className="rounded border border-aveon-sell/60 bg-aveon-sell/15 px-2.5 py-1 text-[11px] font-semibold text-aveon-sell hover:bg-aveon-sell hover:text-white disabled:opacity-50"
                          >
                            Sell
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {ticketOpen && ticketInstrument && (
        <OrderTicketModal
          open={ticketOpen}
          instrument={ticketInstrument}
          cashOptions={(((ticketInstrument as Instrument & { security_info?: Instrument[] }).security_info) ?? [ticketInstrument])}
          quotes={holdingQuotes}
          initialSide={ticketSide}
          initialProductType="CNC"
          initialQuantity={ticketQty}
          initialPrice={ticketPrice}
          onClose={() => setTicketOpen(false)}
          onOrderPlaced={() => {
            setTicketOpen(false);
            rawHoldings.reload();
          }}
        />
      )}

      <p className="text-xs text-aveon-muted">
        Positions P&amp;L isn&apos;t shown here — the broker&apos;s positions endpoint doesn&apos;t
        return LTP or a P&amp;L figure, only <code className="rounded bg-white/10 px-1">net_value</code>.
        Live P&amp;L needs that joined against LTP from the market-data broadcast feed.
      </p>
    </div>
  );
}