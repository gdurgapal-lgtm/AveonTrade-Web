"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "info";
type Toast = { id: number; message: string; type: ToastType };

/**
 * Shows the messages other parts of the app announce with
 *   window.dispatchEvent(new CustomEvent("aveon:toast", { detail: { message, type } }))
 * (chart mouse trading, for example). Until now nothing listened for that event, so
 * both successes and errors were invisible.
 */
export default function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    const timers = new Set<number>();
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: unknown; type?: unknown }>).detail;
      const message = String(detail?.message ?? "").trim();
      if (!message) return;
      const type: ToastType = detail?.type === "error" || detail?.type === "success" ? detail.type : "info";
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-3), { id, message, type }]);
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        dismiss(id);
      }, type === "error" ? 8000 : 5000);
      timers.add(timer);
    };
    window.addEventListener("aveon:toast", onToast);
    return () => {
      window.removeEventListener("aveon:toast", onToast);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-12 right-4 z-[2147483647] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = toast.type === "success" ? CheckCircle2 : toast.type === "error" ? AlertTriangle : Info;
        const tone = toast.type === "success" ? "border-aveon-buy/50 text-aveon-buy" : toast.type === "error" ? "border-aveon-sell/50 text-aveon-sell" : "border-aveon-border text-aveon-primary";
        return (
          <div key={toast.id} role="status" className={`pointer-events-auto flex items-start gap-2 rounded-lg border bg-aveon-panel px-3 py-2.5 text-[13px] shadow-2xl ${tone}`}>
            <Icon size={16} className="mt-0.5 shrink-0" />
            <span className="flex-1 break-words text-aveon-text">{toast.message}</span>
            <button type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss" className="shrink-0 rounded p-0.5 text-aveon-muted hover:text-aveon-text">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
