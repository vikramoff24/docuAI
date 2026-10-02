# ADR-013: Rate Limiting

**Status:** Accepted (2026-10-02)

## Context

`ThrottlerModule` was configured but no guard was registered, so nothing was rate limited: not login
(password guessing), not signup, not the public invitation preview (token probing), and not the endpoints
that spend the organization's AI budget. The API also ran with Fastify `trustProxy: true` and read
`X-Forwarded-For` directly for audit IPs, so any client could choose its own IP.

## Decision

- **Global guard** (`AppThrottlerGuard`, `APP_GUARD`) on every route, keyed by client IP:
  `short` 20 req/s (bursts) and `sustained` 300 req/min. `/health` is exempt.
- **Per-route limits** (`@RateLimit(...)`, `common/rate-limit/rate-limit.ts`) give sensitive routes their own
  `sustained` bucket: login 10/min, register 10/10 min, refresh 30/min, invitation preview 20/min,
  accept 10/min, chat message 20/min, summarize 10/min, create workflow 10/min, verify AI key 5/min,
  reindex 3/min. Exceeding a limit blocks that route for that IP for the rest of the window (429 with
  `Retry-After-<throttler>` and a readable message the UI shows as is).
- **Redis storage** (`RedisThrottlerStorage`): one Lua script per check (counter + block flag), so limits
  hold across API instances. It **fails open** on Redis errors: rate limiting is abuse protection, not
  authorization, and shouldn't turn a Redis blip into an outage.
- **`RATE_LIMIT_MULTIPLIER`** scales every limit (default 1). Integration suites default to 0 (off) via
  `test/setup-env.ts`, except `rate-limit.integration.ts`; CI's E2E stack uses 20 because every journey
  comes from one IP, while the rate-limit journey still runs against the real guard.
- **`TRUST_PROXY`** (default `loopback`) decides whose `X-Forwarded-For` is believed. In dev the browser
  reaches the API through the Next.js rewrite proxy on the same host, so loopback is right. `req.ip` is the
  only source of client IP (throttling and audit logs).

## Consequences

- **Deployment must set `TRUST_PROXY`** to the load balancer / web tier (hop count or CIDRs). Left at
  `loopback` behind a remote proxy, every user shares the proxy's IP and its limits. Set to `true`, anyone
  can spoof their IP and dodge every limit.
- Limits are per IP, so many users behind one NAT share them. The global limits are generous for that
  reason; per-user limits for authenticated AI routes would be fairer (the guard runs before JWT auth today).
- No per-account login limit: it would stop distributed guessing against one account, but lets anyone lock
  a victim out. Revisit with CAPTCHA or progressive delays.
