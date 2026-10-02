"use client";

import { useState, useEffect, useCallback } from "react";
import {
  teamApi,
  authApi,
  inviteLink,
  ApiException,
  ROLES,
  ROLE_RANK,
  type Invitation,
  type Member,
  type Role,
} from "@/lib/api";

const ROLE_HELP: Record<Role, string> = {
  VIEWER: "Read and search documents, use AI chat",
  MEMBER: "Also upload, organize and run the AI agent",
  ADMIN: "Also invite and manage members, set the AI key",
  OWNER: "Full control, including other owners",
};

function displayName(m: { firstName: string | null; lastName: string | null; email: string }) {
  return [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email;
}

function asRole(role: string): Role {
  return (ROLES as string[]).includes(role) ? (role as Role) : "VIEWER";
}

/** Mirrors the API: admins manage people ranked below them; owners manage anyone but themselves. */
function canManage(me: { id: string; role: Role }, target: Member) {
  if (target.userId === me.id || ROLE_RANK[me.role] < ROLE_RANK.ADMIN) return false;
  return me.role === "OWNER" || ROLE_RANK[me.role] > ROLE_RANK[target.role];
}

function CopyLink({ token, label }: { token: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const link = inviteLink(token);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the field below is selectable
    }
  }
  return (
    <div className="team-link-row">
      <input
        className="form-input team-link-input"
        readOnly
        value={link}
        aria-label={label}
        onFocus={(e) => e.currentTarget.select()}
      />
      <button type="button" className="btn-secondary" onClick={copy}>
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}

export function TeamPanel({
  token,
  me,
  organizationName,
  onSwitchOrganization,
}: {
  token: string;
  me: { id: string; role: string };
  organizationName?: string;
  onSwitchOrganization: (organizationId: string) => Promise<void>;
}) {
  const myRole = asRole(me.role);
  const isAdmin = ROLE_RANK[myRole] >= ROLE_RANK.ADMIN;
  const self = { id: me.id, role: myRole };

  const [members, setMembers] = useState<Member[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("MEMBER");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [created, setCreated] = useState<{ email: string; token: string } | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const load = useCallback(
    () =>
      Promise.all([teamApi.members(token), isAdmin ? teamApi.invitations(token) : Promise.resolve([])])
        .then(([m, inv]) => {
          setMembers(m);
          setInvitations(inv);
        })
        .catch((err) => setError(err instanceof ApiException ? err.message : "Failed to load your team")),
    [token, isAdmin]
  );

  useEffect(() => {
    load();
  }, [load]);

  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setError("");
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof ApiException ? err.details.join(" · ") : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email || inviting) return;
    setInviting(true);
    setInviteError("");
    setCreated(null);
    try {
      const inv = await teamApi.invite(token, { email, role: inviteRole });
      setCreated({ email: inv.email, token: inv.invitationToken });
      setInviteEmail("");
      await load();
    } catch (err) {
      setInviteError(err instanceof ApiException ? err.details.join(" · ") : "Failed to create the invitation");
    } finally {
      setInviting(false);
    }
  }

  async function handleLeave() {
    if (!confirmLeave) {
      setConfirmLeave(true);
      return;
    }
    setBusy("leave");
    setError("");
    try {
      // Find somewhere to go before this session loses access to the current org
      const orgs = await authApi.organizations(token);
      const next = orgs.find((o) => !o.current);
      if (!next) {
        setError("You can't leave your only organization.");
        return;
      }
      await teamApi.remove(token, me.id);
      await onSwitchOrganization(next.id);
    } catch (err) {
      setError(err instanceof ApiException ? err.details.join(" · ") : "Failed to leave the organization");
    } finally {
      setBusy(null);
      setConfirmLeave(false);
    }
  }

  const pending = invitations.filter((i) => i.status === "PENDING");
  const assignableRoles = ROLES.filter((r) => ROLE_RANK[r] <= ROLE_RANK[myRole]);

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h1 className="panel-title">Team</h1>
          <p className="panel-subtitle">
            {members ? `${members.length} member${members.length !== 1 ? "s" : ""}` : "Members"} of{" "}
            {organizationName ?? "your organization"}
          </p>
        </div>
      </div>

      {error && <div className="auth-error" role="alert" style={{ marginBottom: "1rem" }}>{error}</div>}

      {isAdmin && (
        <section className="settings-card glass-card" aria-labelledby="invite-heading">
          <div className="settings-card-header">
            <h2 id="invite-heading" className="settings-card-title">Invite someone</h2>
            <p className="settings-muted">
              You&apos;ll get a link to send them. It works only for that email address and expires in 7 days.
            </p>
          </div>
          <form className="team-invite-form" onSubmit={handleInvite} aria-label="Invite a teammate">
            <div className="form-group" style={{ flex: 1, minWidth: 200, margin: 0 }}>
              <label className="form-label" htmlFor="invite-email">Email</label>
              <input
                id="invite-email"
                type="email"
                className="form-input"
                placeholder="teammate@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                maxLength={254}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" htmlFor="invite-role">Role</label>
              <select
                id="invite-role"
                className="form-input team-role-select"
                value={inviteRole}
                onChange={(e) => setInviteRole(asRole(e.target.value))}
              >
                {assignableRoles.map((r) => (
                  <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={inviting || !inviteEmail.trim()}
              style={{ padding: "10px 20px", fontSize: "14px", alignSelf: "flex-end" }}
            >
              <span>{inviting ? "Creating…" : "Create invite link"}</span>
            </button>
          </form>
          <p className="workflow-hint" style={{ margin: 0 }}>{ROLE_HELP[inviteRole]}</p>
          {inviteError && <div className="auth-error" role="alert">{inviteError}</div>}
          {created && (
            <div className="settings-notice team-created" role="status">
              <p style={{ margin: "0 0 8px" }}>Invitation created for <strong>{created.email}</strong>. Send them this link:</p>
              <CopyLink token={created.token} label={`Invitation link for ${created.email}`} />
            </div>
          )}
        </section>
      )}

      <section className="settings-card glass-card" aria-labelledby="members-heading">
        <div className="settings-card-header">
          <h2 id="members-heading" className="settings-card-title">Members</h2>
        </div>
        {!members ? (
          <div className="settings-muted" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="loading-spinner" style={{ width: 16, height: 16 }} /> Loading…
          </div>
        ) : (
          <ul className="team-list" aria-label="Members">
            {members.map((m) => {
              const manageable = canManage(self, m);
              const isMe = m.userId === me.id;
              return (
                <li key={m.userId} className="team-row" data-email={m.user.email}>
                  <div className="user-avatar team-avatar" aria-hidden>
                    {(m.user.firstName?.[0] ?? m.user.email[0]).toUpperCase()}
                    {m.user.lastName?.[0]?.toUpperCase()}
                  </div>
                  <div className="team-who">
                    <div className="doc-name">
                      {displayName({ ...m.user })}
                      {isMe && <span className="team-you">You</span>}
                    </div>
                    <div className="doc-meta">{m.user.email}</div>
                  </div>
                  {manageable ? (
                    <select
                      className="form-input team-role-select"
                      value={m.role}
                      aria-label={`Role for ${m.user.email}`}
                      disabled={busy !== null}
                      onChange={(e) => run(`role:${m.userId}`, () => teamApi.setRole(token, m.userId, asRole(e.target.value)))}
                    >
                      {assignableRoles.map((r) => (
                        <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="team-role-badge" data-role={m.role}>{m.role.charAt(0) + m.role.slice(1).toLowerCase()}</span>
                  )}
                  {manageable && (
                    <button
                      className="doc-action-btn"
                      title="Remove from organization"
                      aria-label={`Remove ${m.user.email}`}
                      disabled={busy !== null}
                      onClick={() => {
                        if (confirm(`Remove ${displayName({ ...m.user })} from ${organizationName ?? "this organization"}?`)) {
                          run(`remove:${m.userId}`, () => teamApi.remove(token, m.userId));
                        }
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <line x1="17" y1="11" x2="23" y2="11" />
                      </svg>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {isAdmin && pending.length > 0 && (
        <section className="settings-card glass-card" aria-labelledby="pending-heading">
          <div className="settings-card-header">
            <h2 id="pending-heading" className="settings-card-title">Pending invitations</h2>
          </div>
          <ul className="team-list" aria-label="Pending invitations">
            {pending.map((inv) => (
              <li key={inv.id} className="team-row team-row-invite" data-email={inv.email}>
                <div className="team-who">
                  <div className="doc-name">{inv.email}</div>
                  <div className="doc-meta">
                    {inv.role.charAt(0) + inv.role.slice(1).toLowerCase()} · expires{" "}
                    {new Date(inv.expiresAt).toLocaleDateString()}
                  </div>
                </div>
                {inv.invitationToken && <CopyLink token={inv.invitationToken} label={`Invitation link for ${inv.email}`} />}
                <button
                  className="btn-secondary"
                  disabled={busy !== null}
                  onClick={() => run(`cancel:${inv.id}`, () => teamApi.cancelInvitation(token, inv.id))}
                  aria-label={`Cancel invitation for ${inv.email}`}
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="settings-card glass-card" aria-labelledby="leave-heading">
        <div className="settings-card-header">
          <h2 id="leave-heading" className="settings-card-title">Leave organization</h2>
          <p className="settings-muted">
            You&apos;ll lose access to {organizationName ?? "this organization"}&apos;s documents. You can&apos;t leave your
            only organization, and an owner must hand over ownership first.
          </p>
        </div>
        <div>
          <button
            className="btn-secondary settings-remove"
            onClick={handleLeave}
            onBlur={() => setConfirmLeave(false)}
            disabled={busy !== null}
          >
            {busy === "leave" ? "Leaving…" : confirmLeave ? "Click again to leave" : `Leave ${organizationName ?? "organization"}`}
          </button>
        </div>
      </section>
    </div>
  );
}
