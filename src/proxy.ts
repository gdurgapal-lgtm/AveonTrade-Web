import { NextRequest, NextResponse } from "next/server";

// Match whatever cookie name your session utility sets (e.g., "aveon_session" or check your .env.local)
const SESSION_COOKIE_NAME = "aveon_session";

const PUBLIC_PATHS = [
  "/login",
  "/forgot-password",
  "/api/auth/login",
  "/api/auth/request-otp",
  "/api/auth/verify-totp",
  "/api/auth/me",
  "/api/auth/forgot-password/send-otp",
  "/api/auth/forgot-password/verify-otp",
  "/api/auth/forgot-password/reset",
  "/api/market-data/history",
];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic =
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon");

  if (isPublic) return NextResponse.next();

  const hasSession = req.cookies.has(SESSION_COOKIE_NAME);

  if (!hasSession && pathname !== "/login") {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (hasSession && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};