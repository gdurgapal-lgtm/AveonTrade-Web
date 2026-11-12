"use client";

import { Pencil, Plus, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { useWorkspace } from "@/hooks/useWorkspace";
import MarketStatusBar from "@/components/market/MarketStatusBar";

export default function WorkspaceBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { workspaces, activeId, setActiveId, addWorkspace, renameWorkspace, removeWorkspace } = useWorkspace();

  function openWorkspace(id: string) {
    setActiveId(id);
    // A workspace is a terminal layout. Until other layouts are added, every
    // new/switch workspace starts from Market Watch, matching the terminal UX.
    if (pathname !== "/market-watch") router.push("/market-watch");
  }

  function renameCurrentWorkspace(workspace: { id: string; name: string }) {
    const name = window.prompt("Rename workspace", workspace.name);
    if (name?.trim()) renameWorkspace(workspace.id, name);
  }

  function createWorkspace() {
    const workspace = addWorkspace();
    router.push("/market-watch");
    // Keep the event-driven state as the source of truth; this timeout only
    // gives Next.js a clean navigation boundary after creating the workspace.
    window.setTimeout(() => setActiveId(workspace.id), 0);
  }

  return (
    <div className="flex h-9 shrink-0 items-center border-t border-aveon-border bg-aveon-panel px-2">
      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
        {workspaces.map((workspace) => {
          const active = workspace.id === activeId;
          return (
            <div
              key={workspace.id}
              className={clsx(
                "group flex min-w-[112px] shrink-0 items-center border-r border-aveon-border/70",
                active ? "bg-aveon-panel2" : "bg-aveon-panel"
              )}
            >
              <button
                type="button"
                onClick={() => openWorkspace(workspace.id)}
                onDoubleClick={() => renameCurrentWorkspace(workspace)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  renameCurrentWorkspace(workspace);
                }}
                title="Click to open. Double-click or right-click to rename."
                className={clsx(
                  "flex h-full min-w-0 flex-1 items-center px-3 text-left text-[11px] font-medium",
                  active ? "text-aveon-primary" : "text-aveon-muted hover:bg-aveon-panel2 hover:text-aveon-text"
                )}
              >
                <span className="truncate">{workspace.name}</span>
              </button>
              <button
                type="button"
                title={`Rename ${workspace.name}`}
                onClick={() => renameCurrentWorkspace(workspace)}
                className="rounded p-1 text-aveon-muted opacity-0 transition group-hover:opacity-100 hover:bg-aveon-border hover:text-aveon-text"
              >
                <Pencil size={11} />
              </button>
              {workspaces.length > 1 && (
                <button
                  type="button"
                  title={`Close ${workspace.name}`}
                  onClick={() => removeWorkspace(workspace.id)}
                  className="mr-1 rounded p-1 text-aveon-muted opacity-0 transition group-hover:opacity-100 hover:bg-aveon-border hover:text-aveon-text"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={createWorkspace}
          title="Create new workspace"
          className="flex h-full shrink-0 items-center px-3 text-aveon-muted hover:bg-aveon-panel2 hover:text-aveon-primary"
        >
          <Plus size={14} />
        </button>
      </div>
      <MarketStatusBar />
      <span className="hidden shrink-0 px-2 text-[10px] text-aveon-muted sm:block">Workspace</span>
    </div>
  );
}
