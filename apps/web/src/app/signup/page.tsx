"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { ApiException, teamApi, type InvitationPreview } from "@/lib/api";

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const router = useRouter();
  // Signing up through an invitation link joins that organization instead of creating one
  const inviteToken = useSearchParams().get("invite");
  const [invite, setInvite] = useState<InvitationPreview | null>(null);
  const [inviteError, setInviteError] = useState("");
  const { register, isAuthenticated } = useAuth();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    organizationName: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) router.replace("/dashboard");
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (!inviteToken) return;
    let cancelled = false;
    teamApi
      .previewInvitation(inviteToken)
      .then((preview) => {
        if (cancelled) return;
        if (preview.status !== "PENDING") {
          setInviteError(`This invitation is ${preview.status.toLowerCase()}. You can still create your own organization.`);
          return;
        }
        setInvite(preview);
        setForm((prev) => ({ ...prev, email: preview.email }));
      })
      .catch(() => !cancelled && setInviteError("This invitation link is invalid. You can still create your own organization."));
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  if (isAuthenticated) return null;

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await register(
        invite && inviteToken
          ? { ...form, organizationName: undefined, invitationToken: inviteToken }
          : form
      );
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiException) {
        setError(err.details.join(", "));
      } else {
        setError("Registration failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card glass-card">
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <Link href="/" className="logo-link" style={{ justifyContent: "center" }}>
            <div className="logo-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <span className="logo-text">
              DocuFlow <span className="gradient-text">AI</span>
            </span>
          </Link>
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: "0.5rem" }}>
            {invite ? <>Create your account to join <strong>{invite.organizationName}</strong></> : "Create your account"}
          </p>
        </div>

        {inviteError && <div className="workflow-notice" role="note" style={{ marginBottom: "1rem" }}>{inviteError}</div>}

        {/* Error */}
        {error && (
          <div className="auth-error">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="m15 9-6 6" />
              <path d="m9 9 6 6" />
            </svg>
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div className="form-group">
              <label className="form-label" htmlFor="firstName">First name</label>
              <input
                id="firstName"
                type="text"
                className="form-input"
                placeholder="Alice"
                value={form.firstName}
                onChange={(e) => updateField("firstName", e.target.value)}
                required
                maxLength={50}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="lastName">Last name</label>
              <input
                id="lastName"
                type="text"
                className="form-input"
                placeholder="Smith"
                value={form.lastName}
                onChange={(e) => updateField("lastName", e.target.value)}
                required
                maxLength={50}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="form-input"
              placeholder="alice@acme.com"
              value={form.email}
              onChange={(e) => updateField("email", e.target.value)}
              required
              maxLength={254}
              autoComplete="email"
              readOnly={!!invite}
              aria-describedby={invite ? "email-locked" : undefined}
            />
            {invite && (
              <p id="email-locked" className="workflow-hint" style={{ marginTop: 6 }}>
                The invitation was sent to this address.
              </p>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="form-input"
              placeholder="Min 8 chars, 1 uppercase, 1 number"
              value={form.password}
              onChange={(e) => updateField("password", e.target.value)}
              required
              minLength={8}
              maxLength={128}
              pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*"
              title="At least 8 characters, with an uppercase letter, a lowercase letter and a number"
              autoComplete="new-password"
            />
          </div>

          {!invite && (
          <div className="form-group">
            <label className="form-label" htmlFor="orgName">Organization name</label>
            <input
              id="orgName"
              type="text"
              className="form-input"
              placeholder="Acme Corp"
              value={form.organizationName}
              onChange={(e) => updateField("organizationName", e.target.value)}
              required
              minLength={2}
              maxLength={100}
            />
          </div>
          )}

          <button
            type="submit"
            className="btn-primary auth-submit"
            disabled={loading}
          >
            <span>{loading ? "Creating account..." : invite ? `Create account & join ${invite.organizationName}` : "Create account"}</span>
          </button>
        </form>

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
            Already have an account?{" "}
            <Link href="/login" className="auth-link">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
