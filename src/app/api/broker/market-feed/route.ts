import { NextRequest } from "next/server";
import { readSession } from "@/lib/session";
import { getFeedConnection } from "@/server/marketFeedManager";

// Needs a real Node.js process (persistent WebSocket + module-level state) —
// not the edge runtime.
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await readSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const tokens = [...new Set((req.nextUrl.searchParams.get("tokens") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => /^\d+_[A-Za-z0-9-]+$/.test(t)))];
  const requestedDepthToken = req.nextUrl.searchParams.get("depthToken")?.trim() || null;
  const requestedDepthTokens = (req.nextUrl.searchParams.get("depthTokens") ?? "")
    .split(",").map((t) => t.trim()).filter((t) => /^\d+_[A-Za-z0-9-]+$/.test(t));
  const depthTokens = [...new Set([...(requestedDepthToken && /^\d+_[A-Za-z0-9-]+$/.test(requestedDepthToken) ? [requestedDepthToken] : []), ...requestedDepthTokens])];
  const trace = req.nextUrl.searchParams.get("trace")?.trim() || "";

  if (tokens.length === 0) {
    return new Response("No tokens requested", { status: 400 });
  }

  let conn;
  try {
    conn = await getFeedConnection(session);
  } catch (err: any) {
    return new Response(`Feed connection failed: ${err?.message ?? "unknown error"}`, { status: 502 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let keepAlive: ReturnType<typeof setInterval> | undefined;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); }
        catch { /* controller already closed */ }
      };
      const requestedTokenSet = new Set([...tokens, ...depthTokens]);
      const onTick = (payload: unknown) => {
        if (!payload || typeof payload !== "object") return;
        const record = payload as Record<string, unknown>;
        const segment = record.mktSegId ?? record.marketSegmentId ?? record["1"];
        const token = record.token ?? record.scripToken ?? record["7"];
        if (segment === undefined || token === undefined) return;
        const key = `${String(segment)}_${String(token)}`;
        if (!requestedTokenSet.has(key)) return;

        send("tick", payload);
        if (trace && tokens.includes(key)) {
          send("trace", {
            key, token, mktSegId: segment,
            ltp: record.ltp, bidPrice: record.bidPrice, bidQty: record.bidQty,
            askPrice: record.askPrice, askQty: record.askQty,
            openInterest: record.openInterest, change: record.change,
            changePercent: record.changePercent,
          });
        }
      };
      const onRaw = (raw: string) => send("raw", { raw });
      const onError = (message: string) => send("error", { message });
      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (keepAlive) clearInterval(keepAlive);
        conn.emitter.off("tick", onTick);
        conn.emitter.off("raw", onRaw);
        conn.emitter.off("connection-error", onError);
        conn.emitter.off("closed", onClosed);
        if (trace) conn.disableTrace(tokens);
        void conn.release(tokens).catch(() => {});
        for (const token of depthTokens) void conn.releaseDepth(token).catch(() => {});
      };
      const onClosed = (info: unknown) => {
        send("closed", info);
        cleanup();
        try { controller.close(); } catch { /* already closed */ }
      };

      conn.emitter.on("tick", onTick);
      conn.emitter.on("raw", onRaw);
      conn.emitter.on("connection-error", onError);
      conn.emitter.on("closed", onClosed);
      if (trace) conn.enableTrace(tokens);

      void conn.subscribe(tokens)
        .then(async () => {
          for (const token of depthTokens) await conn.subscribeDepth(token);
        })
        .then(() => send("subscribed", { tokens, depthTokens, trace: trace || undefined }))
        .catch((err) => send("error", { message: err?.message ?? "Subscribe failed" }));

      keepAlive = setInterval(() => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`: ping\n\n`)); }
        catch { cleanup(); }
      }, 20_000);
      try { controller.enqueue(encoder.encode("retry: 3000\n\n")); } catch { /* closed */ }

      req.signal.addEventListener("abort", () => {
        cleanup();
        try { controller.close(); } catch { /* already closed */ }
      }, { once: true });
    },
    cancel() {},
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}