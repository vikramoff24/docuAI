"use client";

import { useState, useEffect, useCallback } from "react";
import {
  workflowsApi,
  settingsApi,
  ApiException,
  MAX_WORKFLOW_INSTRUCTIONS,
  type Workflow,
  type WorkflowStatus,
  type WorkflowType,
} from "@/lib/api";

/** How often to re-fetch while any workflow is still PENDING/RUNNING. */
const POLL_INTERVAL_MS = 2000;

const TYPE_OPTIONS: { value: WorkflowType; label: string; hint: string }[] = [
  {
    value: "document_categorization",
    label: "Categorize documents",
    hint: "Finds matching documents and records a category + tag on each.",
  },
  {
    value: "data_extraction",
    label: "Extract data",
    hint: "Reads documents and returns the requested fields as JSON.",
  },
  {
    value: "general",
    label: "General task",
    hint: "Any other task using search, read and metadata tools.",
  },
];

const TYPE_LABELS: Record<WorkflowType, string> = Object.fromEntries(
  TYPE_OPTIONS.map((o) => [o.value, o.label])
) as Record<WorkflowType, string>;

const STATUS_STYLES: Record<WorkflowStatus, { bg: string; color: string; label: string }> = {
  PENDING: { bg: "hsl(252, 78%, 54%, 0.15)", color: "var(--brand-400)", label: "Queued" },
  RUNNING: { bg: "hsl(40, 90%, 55%, 0.15)", color: "hsl(40, 90%, 55%)", label: "Running" },
  COMPLETED: { bg: "hsl(155, 75%, 50%, 0.15)", color: "hsl(155, 75%, 55%)", label: "✓ Completed" },
  FAILED: { bg: "hsl(0, 75%, 50%, 0.15)", color: "hsl(0, 75%, 55%)", label: "Failed" },
};

const isActive = (w: Workflow) => w.status === "PENDING" || w.status === "RUNNING";

function formatDate(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
  if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
  return new Date(iso).toLocaleDateString();
}

export function WorkflowsPanel({
  token,
  role,
  onOpenSettings,
}: {
  token: string;
  role: string;
  onOpenSettings?: () => void;
}) {
  const canCreate = role !== "VIEWER";
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    settingsApi
      .getAi(token)
      .then((s) => setAiConfigured(s.configured))
      .catch(() => setAiConfigured(null)); // unknown — don't block the UI
  }, [token]);

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const [type, setType] = useState<WorkflowType>("document_categorization");
  const [instructions, setInstructions] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const refresh = useCallback(
    () =>
      workflowsApi
        .list(token)
        .then((list) => {
          setWorkflows(list);
          setLoadError("");
        })
        .catch((err) =>
          setLoadError(err instanceof ApiException ? err.message : "Failed to load workflows")
        )
        .finally(() => setLoading(false)),
    [token]
  );

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll while anything is still in flight
  const hasActive = workflows.some(isActive);
  useEffect(() => {
    if (!hasActive) return;
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [hasActive, refresh]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = instructions.trim();
    if (!text || submitting) return;

    setSubmitting(true);
    setSubmitError("");
    try {
      const created = await workflowsApi.create(token, { type, instructions: text });
      setWorkflows((prev) => [created, ...prev]);
      setExpanded(created.id);
      setInstructions("");
    } catch (err) {
      setSubmitError(
        err instanceof ApiException ? err.details.join(" · ") : "Failed to start workflow"
      );
    } finally {
      setSubmitting(false);
    }
  }

  const selectedHint = TYPE_OPTIONS.find((o) => o.value === type)?.hint;

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h1 className="panel-title">AI Agent</h1>
          <p className="panel-subtitle">
            Describe a task — the agent searches, reads and tags your documents in the background
          </p>
        </div>
      </div>

      {aiConfigured === false && (
        <div className="settings-banner glass-card" role="status">
          <div>
            <strong>No OpenAI API key configured.</strong>{" "}
            <span className="settings-muted">
              Workflows will fail until {role === "OWNER" || role === "ADMIN" ? "you add" : "an admin adds"} a
              key in Settings.
            </span>
          </div>
          {onOpenSettings && (
            <button type="button" className="btn-secondary" onClick={onOpenSettings}>
              Open Settings
            </button>
          )}
        </div>
      )}

      {canCreate ? (
        <form className="workflow-form glass-card" onSubmit={handleSubmit} aria-label="New workflow">
          <div className="form-group">
            <label className="form-label" htmlFor="workflow-type">Task type</label>
            <select
              id="workflow-type"
              className="form-input"
              value={type}
              onChange={(e) => setType(e.target.value as WorkflowType)}
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="workflow-hint">{selectedHint}</p>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="workflow-instructions">Instructions</label>
            <textarea
              id="workflow-instructions"
              className="form-input workflow-textarea"
              placeholder='e.g. "Tag every invoice from 2026 with category Finance"'
              value={instructions}
              maxLength={MAX_WORKFLOW_INSTRUCTIONS}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              required
            />
            <p className="workflow-hint" style={{ textAlign: "right" }}>
              {instructions.length}/{MAX_WORKFLOW_INSTRUCTIONS}
            </p>
          </div>

          {submitError && <div className="auth-error" role="alert">{submitError}</div>}

          <button
            type="submit"
            className="btn-primary"
            disabled={submitting || !instructions.trim()}
            style={{ padding: "10px 20px", fontSize: "14px", alignSelf: "flex-start" }}
          >
            <span>{submitting ? "Starting..." : "Run agent"}</span>
          </button>
        </form>
      ) : (
        <div className="workflow-notice glass-card" role="note">
          Viewers can see workflow results but can’t start new ones. Ask an admin for Member access.
        </div>
      )}

      <h2 className="workflow-section-title">History</h2>

      {loadError && <div className="auth-error" role="alert" style={{ marginBottom: "1rem" }}>{loadError}</div>}

      {loading ? (
        <div className="panel-empty">
          <div className="loading-spinner" />
          <p>Loading workflows...</p>
        </div>
      ) : workflows.length === 0 ? (
        <div className="panel-empty">
          <p style={{ color: "var(--text-muted)" }}>No workflows yet</p>
          {canCreate && (
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
              Start one above — results show up here
            </p>
          )}
        </div>
      ) : (
        <ul className="doc-list" aria-label="Workflow history">
          {workflows.map((w) => {
            const st = STATUS_STYLES[w.status] ?? STATUS_STYLES.PENDING;
            const open = expanded === w.id;
            return (
              <li key={w.id} className="workflow-item glass-card" data-status={w.status}>
                <button
                  className="workflow-row"
                  onClick={() => setExpanded(open ? null : w.id)}
                  aria-expanded={open}
                >
                  <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                    <div className="doc-name">{w.input.instructions || TYPE_LABELS[w.type]}</div>
                    <div className="doc-meta">
                      {TYPE_LABELS[w.type] ?? w.type} · {formatDate(w.createdAt)}
                    </div>
                  </div>
                  <span className="doc-status" style={{ background: st.bg, color: st.color }}>
                    {isActive(w) && <span className="workflow-pulse" aria-hidden />}
                    {st.label}
                  </span>
                </button>

                {open && (
                  <div className="workflow-detail">
                    {w.status === "COMPLETED" && w.output && (
                      <>
                        <p className="workflow-result">{w.output.result}</p>
                        <p className="doc-meta">
                          {w.output.toolCalls} tool call{w.output.toolCalls !== 1 ? "s" : ""} ·{" "}
                          {w.output.updatedDocumentIds.length} document
                          {w.output.updatedDocumentIds.length !== 1 ? "s" : ""} updated ·{" "}
                          {w.output.totalTokens.toLocaleString()} tokens
                        </p>
                      </>
                    )}
                    {w.status === "FAILED" && (
                      <p className="workflow-error">{w.error || "The workflow failed."}</p>
                    )}
                    {isActive(w) && (
                      <p className="doc-meta">
                        {w.status === "PENDING" ? "Waiting for a worker..." : "The agent is working..."}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
