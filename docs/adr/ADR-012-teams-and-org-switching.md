# ADR-012: Teams, Organization Switching and Invitations

**Status:** Accepted  
**Date:** 2026-10-01

---

## Context

A user can belong to several organizations (`organization_members`), but every session was pinned to the user's
**oldest** membership: an accepted invitation could never actually be used. There was also no UI for members,
invitations or folders. In addition, the access token's `role` claim was trusted for its 15-minute lifetime, so a
removed member kept access and a demoted admin kept admin powers until the token expired.

## Decisions

### 1. The session's organization lives on the refresh token

- `refresh_tokens.organizationId` (nullable, `ON DELETE SET NULL`), migration `20261001173531_refresh_token_organization`.
- **Switching** is `POST /auth/refresh { refreshToken, organizationId }`. The token is rotated as usual and the new pair
  acts in that organization. Membership is checked **before** rotating, so a refused switch (403) leaves the session intact.
- A plain refresh stays in the token's organization. If the user is no longer a member, it falls back to their oldest
  membership, or returns 401 if they have none.
- **Login resumes** in the organization of the user's most recent session. A user with no memberships left (e.g. removed
  from the only org they joined by invitation) gets a fresh personal workspace instead of being locked out.
- `GET /auth/organizations` lists memberships for the sidebar switcher. Responses to refresh carry
  `organization { id, name, slug, role }`, so the client also picks up role changes.

Why not a `lastOrganizationId` column on `users`? Two tabs can act in different organizations: binding it to the
session (refresh-token family) keeps them independent.

### 2. Membership and role are read live on every request

`JwtStrategy.validate` looks up `(userId, organizationId)` in `organization_members` (unique index), using the **database
role** and rejecting (401) a non-member. The cost is one indexed query per request. In exchange, removal and role changes
take effect immediately. The `role` claim in the JWT is kept only for compatibility.

### 3. Invitations are delivered as links

There is no email service yet, so creating an invitation returns `invitationToken`, and the list returns it for
**PENDING** invitations, to ADMIN/OWNER only. The admin shares `/invite?token=…`.

- The token works **only for the invited address** (accept checks the session email, signup checks `dto.email`).
- `GET /invitations/preview?token=` (public) powers the landing page: org name, inviter, role, status, and whether an
  account exists for that address (to offer "sign in" vs "create account"). Only the token holder learns this.
- **Signup through an invitation** (`POST /auth/register { …, invitationToken }`, `organizationName` optional) joins
  the inviting organization directly. No personal organization is created.
- Claiming an invitation is atomic (`updateMany … where status = PENDING`) both at signup and at accept, so a link
  works once even under concurrent use.
- **Rejected alternative: "pending invitations for my email" inbox.** Signup does not verify email ownership, so anyone
  could register `alice@company.com` and accept her invitations from an inbox. The token is the proof of receipt.
  Revisit once email verification exists.

### 4. Member management rules

Rank: VIEWER < MEMBER < ADMIN < OWNER.

- Only ADMIN+ manage others, and only people **ranked below them**. OWNERs may manage other OWNERs.
- Nobody grants a role above their own or changes their own role.
- An organization always keeps ≥ 1 OWNER. The check locks the OWNER rows (`SELECT … FOR UPDATE`), so two owners
  removing or demoting each other concurrently can't both succeed.
- Leaving = removing yourself, which is refused for your only organization and for the last owner.
- Audited: `ORG_MEMBER_INVITED`, `ORG_MEMBER_ROLE_CHANGED {from,to}`, `ORG_MEMBER_REMOVED {role,left}`.

### 5. Folders and reindexing

- The org's hidden root folder (`path = '/'`) is never listed. "No folder" is the top level, filtered with
  `GET /documents?folderId=root`. `GET /folders/all` feeds "Move to…" pickers, and `PATCH /documents/:id { folderId | null }`
  moves documents (same permission as delete, audited `DOCUMENT_MOVED`).
- `POST /documents/:id/reprocess` re-runs the pipeline for READY/FAILED documents (atomic claim, so a double click
  queues it once).
- `GET /documents/index-status` + `POST /documents/reindex` (ADMIN, requires an AI key) re-queue READY documents whose
  chunks lack embeddings (uploaded before a key existed) or hold the old extractor's placeholder text. They are claimed
  in a single `UPDATE … RETURNING` (≤ 500 per call). Settings shows the count and a "Reindex" button.

## Consequences / follow-ups

- Email delivery (and email verification) would let invitations be sent rather than copied, and enable an inbox.
- Rate limiting: `ThrottlerModule` is configured but no `ThrottlerGuard` is registered, so nothing is throttled
  (login, signup, invitation preview). Enabling it needs per-route limits and a test-friendly configuration.
- Dashboard layout on phones is still cramped (pre-existing).
