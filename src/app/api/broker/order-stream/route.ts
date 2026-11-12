import { NextRequest } from "next/server";
import { readSession } from "@/lib/session";
import { getOrderStream, orderStreamUnavailableReason } from "@/server/orderStreamManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await readSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const unavailable = orderStreamUnavailableReason(session);
  const conn = unavailable ? null : getOrderStream(session);
  if (!conn) {
    return Response.json({ error: unavailable ?? "Order stream unavailable." }, { status: 409 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* controller already closed */
        }
      };

      const onMessage = (kind: "order" | "trade", message: unknown) => send(kind, message);
      const onStatus = (status: unknown) => send("status", status);
      const onClosed = () => cleanup();
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          cleanup();
        }
      }, 20_000);

      function cleanup() {
        if (closed) return;
        closed = true;
        clearInterval(keepAlive);
        conn!.emitter.off("message", onMessage);
        conn!.emitter.off("status", onStatus);
        conn!.emitter.off("closed", onClosed);
        conn!.release();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }

      conn.retain();
      conn.emitter.on("message", onMessage);
      conn.emitter.on("status", onStatus);
      conn.emitter.on("closed", onClosed);
      send("status", { state: conn.state });

      req.signal.addEventListener("abort", cleanup);
    },
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