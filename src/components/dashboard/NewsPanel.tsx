"use client";

import { Card } from "@/components/ui/Primitives";
import { usePolledData } from "@/hooks/usePolledData";
import { Endpoints } from "@/lib/endpoints";

interface NoticeItem {
  notice_id?: string | number;
  notice_title?: string;
  notice_desc?: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Wired to the real broker endpoint (/nontransactional/v1/addendumAndNotices).
 * Confirmed field names from a live response: notice_id, notice_title,
 * notice_desc (HTML string — stripped for the preview here).
 */
export default function NewsPanel() {
  const notices = usePolledData<NoticeItem[]>(Endpoints.notices.list, 60_000);

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">News &amp; Updates</h2>
      </div>

      {notices.loading ? (
        <p className="text-xs text-aveon-muted">Loading…</p>
      ) : notices.error ? (
        <p className="text-xs text-aveon-muted">No updates available right now.</p>
      ) : (notices.data ?? []).length === 0 ? (
        <p className="text-xs text-aveon-muted">No news or notices at the moment.</p>
      ) : (
        <ul className="space-y-3">
          {(notices.data ?? []).slice(0, 5).map((n, i) => (
            <li key={n.notice_id ?? i} className="border-b border-aveon-border/50 pb-3 last:border-0 last:pb-0">
              <p className="text-sm text-aveon-text">{n.notice_title ?? "Untitled notice"}</p>
              {n.notice_desc && (
                <p className="mt-0.5 line-clamp-2 text-xs text-aveon-muted">{stripHtml(n.notice_desc)}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
