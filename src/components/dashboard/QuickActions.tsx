"use client";

import Link from "next/link";
import { CandlestickChart, ListOrdered, Landmark, Briefcase, Wallet, UserRound } from "lucide-react";
import { Card } from "@/components/ui/Primitives";

const ACTIONS = [
  { href: "/market-watch", label: "Market Watch", icon: CandlestickChart, tint: "bg-blue-500/15 text-blue-400" },
  { href: "/orders/new", label: "New Order", icon: ListOrdered, tint: "bg-emerald-500/15 text-emerald-400" },
  { href: "/positions", label: "Positions", icon: Briefcase, tint: "bg-violet-500/15 text-violet-400" },
  { href: "/holdings", label: "Holdings", icon: Landmark, tint: "bg-amber-500/15 text-amber-400" },
  { href: "/funds", label: "Funds", icon: Wallet, tint: "bg-cyan-500/15 text-cyan-400" },
  { href: "/profile", label: "Profile", icon: UserRound, tint: "bg-pink-500/15 text-pink-400" },
];

export default function QuickActions() {
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold">Quick Actions</h2>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {ACTIONS.map(({ href, label, icon: Icon, tint }) => (
          <Link key={href} href={href} className="flex flex-col items-center gap-2 text-center">
            <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tint}`}>
              <Icon size={18} />
            </span>
            <span className="text-[11px] leading-tight text-slate-300">{label}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}
