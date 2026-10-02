"use client";

import { useState, useEffect, useCallback } from "react";
import { settingsApi, documentsApi, ApiException, type AiKeyStatus } from "@/lib/api";

const MANAGER_ROLES = new Set(["OWNER", "ADMIN"]);

function formatDate(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
  if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
  return new Date(iso).toLocaleDateString();
}

function StatusLine({ status }: { status: AiKeyStatus }) {
  if (status.source === "organization") {
    const who = [status.updatedBy?.firstName, status.updatedBy?.lastName].filter(Boolean).join(" ");
    return (
      <p className="settings-status" data-state="organization">
        <span className="settings-dot settings-dot-ok" aria-hidden />
        <span>
          Using your organization&apos;s key <code className="settings-key-hint">••••{status.last4}</code>
          {status.updatedAt && (
            <span className="settings-muted">
              {" "}· updated {who ? `by ${who} ` : ""}{formatDate(status.updatedAt)}
            </span>
          )}
        </span>
      </p>
    );
  }
  if (status.source === "environment") {
    return (
      <p className="settings-status" data-state="environment">
        <span className="settings-dot settings-dot-ok" aria-hidden />
        <span>
          Using the server&apos;s default key.{" "}
          <span className="settings-muted">Add your own to bill usage to your organization&apos;s OpenAI account.</span>
        </span>
      </p>
    );
  }
  return (
    <p className="settings-status" data-state="none">
      <span className="settings-dot settings-dot-off" aria-hidden />
      <span>
        Not configured.{" "}
        <span className="settings-muted">AI chat, summaries, semantic search and the AI agent are unavailable.</span>
      </span>
    </p>
  );
}

export function SettingsPanel({
  token,
  role,
  organizationName,
}: {
  token: string;
  role: string;
  organizationName?: string;
}) {
  const canManage = MANAGER_ROLES.has(role);

  const [status, setStatus] = useState<AiKeyStatus | null>(null);
  const [loadError, setLoadError] = useState("");

  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Documents whose AI index is incomplete (e.g. uploaded before a key existed)
  const [needsIndexing, setNeedsIndexing] = useState(0);
  const [reindexing, setReindexing] = useState(false);
  const [reindexNotice, setReindexNotice] = useState("");
  const [reindexError, setReindexError] = useState("");

  const load = useCallback(
    () =>
      Promise.all([settingsApi.getAi(token), documentsApi.indexStatus(token).catch(() => ({ needsIndexing: 0 }))])
        .then(([s, index]) => {
          setStatus(s);
          setNeedsIndexing(index.needsIndexing);
          setLoadError("");
        })
        .catch((err) =>
          setLoadError(err instanceof ApiException ? err.message : "Failed to load settings")
        ),
    [token]
  );

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const key = apiKey.trim();
    if (!key || saving) return;

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const next = await settingsApi.setOpenAIKey(token, key);
      setStatus(next);
      setApiKey("");
      setShowKey(false);
      setNotice("Key verified with OpenAI and saved.");
      setNeedsIndexing((await documentsApi.indexStatus(token).catch(() => ({ needsIndexing: 0 }))).needsIndexing);
    } catch (err) {
      setError(err instanceof ApiException ? err.details.join(" · ") : "Failed to save the key");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    setRemoving(true);
    setError("");
    setNotice("");
    try {
      await settingsApi.removeOpenAIKey(token);
      setConfirmRemove(false);
      setNotice("Organization key removed.");
      await load();
    } catch (err) {
      setError(err instanceof ApiException ? err.message : "Failed to remove the key");
    } finally {
      setRemoving(false);
    }
  }

  const hasOrgKey = status?.source === "organization";

  async function handleReindex() {
    setReindexing(true);
    setReindexError("");
    setReindexNotice("");
    try {
      const { queued } = await documentsApi.reindex(token);
      setReindexNotice(
        queued === 0
          ? "Everything is already indexed."
          : `Reindexing ${queued} document${queued === 1 ? "" : "s"} in the background. They show as PROCESSING until done.`
      );
      setNeedsIndexing((n) => Math.max(0, n - queued));
    } catch (err) {
      setReindexError(err instanceof ApiException ? err.message : "Couldn't start reindexing");
    } finally {
      setReindexing(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h1 className="panel-title">Settings</h1>
          <p className="panel-subtitle">
            {organizationName ? `${organizationName} · ` : ""}Organization-wide configuration
          </p>
        </div>
      </div>

      <section className="settings-card glass-card" aria-labelledby="openai-heading">
        <div className="settings-card-header">
          <h2 id="openai-heading" className="settings-card-title">OpenAI API key</h2>
          <p className="settings-muted">
            Powers AI chat, document summaries, semantic search and the AI agent for everyone in your organization.
          </p>
        </div>

        {loadError && <div className="auth-error" role="alert">{loadError}</div>}

        {!status && !loadError ? (
          <div className="settings-muted" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="loading-spinner" style={{ width: 16, height: 16 }} /> Loading…
          </div>
        ) : status ? (
          <StatusLine status={status} />
        ) : null}

        {status && canManage && !status.canStoreKeys && (
          <div className="workflow-notice" role="note" style={{ margin: 0 }}>
            The server has no <code>AI_CREDENTIALS_ENCRYPTION_KEY</code>, so keys can&apos;t be stored securely.
            Ask your administrator to configure it.
          </div>
        )}

        {status && canManage && status.canStoreKeys && (
          <form className="settings-form" onSubmit={handleSave} aria-label="OpenAI API key">
            <label className="form-label" htmlFor="openai-key">
              {hasOrgKey ? "Replace key" : "Add key"}
            </label>
            <div className="settings-key-row">
              <input
                id="openai-key"
                className="form-input settings-key-input"
                type={showKey ? "text" : "password"}
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="off"
                disabled={saving}
              />
              <button
                type="button"
                className="btn-secondary settings-reveal"
                onClick={() => setShowKey((v) => !v)}
                aria-label={showKey ? "Hide key" : "Show key"}
                aria-pressed={showKey}
              >
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
            <p className="workflow-hint">
              We verify the key with OpenAI, store it encrypted, and never show it again: only its last 4
              characters. Create one at{" "}
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="auth-link"
              >
                platform.openai.com/api-keys
              </a>
              .
            </p>

            {error && <div className="auth-error" role="alert">{error}</div>}
            {notice && <div className="settings-notice" role="status">{notice}</div>}

            <div className="settings-actions">
              <button
                type="submit"
                className="btn-primary"
                disabled={saving || !apiKey.trim()}
                style={{ padding: "10px 20px", fontSize: "14px" }}
              >
                <span>{saving ? "Verifying…" : "Verify & save"}</span>
              </button>
              {hasOrgKey && (
                <button
                  type="button"
                  className="btn-secondary settings-remove"
                  onClick={handleRemove}
                  onBlur={() => setConfirmRemove(false)}
                  disabled={removing}
                >
                  {removing ? "Removing…" : confirmRemove ? "Click again to remove" : "Remove key"}
                </button>
              )}
            </div>
          </form>
        )}

        {status && !canManage && (
          <p className="workflow-notice" role="note" style={{ margin: 0 }}>
            Only organization admins can change the API key.
          </p>
        )}
      </section>

      {status?.configured && canManage && (needsIndexing > 0 || reindexNotice || reindexError) && (
        <section className="settings-card glass-card" aria-labelledby="reindex-heading">
          <div className="settings-card-header">
            <h2 id="reindex-heading" className="settings-card-title">Search index</h2>
            {needsIndexing > 0 && (
              <p className="settings-muted">
                {needsIndexing} document{needsIndexing === 1 ? " isn't" : "s aren't"} fully indexed for AI search and
                chat, usually because {needsIndexing === 1 ? "it was" : "they were"} uploaded before an API key was
                added. Reindexing uses your OpenAI key.
              </p>
            )}
          </div>
          {reindexError && <div className="auth-error" role="alert">{reindexError}</div>}
          {reindexNotice && <div className="settings-notice" role="status">{reindexNotice}</div>}
          {needsIndexing > 0 && (
            <div className="settings-actions">
              <button className="btn-primary" onClick={handleReindex} disabled={reindexing} style={{ padding: "10px 20px", fontSize: "14px" }}>
                <span>{reindexing ? "Queuing…" : `Reindex ${needsIndexing} document${needsIndexing === 1 ? "" : "s"}`}</span>
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
