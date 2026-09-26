# ADR-004: JWT Authentication with Refresh Token Rotation

**Status:** Accepted  
**Date:** 2026-09-26

---

## Context

We need an authentication mechanism for a multi-tenant SaaS API. Key requirements:
- Stateless API scaling (no sticky sessions)
- Short-lived access tokens (security)
- Long-lived sessions (UX)
- Token revocation capability
- Multi-organization support (user can belong to multiple orgs)

---

## Decision

Use **JWT (JSON Web Tokens)** with the following pattern:

1. **Access Token**: Short-lived (15 minutes), signed with RS256 (asymmetric), stateless
2. **Refresh Token**: Long-lived (7 days), stored in an HttpOnly cookie, hashed in database
3. **Refresh Token Rotation**: Every refresh issues a new refresh token and invalidates the old one
4. **Token Revocation**: Refresh tokens stored in DB allow explicit revocation (logout, suspicious activity)

---

## JWT Structure (Access Token Payload)

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "organizationId": "org-uuid",
  "role": "ADMIN",
  "iat": 1234567890,
  "exp": 1234568790
}
```

---

## Why RS256 (asymmetric) over HS256 (symmetric)?

- **HS256**: Same key signs and verifies. All services need the secret. If any service is compromised, attacker can forge tokens.
- **RS256**: Private key signs (only auth service). Public key verifies (any service). Services only need the public key — they cannot forge tokens.

In production, the private key lives only in the auth service (or AWS KMS).

---

## Why not sessions (server-side state)?

- Sessions require shared state between API instances (Redis session store)
- JWTs are stateless — any API instance can verify them with only the public key
- Better horizontal scalability
- Industry standard for SPAs and mobile apps

---

## Why not OAuth only?

- We need first-party auth (email/password) for enterprise customers who cannot use Google/GitHub SSO
- OAuth SSO (Google, Microsoft, SAML) will be added later as a Phase 2 feature
- The patterns are compatible (OAuth providers issue JWTs too)

---

## Security Notes

- Access tokens are short-lived (15 min) to limit blast radius if leaked
- Refresh tokens are stored HttpOnly (not accessible to JavaScript)
- Refresh tokens are hashed in the database (bcrypt) — even if DB is compromised, raw tokens are not exposed
- Refresh token rotation means if a token is stolen and used, the legitimate user's next refresh will fail (token family invalidation)
- We maintain a token family to detect reuse attacks

---

## Consequences

- NestJS `PassportStrategy` (JwtStrategy) for access token validation
- Custom RefreshTokenGuard for refresh flow
- Redis used for access token blocklist (for logout before expiry)
- `organizationId` in JWT means users switch "active organization" by re-authenticating or by getting a new token for the selected org
