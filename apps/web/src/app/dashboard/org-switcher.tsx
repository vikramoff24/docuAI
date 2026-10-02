"use client";

import { useEffect, useRef, useState } from "react";
import { authApi, ApiException, type Role } from "@/lib/api";

type OrgOption = { id: string; name: string; role: Role };

/** Sidebar control showing the current organization; opens a list to switch between memberships. */
export function OrgSwitcher({
  token,
  organizationId,
  organizationName,
  onSwitch,
}: {
  token: string;
  /** The session's organization — the source of truth for "current", not the fetched list. */
  organizationId?: string;
  organizationName?: string;
  onSwitch: (organizationId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [orgs, setOrgs] = useState<OrgOption[] | null>(null);
  const [error, setError] = useState("");
  const [switching, setSwitching] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    authApi
      .organizations(token)
      .then((list) => !cancelled && setOrgs(list))
      .catch((err) => !cancelled && setError(err instanceof ApiException ? err.message : "Couldn't load organizations"));
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      cancelled = true;
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open, token]);

  async function choose(org: OrgOption) {
    if (org.id === organizationId) {
      setOpen(false);
      return;
    }
    setSwitching(org.id);
    setError("");
    try {
      await onSwitch(org.id);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiException ? err.message : "Couldn't switch organization");
    } finally {
      setSwitching(null);
    }
  }

  return (
    <div className="org-switcher" ref={rootRef}>
      <button
        type="button"
        className="org-switcher-trigger user-org"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Organization: ${organizationName ?? ""}. Switch organization`}
        onClick={() => {
          setError("");
          if (!open) setOrgs(null); // never act on a list fetched for an earlier session
          setOpen(!open);
        }}
      >
        <span className="org-switcher-name">{organizationName}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="org-switcher-menu glass-card" role="listbox" aria-label="Your organizations">
          {!orgs && !error && <div className="org-switcher-muted">Loading…</div>}
          {orgs?.map((org) => {
            const current = org.id === organizationId;
            return (
            <button
              key={org.id}
              type="button"
              role="option"
              aria-selected={current}
              className={`org-switcher-option ${current ? "current" : ""}`}
              disabled={switching !== null}
              onClick={() => choose(org)}
            >
              <span className="org-switcher-option-name">{org.name}</span>
              <span className="org-switcher-option-role">
                {switching === org.id ? "Switching…" : current ? "✓ " + org.role.toLowerCase() : org.role.toLowerCase()}
              </span>
            </button>
            );
          })}
          {orgs?.length === 1 && (
            <div className="org-switcher-muted">Accept an invitation to join another organization.</div>
          )}
          {error && <div className="org-switcher-error" role="alert">{error}</div>}
        </div>
      )}
    </div>
  );
}
