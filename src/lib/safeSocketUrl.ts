/**
 * Only connect to public https/wss hosts — the message-socket URL is stored in a
 * cookie and comes from a login response, so it is never trusted blindly.
 * Returns an https URL (socket.io-client's websocket transport upgrades it to wss).
 */
export function toSafeSocketUrl(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(value) ? value : `wss://${value}`);
    if (url.protocol !== "wss:" && url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    const isPrivate =
      host === "localhost" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host === "[::1]" ||
      host === "::1" ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    if (isPrivate) return null;
    url.protocol = "https:";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}
