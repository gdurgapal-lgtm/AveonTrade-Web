/**
 * Shares an identical browser SSE subscription between mounted panels.
 * Different token/depth/trace URLs remain isolated.
 */
type SharedEntry = { source: EventSource; subscribers: number };

const sharedSources = new Map<string, SharedEntry>();

export function acquireSharedMarketEventSource(url: string): EventSource {
  const existing = sharedSources.get(url);
  if (existing) {
    existing.subscribers += 1;
    return existing.source;
  }

  const source = new EventSource(url, { withCredentials: true });
  sharedSources.set(url, { source, subscribers: 1 });
  return source;
}

export function releaseSharedMarketEventSource(url: string, source: EventSource): void {
  const entry = sharedSources.get(url);
  // Ignore stale cleanup from an older source after a reconnect/replacement.
  if (!entry || entry.source !== source) return;

  entry.subscribers -= 1;
  if (entry.subscribers <= 0) {
    sharedSources.delete(url);
    source.close();
  }
}
