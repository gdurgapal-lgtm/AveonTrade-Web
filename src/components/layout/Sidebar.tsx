"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/authStore";
import ThemeToggle from "@/components/theme/ThemeToggle";
import {
  LayoutDashboard,
  CandlestickChart,
  ListOrdered,
  Briefcase,
  Landmark,
  Wallet,
  UserRound,
  LogOut,
  ChevronsLeft,
  ChevronsRight,
  GitCompareArrows,
  ClipboardList,
  FileText,
  ScanLine,
  BellRing,
  Shield,
  MessageSquare,
  Ban,
  TrendingUp,
  Settings,
} from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/market-watch", label: "Market Watch", icon: CandlestickChart },
  { href: "/market-watch/nifty50", label: "Nifty 50 Analyzer", icon: TrendingUp },
  { href: "/options-chain", label: "Option Chain", icon: GitCompareArrows },
  { href: "/order-cart", label: "Order Cart", icon: ClipboardList },
  { href: "/positions", label: "Positions", icon: Briefcase },
  { href: "/holdings", label: "Holdings", icon: Landmark },
  { href: "/orders", label: "Orders & Trades", icon: ListOrdered },
  { href: "/ipo", label: "IPO", icon: FileText },
  { href: "/funds", label: "Funds", icon: Wallet },
  { href: "/ai-scanner", label: "AI Scanner", icon: ScanLine },
  { href: "/alerts", label: "Alerts", icon: BellRing },
  { href: "/edis", label: "EDIS", icon: Shield },
  { href: "/banned-scrips", label: "Banned Scrips", icon: Ban },
  { href: "/messages", label: "Messages Hub", icon: MessageSquare },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/settings", label: "Settings", icon: Settings },
];

const STORAGE_KEY = "aveon_sidebar_collapsed";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <aside
      className={clsx(
        "sticky top-0 hidden h-screen shrink-0 flex-col overflow-y-auto border-r border-aveon-border bg-aveon-panel transition-[width] duration-150 md:flex",
        collapsed ? "w-16" : "w-60"
      )}
    >
      <div className={clsx("flex items-center gap-2 px-4 py-4", collapsed && "flex-col px-0")}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-aveon-primary font-bold text-white">
          A
        </div>
        {!collapsed && (
          <div className="flex-1">
            <p className="text-sm font-semibold leading-none">
              AVEON<span className="text-aveon-accent">TRADE</span>
            </p>
            <p className="text-[10px] text-aveon-muted">Web Terminal</p>
          </div>
        )}
        <button
          onClick={toggle}
          title={collapsed ? "Expand" : "Collapse"}
          className={clsx(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-aveon-muted hover:bg-aveon-panel2 hover:text-aveon-text",
            collapsed && "mt-1"
          )}
        >
          {collapsed ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 border-t border-aveon-border px-2 py-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={clsx(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                collapsed && "justify-center px-0",
                active
                  ? "bg-aveon-primary/15 text-aveon-primary"
                  : "text-aveon-muted hover:bg-aveon-panel2 hover:text-aveon-text"
              )}
            >
              <Icon size={16} />
              {!collapsed && label}
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-aveon-border p-3">
        <button
          type="button"
          title="Logout"
          onClick={async () => {
            await logout();
            router.push("/login");
          }}
          className={clsx(
            "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-aveon-muted transition hover:bg-aveon-panel2 hover:text-aveon-text",
            collapsed && "justify-center px-0"
          )}
        >
          <LogOut size={16} />
          {!collapsed && "Logout"}
        </button>
      </div>
    </aside>
  );
}