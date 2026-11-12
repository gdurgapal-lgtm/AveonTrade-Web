"use client";

import { formatCurrency, pnlTone } from "@/lib/format";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

export default function DashboardHero({
  userName,
  portfolioValue,
  unrealizedPnl,
  availableBalance,
  usedMargin,
}: {
  userName: string;
  portfolioValue: number;
  unrealizedPnl: number;
  availableBalance: number;
  usedMargin: number;
}) {
  const tone = pnlTone(unrealizedPnl);
  const toneClass = tone === "buy" ? "text-aveon-buy" : tone === "sell" ? "text-aveon-sell" : "text-aveon-text";

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
      {/* Greeting hero */}
      <div className="card relative overflow-hidden p-6">
        <svg
          className="pointer-events-none absolute -right-6 -bottom-6 h-40 w-40 opacity-[0.08]"
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M20 26c-4-4-10-4-13 0-2 3-1 7 2 9l7 4-2 8c-1 4 2 8 6 8h24c4 0 7-4 6-8l-2-8 7-4c3-2 4-6 2-9-3-4-9-4-13 0l-3 3H23l-3-3Z"
            stroke="currentColor"
            strokeWidth="2"
            className="text-aveon-primary"
          />
          <circle cx="24" cy="34" r="2" fill="currentColor" className="text-aveon-primary" />
          <circle cx="40" cy="34" r="2" fill="currentColor" className="text-aveon-primary" />
        </svg>
        <p className="text-sm text-aveon-muted">{greeting()},</p>
        <p className="mt-1 text-2xl font-semibold text-aveon-text">
          {userName} <span aria-hidden>👋</span>
        </p>
        <p className="mt-2 text-sm text-aveon-muted">
          Track, trade and grow your wealth with confidence.
        </p>
      </div>

      <StatCard label="Portfolio Value" value={formatCurrency(portfolioValue)} />
      <StatCard label="Unrealized P&L" value={formatCurrency(unrealizedPnl)} valueClassName={toneClass} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
        <StatCard label="Available Balance" value={formatCurrency(availableBalance)} compact />
        <StatCard label="Used Margin" value={formatCurrency(usedMargin)} compact />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  valueClassName,
  compact,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  compact?: boolean;
}) {
  return (
    <div className={`card flex flex-col justify-center ${compact ? "p-3" : "p-4"}`}>
      <p className="text-xs text-aveon-muted">{label}</p>
      <p className={`mt-1.5 font-semibold ${compact ? "text-base" : "text-xl"} ${valueClassName ?? "text-aveon-text"}`}>
        {value}
      </p>
    </div>
  );
}
