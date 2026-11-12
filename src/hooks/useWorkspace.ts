"use client";

import { useEffect, useState } from "react";

export interface Workspace {
  id: string;
  name: string;
}

const STORAGE_KEY = "aveon_workspaces_v1";
const ACTIVE_KEY = "aveon_active_workspace_v1";
const CHANGE_EVENT = "aveon-workspace-change";

const DEFAULT_WORKSPACES: Workspace[] = [{ id: "wrk_1", name: "Wrk#1" }];

function normalize(value: unknown): Workspace[] {
  if (!Array.isArray(value)) return DEFAULT_WORKSPACES;
  const rows = value
    .filter((item): item is Workspace => !!item && typeof item === "object" && typeof (item as any).id === "string")
    .map((item, index) => ({
      id: String(item.id),
      name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : `Wrk#${index + 1}`,
    }));
  return rows.length ? rows : DEFAULT_WORKSPACES;
}

function notify() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useWorkspace() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(DEFAULT_WORKSPACES);
  const [activeId, setActiveIdState] = useState(DEFAULT_WORKSPACES[0].id);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const load = () => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        const rows = raw ? normalize(JSON.parse(raw)) : DEFAULT_WORKSPACES;
        const storedActive = window.localStorage.getItem(ACTIVE_KEY);
        const active = rows.some((row) => row.id === storedActive) ? storedActive! : rows[0].id;
        setWorkspaces(rows);
        setActiveIdState(active);
      } catch {
        setWorkspaces(DEFAULT_WORKSPACES);
        setActiveIdState(DEFAULT_WORKSPACES[0].id);
      } finally {
        setReady(true);
      }
    };

    load();
    window.addEventListener(CHANGE_EVENT, load);
    return () => window.removeEventListener(CHANGE_EVENT, load);
  }, []);

  function persist(rows: Workspace[]) {
    setWorkspaces(rows);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    } catch {
      /* UI state still updates if storage is unavailable. */
    }
  }

  function setActiveId(id: string) {
    if (!workspaces.some((row) => row.id === id)) return;
    setActiveIdState(id);
    try {
      window.localStorage.setItem(ACTIVE_KEY, id);
    } catch {
      /* ignore storage failures */
    }
    notify();
  }

  function addWorkspace() {
    const id = `wrk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const nextNumber = workspaces.length + 1;
    const workspace = { id, name: `Wrk#${nextNumber}` };
    persist([...workspaces, workspace]);
    try {
      window.localStorage.setItem(ACTIVE_KEY, id);
    } catch {
      /* ignore storage failures */
    }
    setActiveIdState(id);
    notify();
    return workspace;
  }

  function renameWorkspace(id: string, name: string) {
    const clean = name.trim();
    if (!clean) return;
    persist(workspaces.map((row) => (row.id === id ? { ...row, name: clean } : row)));
    notify();
  }

  function removeWorkspace(id: string) {
    if (workspaces.length <= 1) return;
    const next = workspaces.filter((row) => row.id !== id);
    const nextActive = activeId === id ? next[Math.max(0, next.findIndex((row) => row.id !== id))]?.id ?? next[0].id : activeId;
    persist(next);
    setActiveIdState(nextActive);
    try {
      window.localStorage.setItem(ACTIVE_KEY, nextActive);
    } catch {
      /* ignore storage failures */
    }
    notify();
  }

  return { workspaces, activeId, setActiveId, addWorkspace, renameWorkspace, removeWorkspace, ready };
}
