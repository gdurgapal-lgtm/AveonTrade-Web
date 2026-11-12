"use client";

import { useEffect } from "react";

/**
 * Blocks the browser's native right-click menu (Back / Save as / Print /
 * Translate / Inspect ...) everywhere in the app.
 *
 * It only calls preventDefault() and never stops propagation, and it listens
 * on `window` in the capture phase so it runs first. Custom right-click
 * features keep working because their own handlers still fire:
 *   - workspace tab rename (WorkspaceBar)
 *   - right-click SELL in market depth with mouse trading (MarketDepth)
 *   - right-click order placement on the chart (PriceChart)
 *
 * Note: this only hides the menu. It is a UI nicety, not a security control;
 * DevTools still opens with F12 / Ctrl+Shift+I.
 */
export default function DisableContextMenu() {
  useEffect(() => {
    const block = (event: MouseEvent) => event.preventDefault();
    window.addEventListener("contextmenu", block, { capture: true });
    return () => window.removeEventListener("contextmenu", block, { capture: true });
  }, []);

  return null;
}
