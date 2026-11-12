"use client";

import { useState, useEffect } from "react";

export interface DrawingItem {
  id: string;
  tool: string;
  points: { x: number; y: number }[];
  color?: string;
}

const DRAWINGS_STORAGE_KEY = "aveon.chart.drawings.v1";

export function useChartDrawings(symbol: string) {
  const [drawings, setDrawings] = useState<DrawingItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem(`${DRAWINGS_STORAGE_KEY}.${symbol}`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(`${DRAWINGS_STORAGE_KEY}.${symbol}`, JSON.stringify(drawings));
    } catch {}
  }, [drawings, symbol]);

  function addDrawing(drawing: DrawingItem) {
    setDrawings((prev) => [...prev, drawing]);
  }

  function clearDrawings() {
    setDrawings([]);
    try {
      localStorage.removeItem(`${DRAWINGS_STORAGE_KEY}.${symbol}`);
    } catch {}
  }

  return { drawings, addDrawing, clearDrawings };
}