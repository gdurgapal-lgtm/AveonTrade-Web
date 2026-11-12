"use client";

import { useEffect } from "react";

export default function HotkeyManager() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Block F1 (Browser Help)
      if (e.key === "F1") {
        e.preventDefault();
        console.log("[AveonTrade] F1 intercepted and blocked.");
        // TODO: Trigger your custom app action here if needed (e.g., Quick Help / Buy Modal)
        return;
      }

      // 2. Block F5 and Ctrl+R (Full Page Refresh)
      if (e.key === "F5" || (e.ctrlKey && e.key.toLowerCase() === "r")) {
        e.preventDefault();
        console.log("[AveonTrade] Page refresh blocked to protect active terminal state.");
        // TODO: Trigger a soft market data re-fetch instead of reloading the page
        return;
      }

      // 3. ALLOW your custom trading hotkeys to function normally
      // Add any specific custom keys you use (e.g., F2, F3, Alt+B, etc.)
      const allowedCustomKeys = ["F2", "F3", "F4", "F9", "F10"];
      if (allowedCustomKeys.includes(e.key)) {
        // Do NOT call e.preventDefault() here so your app's internal listeners catch them!
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return null;
}