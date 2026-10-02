"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { ApiException, teamApi, type InvitationPreview } from "@/lib/api";

/**
 * Landing page for invitation links (/invite?token=…).
 * Signed in as the invited address → accept and switch into the organization.
 * Signed out → sign in (existing account) or create an account that joins directly.
 */
export default function InvitePage() {
  return (
    <div className="auth-page">
      <div className="auth-card glass-card">
        <Suspense fallback={<p className="settings-muted">Loading invitation…</p>}>
          <Invite />
        </Suspense>
      </div>
    </div>
  );
}

function Invite() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const { isAuthenticated, isLoading, user, accessToken, logout, switchOrganization } = useAuth();
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loadError, setLoadError] = useState(token ? "" : "This invitation link is incomplete.");
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    teamApi
      .previewInvitation(token)
      .then((p) => !cancelled && setPreview(p))
      .catch((err) => {
        if (cancelled) return;
        setLoadError(
          err instanceof ApiException && err.statusCode < 500
            ? "This invitation link is invalid or has been removed."
            : "Couldn't load the invitation. Please try again."
        );
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function accept() {
    if (!accessToken || !preview) return;
    setAccepting(true);
    setError("");
    try {
      const res = await teamApi.acceptInvitation(accessToken, token);
      await switchOrganization(res.organization.id);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof ApiException ? err.message : "Couldn't accept the invitation");
      setAccepting(false);
    }
  }

  const here = `/invite?token=${encodeURIComponent(token)}`;
  const roleLabel = preview ? preview.role.charAt(0) + preview.role.slice(1).toLowerCase() : "";
  const sameEmail = preview && user && user.email.toLowerCase() === preview.email.toLowerCase();

  if (loadError) {
    return (
      <>
        <h1 className="invite-title">Invitation unavailable</h1>
        <div className="auth-error" role="alert">{loadError}</div>
        <Link href="/" className="auth-link">Go to DocuFlow</Link>
      </>
    );
  }
  if (!preview || isLoading) {
    return <p className="settings-muted">Loading invitation…</p>;
  }

  return (
    <>
      <p className="invite-eyebrow">You&apos;re invited</p>
      <h1 className="invite-title">Join {preview.organizationName}</h1>
      <p className="settings-muted" style={{ marginBottom: "1.5rem" }}>
        {preview.invitedBy ?? "An admin"} invited <strong>{preview.email}</strong> to join as{" "}
        <strong>{roleLabel}</strong>.
      </p>

      {preview.status !== "PENDING" ? (
        <div className="workflow-notice" role="note">
          This invitation is {preview.status.toLowerCase()}.{" "}
          {preview.status === "ACCEPTED" ? (
            <Link href="/dashboard" className="auth-link">Open DocuFlow</Link>
          ) : (
            "Ask an admin for a new one."
          )}
        </div>
      ) : !isAuthenticated ? (
        <div className="invite-actions">
          {preview.hasAccount ? (
            <Link
              className="btn-primary auth-submit"
              href={`/login?next=${encodeURIComponent(here)}&email=${encodeURIComponent(preview.email)}`}
            >
              <span>Sign in to accept</span>
            </Link>
          ) : (
            <Link className="btn-primary auth-submit" href={`/signup?invite=${encodeURIComponent(token)}`}>
              <span>Create account &amp; join</span>
            </Link>
          )}
        </div>
      ) : !sameEmail ? (
        <>
          <div className="workflow-notice" role="note">
            You&apos;re signed in as <strong>{user?.email}</strong>, but this invitation is for{" "}
            <strong>{preview.email}</strong>.
          </div>
          <button className="btn-secondary auth-submit" onClick={() => logout()} style={{ marginTop: "1rem" }}>
            Sign out and switch account
          </button>
        </>
      ) : (
        <>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button className="btn-primary auth-submit" onClick={accept} disabled={accepting}>
            <span>{accepting ? "Joining…" : `Accept & open ${preview.organizationName}`}</span>
          </button>
        </>
      )}
    </>
  );
}
