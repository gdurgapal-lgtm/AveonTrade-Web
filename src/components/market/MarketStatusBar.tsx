"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { usePolledData } from "@/hooks/usePolledData";
import { extractList } from "@/types/trading";

type RawStatus = { exchangeSegment?: string | number; lastUpdatedTime?: string; marketStatus?: string };
type Tone = "open" | "pre" | "closed" | "unknown";

// Segment ids from the Synapsewave Reference Catalog, in display order.
const SEGMENTS: { code: string; id: string; label: string }[] = [
  { code: "NSE_EQ", id: "1", label: "NSE Equity" },
  { code: "NSE_FO", id: "2", label: "NSE F&O" },
  { code: "BSE_EQ", id: "8", label: "BSE Equity" },
  { code: "BSE_FO", id: "4", label: "BSE F&O" },
  { code: "MCX_FO", id: "16", label: "MCX Commodity" },
  { code: "NCDEX_FO", id: "64", label: "NCDEX Commodity" },
  { code: "NSE_CUR", id: "2048", label: "NSE Currency" },
  { code: "BSE_CUR", id: "268435456", label: "BSE Currency" },
  { code: "MSE_CUR", id: "1024", label: "MSE Currency" },
  { code: "NSE_COMM", id: "32768", label: "NSE Commodity" },
  { code: "BSE_COMM", id: "16384", label: "BSE Commodity" },
  { code: "NSE_EGR", id: "21", label: "NSE EGR" },
  { code: "NSE_OTS", id: "536870912", label: "NSE Odd Lot" },
];
// Shown in the footer; the rest are in the popover.
const PRIMARY = ["NSE_EQ", "NSE_FO", "BSE_EQ", "MCX_FO"];

function segmentCode(value: unknown): string {
  const raw = String(value ?? "").trim();
  const upper = raw.toUpperCase();
  return SEGMENTS.find((s) => s.code === upper || s.id === raw)?.code ?? upper;
}

// The docs only show "Open"; classify other wordings defensively.
function toneOf(status: string): Tone {
  const s = status.toLowerCase();
  if (!s) return "unknown";
  if (s.includes("pre")) return "pre";
  if (s.includes("post") || s.includes("clos") || s.includes("holiday")) return "closed";
  if (s.includes("open")) return "open";
  return "unknown";
}

const DOT: Record<Tone, string> = {
  open: "bg-aveon-buy",
  pre: "bg-amber-500",
  closed: "bg-aveon-sell",
  unknown: "bg-aveon-muted",
};
const TEXT: Record<Tone, string> = {
  open: "text-aveon-buy",
  pre: "text-amber-500",
  closed: "text-aveon-sell",
  unknown: "text-aveon-muted",
};

export default function MarketStatusBar() {
  const { data, error, loading, reload } = usePolledData<unknown>("/market-status", 60_000);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const byCode = new Map<string, { code: string; label: string; status: string; tone: Tone; updated: string }>();
  for (const row of extractList<RawStatus>(data, ["data", "result"])) {
    const code = segmentCode(row.exchangeSegment);
    if (!code) continue;
    const status = String(row.marketStatus ?? "").trim();
    byCode.set(code, {
      code,
      label: SEGMENTS.find((s) => s.code === code)?.label ?? code,
      status: status || "—",
      tone: toneOf(status),
      updated: String(row.lastUpdatedTime ?? "").trim(),
    });
  }
  const order = (code: string) => {
    const i = SEGMENTS.findIndex((s) => s.code === code);
    return i === -1 ? SEGMENTS.length : i;
  };
  const all = Array.from(byCode.values()).sort((a, b) => order(a.code) - order(b.code));
  const primary = all.filter((r) => PRIMARY.includes(r.code));
  const chips = primary.length > 0 ? primary : all.slice(0, 4);

  return (
    <div ref={rootRef} className="relative hidden shrink-0 sm:block">
      <button
        type="button"
        onClick={() => (error && all.length === 0 ? reload() : setOpen((v) => !v))}
        title={error && all.length === 0 ? `Market status unavailable: ${error}. Click to retry.` : "Market status — click for all segments"}
        className="flex h-9 items-center gap-3 px-3 text-[10px] font-medium hover:bg-aveon-panel2"
      >
        {all.length === 0 ? (
          <span className={error ? "text-amber-500" : "text-aveon-muted"}>
            {error ? "Market status unavailable" : loading ? "Market status…" : "Market status"}
          </span>
        ) : (
          chips.map((r) => (
            <span key={r.code} className="flex items-center gap-1.5">
              <span className={clsx("h-1.5 w-1.5 rounded-full", DOT[r.tone])} />
              <span className="text-aveon-muted">{r.code.replace("_", " ")}</span>
              <span className={TEXT[r.tone]}>{r.status}</span>
            </span>
          ))
        )}
      </button>

      {open && all.length > 0 && (
        <div className="absolute bottom-full right-0 z-50 mb-1 w-72 overflow-hidden rounded-md border border-aveon-border bg-aveon-panel shadow-lg">
          <div className="flex items-center justify-between border-b border-aveon-border px-3 py-2">
            <span className="text-xs font-semibold text-aveon-text">Market Status</span>
            <button type="button" onClick={() => reload()} className="text-[10px] text-aveon-muted hover:text-aveon-primary">
              Refresh
            </button>
          </div>
          <ul className="max-h-72 divide-y divide-aveon-border/40 overflow-y-auto">
            {all.map((r) => (
              <li key={r.code} className="flex items-center justify-between gap-3 px-3 py-1.5 text-[11px]">
                <div className="min-w-0">
                  <div className="truncate text-aveon-text">{r.label}</div>
                  {r.updated && <div className="text-[10px] text-aveon-muted">{r.updated}</div>}
                </div>
                <span className={clsx("flex shrink-0 items-center gap-1.5 font-medium", TEXT[r.tone])}>
                  <span className={clsx("h-1.5 w-1.5 rounded-full", DOT[r.tone])} />
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
          {error && <div className="border-t border-aveon-border px-3 py-1.5 text-[10px] text-amber-500">Last refresh failed: {error}</div>}
        </div>
      )}
    </div>
  );
}
