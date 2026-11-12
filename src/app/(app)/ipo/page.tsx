"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCw, Search, X } from "lucide-react";
import { Badge, Card, EmptyState, Input } from "@/components/ui/Primitives";
import IpoApplyModal from "@/components/ipo/IpoApplyModal";
import { IpoCancelDialog, IpoModifyModal } from "@/components/ipo/IpoOrderModals";
import { usePolledData } from "@/hooks/usePolledData";
import { extractList } from "@/types/trading";
import { ipoDetailsPath, ipoListPath, ipoOrdersPath } from "@/lib/endpoints";
import {
  EMPTY,
  biddingWindow,
  cutoffAllowed,
  dateRange,
  dateTimeLabel,
  formatCount,
  formatRupees,
  ipoStatus,
  isFinalOrderStatus,
  priceBand,
  readIpoDetails,
  readIpoLists,
  readOrderMeta,
  safeExternalUrl,
  toNumber,
  type IpoDetails,
  type IpoListItem,
} from "@/types/ipo";

type Tab = "open" | "upcoming" | "closed" | "orders";

const TABS: { id: Tab; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "upcoming", label: "Upcoming" },
  { id: "closed", label: "Closed" },
  { id: "orders", label: "My Orders" },
];

const LIST_REFRESH_MS = 60_000;
const ORDERS_REFRESH_MS = 30_000;

function isoDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function IpoPage() {
  const [tab, setTab] = useState<Tab>("open");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<IpoListItem | null>(null);
  const [applyItem, setApplyItem] = useState<IpoListItem | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [ordersRefresh, setOrdersRefresh] = useState(0);

  const lists = usePolledData(ipoListPath("-1", "", "IPO"), LIST_REFRESH_MS, true);
  const { CurrentIPOList, FutureIPOList, PastIPOList } = useMemo(() => readIpoLists(lists.data), [lists.data]);

  // IPOs that are open for bidding right now — only their orders can be modified or cancelled.
  const activeCodes = useMemo(
    () => new Set(CurrentIPOList.filter((i) => i.placeModifyBid !== false && ipoStatus(i.bidStatus).label === "Open").map((i) => i.IPOCode.toUpperCase())),
    [CurrentIPOList]
  );

  const counts: Record<Tab, number | null> = {
    open: CurrentIPOList.length,
    upcoming: FutureIPOList.length,
    closed: PastIPOList.length,
    orders: null,
  };

  const activeList = tab === "open" ? CurrentIPOList : tab === "upcoming" ? FutureIPOList : PastIPOList;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return activeList;
    return activeList.filter((item) => `${item.OfferName} ${item.IPOCode}`.toLowerCase().includes(q));
  }, [activeList, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">IPO</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-aveon-muted" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search IPO name or code"
              aria-label="Search IPOs"
              className="h-9 w-64 pl-8"
            />
          </div>
          <button
            type="button"
            onClick={() => lists.reload()}
            title="Refresh"
            aria-label="Refresh IPO list"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-aveon-border text-aveon-muted hover:bg-aveon-panel2 hover:text-aveon-text"
          >
            <RefreshCw size={14} className={lists.loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-xs ${
            notice.tone === "success" ? "border-aveon-buy/40 bg-aveon-buy/10 text-aveon-buy" : "border-aveon-sell/40 bg-aveon-sell/10 text-aveon-sell"
          }`}
        >
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100"><X size={13} /></button>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5" role="tablist">
        {TABS.map((t) => {
          const active = tab === t.id;
          const count = counts[t.id];
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-[4px] border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? "border-aveon-primary bg-aveon-primary text-white shadow-sm"
                  : "border-aveon-border bg-aveon-panel2 text-aveon-muted hover:border-aveon-primary/60 hover:text-aveon-text"
              }`}
            >
              {t.label}
              {count !== null && count > 0 && (
                <span className={`rounded-[3px] px-1.5 py-px text-[10px] font-bold leading-4 ${active ? "bg-white/25" : "bg-aveon-border/60"}`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "orders" ? (
        <IpoOrders activeCodes={activeCodes} refreshKey={ordersRefresh} onNotice={(tone, text) => setNotice({ tone, text })} />
      ) : (
        <Card className="overflow-hidden p-0">
          {lists.loading && !lists.data ? (
            <p className="px-4 py-10 text-center text-xs text-aveon-muted">Loading IPOs…</p>
          ) : lists.error && !lists.data ? (
            <ErrorBlock message={lists.error} onRetry={() => lists.reload()} />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={query ? "No IPOs match your search" : `No ${tab} IPOs`}
              subtitle={query ? "Try a different name or code." : "Check the other tabs or come back later."}
            />
          ) : (
            <IpoTable items={filtered} onSelect={setSelected} onApply={setApplyItem} />
          )}
        </Card>
      )}

      {selected && <IpoDetailsModal key={selected.IPOCode} item={selected} onClose={() => setSelected(null)} />}
      {applyItem && (
        <IpoApplyModal
          key={applyItem.IPOCode}
          item={applyItem}
          onClose={() => setApplyItem(null)}
          onPlaced={(message) => {
            setApplyItem(null);
            setNotice({ tone: "success", text: message });
            setOrdersRefresh((n) => n + 1);
            setTab("orders");
          }}
        />
      )}
    </div>
  );
}

/* ----------------------------- IPO list ----------------------------- */

function IpoTable({ items, onSelect, onApply }: { items: IpoListItem[]; onSelect: (item: IpoListItem) => void; onApply: (item: IpoListItem) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] text-xs">
        <thead>
          <tr className="border-b border-aveon-border text-left text-[11px] text-aveon-muted">
            <th className="px-3 py-2 font-medium">Company</th>
            <th className="px-3 py-2 font-medium">Price band</th>
            <th className="px-3 py-2 text-right font-medium">Lot size</th>
            <th className="px-3 py-2 text-right font-medium">Min qty</th>
            <th className="px-3 py-2 text-right font-medium">Min amount</th>
            <th className="px-3 py-2 font-medium">Issue type</th>
            <th className="px-3 py-2 font-medium">Bidding dates</th>
            <th className="px-3 py-2 font-medium">Daily window</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 text-right font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const status = ipoStatus(item.bidStatus);
            const canApply = item.placeModifyBid !== false && status.label === "Open";
            return (
              <tr
                key={`${item.IPOCode}-${item.exchange ?? ""}`}
                tabIndex={0}
                role="button"
                aria-label={`View details for ${item.OfferName}`}
                onClick={() => onSelect(item)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(item);
                  }
                }}
                className="cursor-pointer border-b border-aveon-border/60 last:border-0 hover:bg-aveon-panel2 focus:bg-aveon-panel2 focus:outline-none"
              >
                <td className="px-3 py-2.5">
                  <p className="font-semibold text-aveon-text">{item.OfferName}</p>
                  <p className="text-[10px] text-aveon-muted">
                    {item.IPOCode}
                    {item.exchange ? ` · ${item.exchange}` : ""}
                    {item.OfferType ? ` · ${item.OfferType}` : ""}
                  </p>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{priceBand(item.MinPrice, item.MaxPrice)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatCount(item.LotSize)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatCount(item.MinOrderQty)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{formatRupees(item.MinAmount)}</td>
                <td className="whitespace-nowrap px-3 py-2.5">{item.IssueType || EMPTY}</td>
                <td className="whitespace-nowrap px-3 py-2.5">{dateRange(item.StartDate, item.EndDate)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{biddingWindow(item.dtDailyStartTime, item.dtDailyEndTime)}</td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge tone={status.tone}>{status.label}</Badge>
                    {item.brokerReco ? <Badge tone="neutral">{item.brokerReco}</Badge> : null}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right">
                  {canApply ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onApply(item);
                      }}
                      onKeyDown={(e) => e.stopPropagation()}
                      className="rounded border border-aveon-buy/60 bg-aveon-buy/15 px-3 py-1 text-[11px] font-semibold text-aveon-buy transition-colors hover:bg-aveon-buy hover:text-white"
                    >
                      Apply
                    </button>
                  ) : (
                    <span className="text-aveon-muted">{EMPTY}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------- IPO details modal --------------------------- */

function IpoDetailsModal({ item, onClose }: { item: IpoListItem; onClose: () => void }) {
  const details = usePolledData(ipoDetailsPath(item.IPOCode), 0, true);
  const info: IpoDetails | null = useMemo(() => readIpoDetails(details.data), [details.data]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const status = ipoStatus(item.bidStatus);
  const prospectus = safeExternalUrl(info?.ProspectusLink);
  const rta = safeExternalUrl(info?.RTAlink);
  const categories = info?.CategoryWise ?? [];

  const facts: [string, string][] = [
    ["Price band", priceBand(info?.MinPrice ?? item.MinPrice, info?.MaxPrice ?? item.MaxPrice)],
    ["Bidding dates", dateRange(info?.StartDate ?? item.StartDate, info?.EndDate ?? item.EndDate)],
    ["Daily bidding window", biddingWindow(info?.DailyBiddingStartTime ?? item.dtDailyStartTime, info?.DailyBiddingEndTime ?? item.dtDailyEndTime)],
    ["Lot size", formatCount(info?.LotSize ?? item.LotSize)],
    ["Min order qty", formatCount(info?.MinOrderQty ?? item.MinOrderQty)],
    ["Min amount", formatRupees(item.MinAmount)],
    ["Tick size", info?.TickSize !== undefined && info?.TickSize !== null && info?.TickSize !== "" ? String(info.TickSize) : EMPTY],
    ["Face value", formatRupees(info?.FaceValue ?? item.FaceValue)],
    ["Issue size", formatCount(info?.IssueSize ?? item.IssueSize)],
    ["Issue type", info?.IssueType || item.IssueType || EMPTY],
    ["Registrar", info?.RegisterName || EMPTY],
    ["Rating", [info?.Ratings, info?.RatingAgency].filter(Boolean).join(" · ") || EMPTY],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${item.OfferName} details`}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-aveon-border bg-aveon-panel shadow-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-aveon-border bg-aveon-panel2 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-aveon-text">{info?.Name || item.OfferName}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-aveon-muted">
              <span>{info?.Symbol || item.IPOCode}</span>
              {info?.Series ? <span>· {info.Series}</span> : null}
              <Badge tone={status.tone}>{status.label}</Badge>
              {(info?.OfferType || item.OfferType) && <Badge tone="neutral">{info?.OfferType || item.OfferType}</Badge>}
              {(info?.BrokerReco || item.brokerReco) && <Badge tone="neutral">{info?.BrokerReco || item.brokerReco}</Badge>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-aveon-muted hover:bg-aveon-panel hover:text-aveon-text"
          >
            <X size={17} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {details.loading && !details.data && <p className="text-xs text-aveon-muted">Loading details…</p>}
          {details.error && !details.data && (
            <ErrorBlock message={details.error} onRetry={() => details.reload()} compact note="Showing the basic information from the IPO list." />
          )}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] text-aveon-muted">{label}</dt>
                <dd className="text-sm font-semibold tabular-nums text-aveon-text">{value}</dd>
              </div>
            ))}
          </dl>

          {(prospectus || rta) && (
            <div className="flex flex-wrap gap-2">
              {prospectus && (
                <a
                  href={prospectus}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-md border border-aveon-border px-3 py-1.5 text-xs font-medium text-aveon-primary hover:bg-aveon-panel2"
                >
                  Prospectus <ExternalLink size={12} />
                </a>
              )}
              {rta && (
                <a
                  href={rta}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-md border border-aveon-border px-3 py-1.5 text-xs font-medium text-aveon-primary hover:bg-aveon-panel2"
                >
                  Registrar (RTA) <ExternalLink size={12} />
                </a>
              )}
            </div>
          )}

          {categories.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-aveon-text">Category-wise bidding</p>
              <div className="overflow-x-auto rounded-lg border border-aveon-border">
                <table className="w-full min-w-[720px] text-xs">
                  <thead>
                    <tr className="border-b border-aveon-border bg-aveon-panel2 text-left text-[11px] text-aveon-muted">
                      <th className="px-3 py-2 font-medium">Category</th>
                      <th className="px-3 py-2 font-medium">Price</th>
                      <th className="px-3 py-2 text-right font-medium">Max lots</th>
                      <th className="px-3 py-2 text-right font-medium">Min amount</th>
                      <th className="px-3 py-2 text-right font-medium">Max amount</th>
                      <th className="px-3 py-2 font-medium">Cut-off</th>
                      <th className="px-3 py-2 font-medium">Opens</th>
                      <th className="px-3 py-2 font-medium">Closes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((c, index) => (
                      <tr key={`${c.AppCategoryCode ?? index}`} className="border-b border-aveon-border/60 last:border-0">
                        <td className="px-3 py-2">
                          <p className="font-medium text-aveon-text">{c.AppCategoryName || c.AppCategoryCode || EMPTY}</p>
                          {c.AppCategoryCode && c.AppCategoryName ? <p className="text-[10px] text-aveon-muted">{c.AppCategoryCode}</p> : null}
                          {toNumber(c.DiscountValue) ? <p className="text-[10px] text-aveon-buy">Discount {String(c.DiscountValue)}</p> : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">{priceBand(c.MinPrice, c.MaxPrice)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatCount(c.MaxBidLots)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatRupees(c.MinAmount)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatRupees(c.MaxAmount)}</td>
                        <td className="px-3 py-2">{cutoffAllowed(c) ? "Yes" : "No"}</td>
                        <td className="whitespace-nowrap px-3 py-2">{dateTimeLabel(c.StartDateTime)}</td>
                        <td className="whitespace-nowrap px-3 py-2">{dateTimeLabel(c.EndDateTime)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ My orders ------------------------------ */

// Columns shown first when the API returns them; anything else follows.
const ORDER_PRIORITY = [
  /applicationno|applicationnumber|appno/i,
  /offername|ipoName|companyname|^name$/i,
  /ipocode|symbol/i,
  /categor/i,
  /qty|quantity|lots?/i,
  /price|rate/i,
  /amount|value/i,
  /status/i,
  /date|time/i,
];

function humanizeKey(key: string) {
  return key
    .replace(/^n(?=[A-Z])/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function cellText(value: unknown) {
  if (value === null || value === undefined || value === "") return EMPTY;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function IpoOrders({ activeCodes, refreshKey, onNotice }: { activeCodes: Set<string>; refreshKey: number; onNotice: (tone: "success" | "error", text: string) => void }) {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return isoDate(d);
  });
  const [to, setTo] = useState(() => isoDate(new Date()));
  const valid = Boolean(from) && Boolean(to) && from <= to;
  const [modifyRow, setModifyRow] = useState<Record<string, unknown> | null>(null);
  const [cancelRow, setCancelRow] = useState<Record<string, unknown> | null>(null);

  const orders = usePolledData(ipoOrdersPath({ startDate: from, endDate: to }), ORDERS_REFRESH_MS, valid);
  const rows = useMemo(() => extractList(orders.data, ["data", "orders", "OrderList", "ipoOrders"]) as Record<string, unknown>[], [orders.data]);

  const reloadOrders = orders.reload;
  useEffect(() => {
    if (refreshKey > 0) reloadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  /** Modify / Cancel only for orders of IPOs that are still open, and not already final. */
  const canChange = (row: Record<string, unknown>) => {
    const meta = readOrderMeta(row as Record<string, any>);
    return Boolean(meta.transactionNo) && activeCodes.has(meta.ipoCode.toUpperCase()) && !isFinalOrderStatus(meta.status);
  };

  const columns = useMemo(() => {
    const keys: string[] = [];
    for (const row of rows.slice(0, 25)) {
      for (const [key, value] of Object.entries(row ?? {})) {
        if (value !== null && typeof value === "object") continue; // nested objects/arrays aren't table cells
        if (!keys.includes(key)) keys.push(key);
      }
    }
    const rank = (key: string) => {
      const i = ORDER_PRIORITY.findIndex((re) => re.test(key));
      return i === -1 ? ORDER_PRIORITY.length : i;
    };
    return [...keys].sort((a, b) => rank(a) - rank(b)).slice(0, 12);
  }, [rows]);

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-end gap-3 border-b border-aveon-border px-4 py-3">
        <label className="text-[11px] font-medium text-aveon-muted">
          From
          <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-9 w-40" />
        </label>
        <label className="text-[11px] font-medium text-aveon-muted">
          To
          <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="mt-1 h-9 w-40" />
        </label>
        <button
          type="button"
          disabled={!valid}
          onClick={() => orders.reload()}
          className="flex h-9 items-center gap-1.5 rounded-md border border-aveon-border px-3 text-xs text-aveon-text hover:bg-aveon-panel2 disabled:opacity-40"
        >
          <RefreshCw size={13} className={orders.loading ? "animate-spin" : ""} /> Refresh
        </button>
        {!valid && <p className="text-[11px] text-aveon-sell">“From” must be on or before “To”.</p>}
      </div>

      {!valid ? null : orders.loading && !orders.data ? (
        <p className="px-4 py-10 text-center text-xs text-aveon-muted">Loading IPO orders…</p>
      ) : orders.error && !orders.data ? (
        <ErrorBlock message={orders.error} onRetry={() => orders.reload()} />
      ) : rows.length === 0 ? (
        <EmptyState title="No IPO orders in this period" subtitle="Pick a wider date range to see older applications." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead>
              <tr className="border-b border-aveon-border text-left text-[11px] text-aveon-muted">
                {columns.map((key) => (
                  <th key={key} className="whitespace-nowrap px-3 py-2 font-medium">{humanizeKey(key)}</th>
                ))}
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-b border-aveon-border/60 last:border-0 hover:bg-aveon-panel2">
                  {columns.map((key) => (
                    <td key={key} className="whitespace-nowrap px-3 py-2">{cellText(row[key])}</td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {canChange(row) ? (
                      <div className="flex justify-end gap-1.5">
                        <button type="button" onClick={() => setModifyRow(row)} className="rounded border border-aveon-primary/60 bg-aveon-primary/15 px-2.5 py-1 text-[11px] font-semibold text-aveon-primary transition-colors hover:bg-aveon-primary hover:text-white">Modify</button>
                        <button type="button" onClick={() => setCancelRow(row)} className="rounded border border-aveon-sell/60 bg-aveon-sell/15 px-2.5 py-1 text-[11px] font-semibold text-aveon-sell transition-colors hover:bg-aveon-sell hover:text-white">Cancel</button>
                      </div>
                    ) : (
                      <span className="text-aveon-muted" title="Orders can only be changed while the IPO is open">{EMPTY}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modifyRow && (
        <IpoModifyModal
          order={modifyRow as Record<string, any>}
          onClose={() => setModifyRow(null)}
          onDone={(message) => {
            setModifyRow(null);
            onNotice("success", message);
            reloadOrders();
          }}
        />
      )}
      {cancelRow && (
        <IpoCancelDialog
          order={cancelRow as Record<string, any>}
          onClose={() => setCancelRow(null)}
          onDone={(message) => {
            setCancelRow(null);
            onNotice("success", message);
            reloadOrders();
          }}
        />
      )}
    </Card>
  );
}

/* ------------------------------- shared ------------------------------- */

function ErrorBlock({ message, onRetry, compact = false, note }: { message: string; onRetry: () => void; compact?: boolean; note?: string }) {
  return (
    <div className={`flex flex-col items-center gap-2 text-center ${compact ? "rounded-lg border border-aveon-sell/30 bg-aveon-sell/5 px-4 py-3" : "px-4 py-10"}`}>
      <p className="text-xs text-aveon-sell">{message}</p>
      {note && <p className="text-[11px] text-aveon-muted">{note}</p>}
      <button type="button" onClick={onRetry} className="rounded-md border border-aveon-border px-3 py-1.5 text-xs text-aveon-text hover:bg-aveon-panel2">
        Try again
      </button>
    </div>
  );
}
