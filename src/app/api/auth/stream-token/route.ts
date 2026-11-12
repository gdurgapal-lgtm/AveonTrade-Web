import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";

/**
 * The Flutter app keeps `SessionManager.accessToken` in memory and hands it
 * straight to the socket.io client (see
 * synapse_message_stream_service.dart#startFromSession). On the web, the
 * access token normally never leaves the server (httpOnly cookie). Live
 * quotes are the one exception: the browser has to open the WebSocket
 * itself, so this route mints that same token for the *read-only* broadcast
 * connection only. It is never used for order placement.
 */
export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ token: null }, { status: 401 });
  }
  return NextResponse.json({ token: session.accessToken });
}