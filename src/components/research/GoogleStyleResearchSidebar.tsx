"use client";

import { useState, useEffect } from "react";
import { Sparkles, Send, ArrowRight, Settings } from "lucide-react";

interface ResearchSidebarProps {
  activeSymbol?: string;
  userName?: string;
  messages: Array<{ role: 'user' | 'assistant'; text: string }>;
  setMessages: React.Dispatch<React.SetStateAction<Array<{ role: 'user' | 'assistant'; text: string }>>>;
  timeframe?: string;
  activeQuote?: { ltp?: number; change?: number; change_percent?: number; volume?: number } | null;
  overlays?: {
    emaPeriods?: number[];
    smaPeriods?: number[];
    vwap?: boolean;
    supertrend?: boolean;
    cpr?: boolean;
    bollingerPeriod?: number;
    rsiPeriod?: number;
    macd?: boolean;
    atr?: boolean;
    dmi?: boolean;
  };
}

export default function GoogleStyleResearchSidebar({ 
  activeSymbol = "MARKET", 
  userName,
  messages,
  setMessages,
  timeframe = "5m",
  activeQuote = null,
  overlays = {}
}: ResearchSidebarProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [userApiKey, setUserApiKey] = useState(() => {
    if (typeof window !== "undefined") {
      return window.localStorage.getItem("aveon_user_gemini_key") || "";
    }
    return "";
  });

  // Dynamic profile name state (falls back to saved profile name or "Trader")
  const [displayName, setDisplayName] = useState(userName || "Trader");

  useEffect(() => {
    if (userName) {
      setDisplayName(userName);
      return;
    }
    // Try to read profile info from localStorage or app profile API if cached
    try {
      const cachedProfile = window.localStorage.getItem("aveon.user.profile");
      if (cachedProfile) {
        const parsed = JSON.parse(cachedProfile);
        if (parsed?.name || parsed?.username) {
          setDisplayName(parsed.name || parsed.username);
        }
      }
    } catch {}
  }, [userName]);

  function saveApiKey(key: string) {
    setUserApiKey(key);
    window.localStorage.setItem("aveon_user_gemini_key", key);
    setShowSettings(false);
  }

  const suggestions = [
    `Analyze breakout setups and indicators for ${activeSymbol}.`,
    `What are the key resistance and support levels for ${activeSymbol}?`,
    `Give me an Intraday vs Delivery outlook for ${activeSymbol}.`,
  ];

  async function handleSend(customPrompt?: string) {
    const textToSend = customPrompt || query;
    if (!textToSend.trim()) return;

    const newMessages = [...messages, { role: 'user' as const, text: textToSend }];
    setMessages(newMessages);
    if (!customPrompt) setQuery("");
    setLoading(true);

    const activeIndicators: string[] = [];
    if (overlays.emaPeriods?.length) activeIndicators.push(`EMA (${overlays.emaPeriods.join(", ")})`);
    if (overlays.smaPeriods?.length) activeIndicators.push(`SMA (${overlays.smaPeriods.join(", ")})`);
    if (overlays.vwap) activeIndicators.push("VWAP");
    if (overlays.supertrend) activeIndicators.push("Supertrend");
    if (overlays.cpr) activeIndicators.push("CPR");
    if (overlays.bollingerPeriod) activeIndicators.push("Bollinger Bands");
    if (overlays.rsiPeriod) activeIndicators.push("RSI");
    if (overlays.macd) activeIndicators.push("MACD");
    if (overlays.atr) activeIndicators.push("ATR");
    if (overlays.dmi) activeIndicators.push("ADX/DMI");

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          query: textToSend, 
          symbol: activeSymbol,
          apiKey: userApiKey.trim() || undefined,
          technicals: {
            timeframe,
            ltp: activeQuote?.ltp || "N/A",
            activeIndicators: activeIndicators.join(", ") || "Standard Price Action"
          }
        }),
      });
      const data = await res.json();
      setMessages([...newMessages, { role: 'assistant', text: data.insight || data.message || "Analysis complete." }]);
    } catch {
      setMessages([...newMessages, { role: 'assistant', text: "Failed to connect to research service." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-80 h-full flex flex-col border-l border-aveon-border bg-aveon-panel font-mono text-xs select-none relative">
      <div className="flex items-center justify-between px-4 py-3 border-b border-aveon-border">
        <div>
          <h3 className="font-bold text-aveon-text text-sm">Research</h3>
          <span className="text-[10px] text-aveon-primary">Context: {activeSymbol}</span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="text-aveon-muted hover:text-aveon-text p-1 rounded transition"
            title="API Key Settings"
          >
            <Settings size={14} />
          </button>
          <Sparkles size={15} className="text-aveon-primary" />
        </div>
      </div>

      {showSettings && (
        <div className="absolute inset-0 bg-aveon-panel z-30 p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-aveon-border pb-2">
            <h4 className="font-bold text-aveon-text">Gemini API Key</h4>
            <button onClick={() => setShowSettings(false)} className="text-xs text-aveon-muted hover:text-aveon-text">✕</button>
          </div>
          <p className="text-[11px] text-aveon-muted">
            Provide your own Google Gemini API key to power the research copilot. Saved locally in your browser.
          </p>
          <input
            type="password"
            placeholder="AIzaSy..."
            value={userApiKey}
            onChange={(e) => setUserApiKey(e.target.value)}
            className="w-full rounded border border-aveon-border bg-aveon-panel2 px-2.5 py-1.5 text-xs text-aveon-text outline-none focus:border-aveon-primary"
          />
          <button
            onClick={() => saveApiKey(userApiKey)}
            className="w-full rounded bg-aveon-primary py-1.5 text-xs font-semibold text-white hover:opacity-90 transition"
          >
            Save Key
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <>
            <div>
              <p className="text-sm font-semibold text-aveon-text">Hi {displayName}, ask any breakout or indicator question</p>
            </div>

            <div className="space-y-2">
              {suggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(suggestion)}
                  className="w-full text-left p-2.5 rounded-lg border border-aveon-border bg-aveon-panel2 text-aveon-muted hover:text-aveon-text hover:border-aveon-primary transition flex items-center justify-between group"
                >
                  <span className="truncate pr-2">{suggestion}</span>
                  <ArrowRight size={13} className="shrink-0 opacity-0 group-hover:opacity-100 text-aveon-primary transition" />
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`p-3 rounded-lg ${m.role === 'user' ? 'bg-aveon-panel2 text-aveon-text ml-4' : 'bg-aveon-primary/10 border border-aveon-primary/30 text-aveon-text mr-4'}`}>
                <p className="text-[10px] font-bold text-aveon-muted mb-1">{m.role === 'user' ? displayName : `Aveon Copilot (${activeSymbol})`}</p>
                
                {/* Full multi-line markdown cleaner */}
                <div className="leading-relaxed whitespace-pre-wrap space-y-1">
                  {m.text.split('\n').map((line, idx) => {
                    const cleanLine = line.replace(/#{1,6}\s?/g, '').replace(/\*\*/g, '');
                    if (!cleanLine.trim()) return <div key={idx} className="h-1" />;
                    return <p key={idx}>{cleanLine}</p>;
                  })}
                </div>
              </div>
            ))}
            {loading && <p className="text-aveon-muted animate-pulse">Analyzing technical indicators & breakout triggers for {activeSymbol}…</p>}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-aveon-border bg-aveon-panel2">
        <div className="relative flex items-center">
          <input
            type="text"
            placeholder={`Ask about ${activeSymbol} breakout...`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            className="w-full rounded-full border border-aveon-border bg-aveon-panel py-2 pl-3 pr-10 text-xs text-aveon-text outline-none focus:border-aveon-primary"
          />
          <button
            onClick={() => handleSend()}
            disabled={loading || !query.trim()}
            className="absolute right-1.5 p-1.5 rounded-full bg-aveon-primary text-white hover:opacity-90 disabled:opacity-40 transition"
          >
            <Send size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}