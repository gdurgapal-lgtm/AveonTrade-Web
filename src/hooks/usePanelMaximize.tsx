"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Gives any panel its own maximize/restore control, independent of every
 * other panel — same portal-to-document.body approach already proven in
 * BottomPanel.tsx (opaque backdrop + very high z-index, so stacking-context
 * quirks from any ancestor can't cause bleed-through).
 *
 * Usage:
 *   const { maximized, toggle, Portal } = usePanelMaximize();
 *   <button onClick={toggle}>{maximized ? <Minimize2/> : <Maximize2/>}</button>
 *   <Portal><div className="h-full w-full ...">...panel content...</div></Portal>
 *
 * Portal renders children in place when not maximized, and fullscreen via
 * a portal when maximized — the panel's own JSX doesn't need an `if` split.
 *
 * Options:
 *   size: "full" (default) fills the screen.
 *         "half" opens a centered window about half the screen wide and as tall
 *         as its content (capped to the screen); clicking outside it restores.
 */
export function usePanelMaximize(options?: { size?: "full" | "half" }) {
  const size = options?.size ?? "full";
  const [maximized, setMaximized] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Restore with Escape, matching common window-management expectations.
  useEffect(() => {
    if (!maximized) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMaximized(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [maximized]);

  function toggle() {
    setMaximized((v) => !v);
  }

  // Keep the Portal component identity stable while the parent re-renders.
  // Market quotes update frequently; recreating Portal on every render causes
  // React to unmount/remount the whole WatchlistSidebar, which makes the
  // symbol-search input lose focus and appear to refresh while typing.
  const Portal = React.useMemo(
    () =>
      function StablePanelPortal({ children }: { children: React.ReactNode }) {
        if (!maximized) return <>{children}</>;
        if (!mounted) return null;
        if (size === "half") {
          return createPortal(
            <>
              <div className="fixed inset-0 z-[2147483646] bg-black/70" />
              <div
                className="fixed inset-0 z-[2147483647] flex items-center justify-center p-4"
                onMouseDown={(e) => {
                  // Click on the dimmed area outside the window restores the panel.
                  if (e.target === e.currentTarget) setMaximized(false);
                }}
              >
                <div
                  className="flex max-h-full min-h-0 flex-col"
                  style={{ width: "min(max(50vw, 560px), 100%)" }}
                >
                  {children}
                </div>
              </div>
            </>,
            document.body
          );
        }
        return createPortal(
          <>
            <div className="fixed inset-0 z-[2147483646] bg-aveon-bg/95" />
            <div className="fixed inset-0 z-[2147483647] p-4">{children}</div>
          </>,
          document.body
        );
      },
    [maximized, mounted, size]
  );

  return { maximized, toggle, Portal };
}
