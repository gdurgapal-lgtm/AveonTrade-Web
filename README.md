# AveonTrade Web

A Next.js 14 (App Router) + TypeScript + Tailwind port of the AveonTrade Flutter
mobile app, talking to the **same broker REST API** you already use on mobile
(`lib/core/config/api_config.dart` → `pre-prod.odinwave.com`).

## Why the architecture differs from the Flutter app

The mobile app could keep `tenantid` / `x-api-key` / access & session tokens in
app memory because it's a compiled binary the user can't inspect at runtime.
A browser tab can't offer that guarantee, so this project moves all of that
to the server:

- **`src/app/api/broker/[...path]/route.ts`** — a single allow-listed proxy.
  The browser calls `/api/broker/<endpoint>` (same-origin, no CORS, no
  exposed host); this route attaches the real headers and forwards to
  `AVEON_BASE_URL` server-side.
- **`src/lib/session.ts`** — tokens live in one httpOnly, Secure cookie. The
  browser never reads them directly.
- **`src/lib/endpoints.ts`** — every REST path used here was pulled directly
  out of your Dart services (`order_service.dart`, `position_service.dart`,
  `auth_service.dart`, etc.), so this hits the exact endpoints your mobile
  app already hits.
- **Live quotes** are the one exception: the Synapsewave broadcast feed
  (`socket.io`, see `synapse_message_stream_service.dart`) is a browser→
  broker WebSocket, so `src/app/api/auth/stream-token/route.ts` mints a
  short-lived read-only token for that connection only — order placement
  never uses it.

## Getting started

```bash
npm install
cp .env.local.example .env.local   # fill in AVEON_API_KEY etc.
npm run dev
```

Open http://localhost:3000 — you'll land on `/login`.

## Module status

| Module | Route | Status |
|---|---|---|
| Auth (password + OTP/TOTP) | `/login` | ✅ wired |
| Dashboard | `/dashboard` | ✅ wired |
| Market Watch (live LTP) | `/market-watch` | ✅ wired (needs `NEXT_PUBLIC_BROADCAST_URL`) |
| Orders — book + cancel | `/orders` | ✅ wired |
| Orders — place regular order | `/orders/new` | ✅ wired |
| Trade Book | `/trades` | ✅ wired |
| Positions — list + square-off | `/positions` | ✅ wired |
| Holdings | `/holdings` | ✅ wired |
| Funds — report + withdrawal | `/funds` | ✅ wired |
| Portfolio (aggregate view) | `/portfolio` | ✅ wired |
| Profile | `/profile` | ✅ wired |
| Options Chain | `/options-chain` | 🟡 scaffolded, no screen logic |
| Charts | `/charts` | 🟡 scaffolded, no screen logic |
| AI Scanner | `/ai-scanner` | 🟡 scaffolded, no screen logic |
| IPO | `/ipo` | 🟡 scaffolded, no screen logic |
| Research | `/research` | 🟡 scaffolded, no screen logic |
| Alerts | `/alerts` | 🟡 scaffolded, no screen logic |
| eDIS / Margin Pledge | `/edis` | 🟡 scaffolded, no screen logic |
| Notices, GTD, Margin Info, Bank Accounts | `/more` | 🟡 endpoints mapped, listed only |

"Scaffolded" pages already have a route, the sidebar entry, and the
authenticated layout — building the screen is a matter of adding a
`usePolledData(Endpoints.x.y)` call and a table/form, following the pattern
in `src/app/(app)/positions/page.tsx` or `src/components/orders/OrderForm.tsx`.

## Project layout

```
src/
  app/
    login/page.tsx              — 2-step login
    (app)/                      — authenticated shell (sidebar + topbar)
      dashboard, market-watch, orders, orders/new, trades,
      positions, holdings, funds, portfolio, profile, ...stubs
    api/
      auth/{login,logout,me,verify-totp,stream-token}/route.ts
      broker/[...path]/route.ts — generic allow-listed broker proxy
  components/
    layout/  — Sidebar, Topbar
    ui/      — Card, Button, Input, Select, Badge, EmptyState, ComingSoon
    orders/  — OrderForm
  hooks/
    usePolledData.ts   — GET + optional interval polling via the proxy
    useMarketStream.ts — live LTP via Synapsewave broadcast (socket.io)
    useWatchlist.ts    — localStorage-backed watchlist
  lib/
    serverConfig.ts  — server-only broker config + host allow-list
    session.ts       — httpOnly session cookie read/write
    brokerFetch.ts   — server-side fetch wrapper (mirrors ApiClient)
    apiClient.ts      — client-side fetch wrapper (calls /api/broker/*)
    endpoints.ts      — every REST path, ported from the Dart services
    authStore.ts      — zustand store for client-side auth status
    format.ts         — currency/number formatting
  types/trading.ts    — Order/Trade/Position/Holding/Funds/Quote types
  middleware.ts       — redirects unauthenticated requests to /login
```

## Extending a stub module

1. Confirm the endpoint(s) in `src/lib/endpoints.ts` (add any missing ones —
   check the matching `*_service.dart` file in your Flutter `lib/` folder).
2. `const data = usePolledData<YourType>(Endpoints.group.name)`.
3. Render it with the existing `Card` / table styling used in
   `positions/page.tsx` for a consistent look.
4. For anything that *writes* (placing an order, cancelling, pledging), use
   `apiClient.post/put/delete` from `src/lib/apiClient.ts` — it goes through
   the same server-side proxy and headers.

## Notes on the broadcast/live-quotes feed

`useMarketStream` assumes the same Synapsewave `socket.io` protocol used by
the mobile app (`subscribe` event in, `tick` event out). If your broker's
web-facing broadcast gateway uses different event names or a REST
long-poll instead, adjust `src/hooks/useMarketStream.ts` — the rest of the
UI (Market Watch table) is agnostic to how the quotes arrive.
