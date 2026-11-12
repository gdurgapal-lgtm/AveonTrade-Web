"use client";

import { useCallback, useEffect, useState } from "react";
import {
  OE_DEFAULTS_EVENT,
  OE_DEFAULTS_STORAGE_KEY,
  loadOeDefaults,
  saveOeDefaults,
  type OeDefaultsMap,
  type OeSegmentDefaults,
} from "@/lib/oeDefaults";

/** Reactive access to the per-exchange Order Entry defaults (used by the Settings page). */
export function useOeDefaults() {
  const [defaults, setDefaults] = useState<OeDefaultsMap>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const load = () => { setDefaults(loadOeDefaults()); setReady(true); };
    const onStorage = (e: StorageEvent) => { if (e.key === OE_DEFAULTS_STORAGE_KEY) load(); };
    load();
    window.addEventListener(OE_DEFAULTS_EVENT, load);
    window.addEventListener("storage", onStorage); // other tabs
    return () => {
      window.removeEventListener(OE_DEFAULTS_EVENT, load);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  /** Set one field for one exchange; pass `undefined` to go back to the app default. */
  const setField = useCallback(<K extends keyof OeSegmentDefaults>(segmentKey: string, field: K, value: OeSegmentDefaults[K] | undefined) => {
    const current = loadOeDefaults();
    const next: OeSegmentDefaults = { ...(current[segmentKey] ?? {}) };
    if (value === undefined) delete next[field]; else next[field] = value;
    const map = { ...current };
    if (Object.keys(next).length) map[segmentKey] = next; else delete map[segmentKey];
    saveOeDefaults(map);
  }, []);

  const resetSegment = useCallback((segmentKey: string) => {
    const map = { ...loadOeDefaults() };
    delete map[segmentKey];
    saveOeDefaults(map);
  }, []);

  const resetAll = useCallback(() => saveOeDefaults({}), []);

  return { defaults, ready, setField, resetSegment, resetAll };
}
