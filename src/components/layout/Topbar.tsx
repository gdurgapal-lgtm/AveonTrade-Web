"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/lib/authStore";
import MarketIndexStrip from "@/components/market/MarketIndexStrip";
import ThemeToggle from "@/components/theme/ThemeToggle";

export default function Topbar() {
  const { refresh } = useAuthStore();

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <header className="flex shrink-0 items-center justify-between border-b border-aveon-border bg-aveon-panel px-4 py-1.5">
      <div className="min-w-0 flex-1 overflow-x-auto">
        <MarketIndexStrip />
      </div>
      <div className="flex items-center pl-3">
        <ThemeToggle />
      </div>
    </header>
  );
}