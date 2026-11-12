"use client";

import { useEffect, useState, useRef } from "react";
import { Sun, Moon, Terminal, Palette, Check } from "lucide-react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<string>("aveon-dark");
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const current = localStorage.getItem("aveon-theme") || "aveon-dark";
    setTheme(current);

    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const changeTheme = (newTheme: string) => {
    setTheme(newTheme);
    localStorage.setItem("aveon-theme", newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Icon Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-aveon-border bg-aveon-panel2 text-aveon-muted hover:text-aveon-text transition shadow-sm"
        title="Theme Settings"
      >
        <Palette size={16} />
      </button>

      {/* Google Finance Style Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 rounded-xl border border-aveon-border bg-aveon-panel py-1.5 shadow-2xl z-[9999]">
          <div className="px-3 py-1.5 border-b border-aveon-border mb-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-aveon-muted">
              Theme Preference
            </p>
          </div>

          <button
            type="button"
            onClick={() => changeTheme("aveon-dark")}
            className="flex w-full items-center justify-between px-3 py-2 text-xs text-aveon-text hover:bg-aveon-panel2 transition"
          >
            <span className="flex items-center gap-2">
              <Terminal size={14} className="text-aveon-primary" />
              <span>Aveon Dark</span>
            </span>
            {theme === "aveon-dark" && <Check size={14} className="text-aveon-primary" />}
          </button>

          <button
            type="button"
            onClick={() => changeTheme("dark")}
            className="flex w-full items-center justify-between px-3 py-2 text-xs text-aveon-text hover:bg-aveon-panel2 transition"
          >
            <span className="flex items-center gap-2">
              <Moon size={14} className="text-aveon-primary" />
              <span>Dark</span>
            </span>
            {theme === "dark" && <Check size={14} className="text-aveon-primary" />}
          </button>

          <button
            type="button"
            onClick={() => changeTheme("lite")}
            className="flex w-full items-center justify-between px-3 py-2 text-xs text-aveon-text hover:bg-aveon-panel2 transition"
          >
            <span className="flex items-center gap-2">
              <Sun size={14} className="text-aveon-primary" />
              <span>Lite</span>
            </span>
            {theme === "lite" && <Check size={14} className="text-aveon-primary" />}
          </button>
        </div>
      )}
    </div>
  );
}