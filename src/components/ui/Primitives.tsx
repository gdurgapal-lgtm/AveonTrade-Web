"use client";

import clsx from "clsx";
import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("card p-4", className)}>{children}</div>;
}

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "buy" | "sell" | "ghost" }) {
  const styles: Record<string, string> = {
    primary: "bg-aveon-primary hover:bg-blue-600 text-white",
    buy: "bg-aveon-buy hover:bg-green-600 text-white",
    sell: "bg-aveon-sell hover:bg-red-600 text-white",
    ghost: "bg-transparent border border-aveon-border text-aveon-text hover:bg-aveon-panel2",
  };
  return (
    <button
      className={clsx(
        "rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed",
        styles[variant],
        className
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "w-full rounded-lg bg-aveon-panel2 border border-aveon-border px-3 py-2 text-sm text-aveon-text outline-none focus:border-aveon-primary",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={clsx(
        "w-full rounded-lg bg-aveon-panel2 border border-aveon-border px-3 py-2 text-sm text-aveon-text outline-none focus:border-aveon-primary",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "buy" | "sell" | "warn" }) {
  const tones: Record<string, string> = {
    neutral: "bg-aveon-panel2 text-aveon-text",
    buy: "bg-aveon-buy/15 text-aveon-buy",
    sell: "bg-aveon-sell/15 text-aveon-sell",
    warn: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  };
  return <span className={clsx("rounded px-2 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center text-aveon-muted">
      <p className="text-sm font-medium text-aveon-text">{title}</p>
      {subtitle && <p className="mt-1 text-xs">{subtitle}</p>}
    </div>
  );
}

export function ComingSoon({ feature }: { feature: string }) {
  return (
    <Card className="flex flex-col items-center justify-center gap-2 py-24 text-center">
      <p className="text-lg font-semibold">{feature}</p>
      <p className="max-w-md text-sm text-aveon-muted">
        This module is scaffolded (route, layout, nav entry) but the screen logic hasn&apos;t been
        ported from the Flutter source yet. Wire it up to the endpoints already defined in{" "}
        <code className="rounded bg-aveon-panel2 px-1">src/lib/endpoints.ts</code>.
      </p>
    </Card>
  );
}
