"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  documentsApi,
  foldersApi,
  searchApi,
  conversationsApi,
  aiApi,
  type DocumentSummary,
  type Document,
  type Folder,
  type SearchResult,
  type Conversation,
  type Message,
  type Citation,
  ApiException,
} from "@/lib/api";
import { WorkflowsPanel } from "./workflows-panel";
import { SettingsPanel } from "./settings-panel";
import { TeamPanel } from "./team-panel";
import { OrgSwitcher } from "./org-switcher";

/* ──────────────────────────────────────────────
   Types
────────────────────────────────────────────── */
type Tab = "documents" | "search" | "chat" | "agent" | "team" | "settings";

/* ──────────────────────────────────────────────
   Dashboard Page
────────────────────────────────────────────── */
export default function DashboardPage() {
  const router = useRouter();
  const { user, organization, accessToken, isAuthenticated, isLoading, logout, switchOrganization } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("documents");

  // Redirect if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated || !accessToken) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner" />
        <p style={{ color: "var(--text-muted)", marginTop: "1rem" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* ── Sidebar ── */}
      <aside className="dashboard-sidebar">
        <div className="sidebar-header">
          <Link href="/" className="logo-link">
            <div className="logo-icon" style={{ width: 28, height: 28 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              </svg>
            </div>
            <span className="logo-text" style={{ fontSize: "0.9rem" }}>
              DocuFlow <span className="gradient-text">AI</span>
            </span>
          </Link>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`sidebar-item ${activeTab === "documents" ? "active" : ""}`}
            onClick={() => setActiveTab("documents")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            Documents
          </button>
          <button
            className={`sidebar-item ${activeTab === "search" ? "active" : ""}`}
            onClick={() => setActiveTab("search")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            AI Search
          </button>
          <button
            className={`sidebar-item ${activeTab === "chat" ? "active" : ""}`}
            onClick={() => setActiveTab("chat")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            AI Chat
          </button>
          <button
            className={`sidebar-item ${activeTab === "agent" ? "active" : ""}`}
            onClick={() => setActiveTab("agent")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="8" width="16" height="12" rx="2" />
              <path d="M12 8V4" />
              <circle cx="12" cy="3" r="1" />
              <path d="M9 13v2" />
              <path d="M15 13v2" />
            </svg>
            AI Agent
          </button>
          <button
            className={`sidebar-item ${activeTab === "team" ? "active" : ""}`}
            onClick={() => setActiveTab("team")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Team
          </button>
          <button
            className={`sidebar-item ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => setActiveTab("settings")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Settings
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="user-name">{user?.firstName} {user?.lastName}</div>
              <OrgSwitcher
                token={accessToken}
                organizationId={organization?.id}
                organizationName={organization?.name}
                onSwitch={switchOrganization}
              />
            </div>
          </div>
          <button className="sidebar-logout" onClick={logout} title="Sign out">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      {/* Keyed by organization: switching orgs remounts every panel with fresh state */}
      <main className="dashboard-main" key={organization?.id}>
        {activeTab === "documents" && (
          <DocumentsPanel token={accessToken} role={user?.role ?? "VIEWER"} userId={user?.id ?? ""} />
        )}
        {activeTab === "search" && <SearchPanel token={accessToken} />}
        {activeTab === "chat" && <ChatPanel token={accessToken} />}
        {activeTab === "agent" && (
          <WorkflowsPanel
            token={accessToken}
            role={user?.role ?? "VIEWER"}
            onOpenSettings={() => setActiveTab("settings")}
          />
        )}
        {activeTab === "team" && (
          <TeamPanel
            token={accessToken}
            me={{ id: user?.id ?? "", role: user?.role ?? "VIEWER" }}
            organizationName={organization?.name}
            onSwitchOrganization={switchOrganization}
          />
        )}
        {activeTab === "settings" && (
          <SettingsPanel
            token={accessToken}
            role={user?.role ?? "VIEWER"}
            organizationName={organization?.name}
          />
        )}
      </main>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Documents Panel
────────────────────────────────────────────── */
const PAGE_SIZE = 50;
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // mirrors the API limit

/**
 * Types the API accepts, by extension. Browsers report MIME types
 * inconsistently (".md" is often "" or "text/x-markdown", ".csv" on Windows is
 * "application/vnd.ms-excel"), so the extension wins when we know it.
 */
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};
const ACCEPT_ATTR = Object.keys(MIME_BY_EXTENSION).map((ext) => "." + ext).join(",");
const SUPPORTED_MIME_TYPES = new Set(Object.values(MIME_BY_EXTENSION));

function detectMimeType(file: File): string | null {
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  const type = MIME_BY_EXTENSION[ext] ?? file.type;
  return SUPPORTED_MIME_TYPES.has(type) ? type : null;
}

function DocumentsPanel({ token, role, userId }: { token: string; role: string; userId: string }) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [total, setTotal] = useState(0);
  const pagesLoaded = useRef(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [summaries, setSummaries] = useState<
    Record<string, { loading?: boolean; data?: DocumentSummary; error?: string }>
  >({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Folder navigation: [] is the top level ("All documents"), then one entry per opened folder
  const [folderPath, setFolderPath] = useState<{ id: string; name: string }[]>([]);
  const currentFolder = folderPath[folderPath.length - 1] ?? null;
  const [folders, setFolders] = useState<Folder[]>([]);
  const [allFolders, setAllFolders] = useState<Folder[]>([]);
  const [workspaceTotal, setWorkspaceTotal] = useState(0);
  const [newFolderName, setNewFolderName] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);

  const canUpload = role !== "VIEWER";
  const isAdmin = role === "ADMIN" || role === "OWNER";
  const canDelete = (doc: Document) => isAdmin || (canUpload && doc.createdBy?.id === userId);

  // Fetches pages 1..pageCount, so polling and reloads keep "Load more" results.
  const folderFilter = currentFolder?.id ?? "root";
  const loadDocuments = useCallback(
    (pageCount: number) =>
      Promise.all([
        Promise.all(
          Array.from({ length: pageCount }, (_, i) =>
            documentsApi.list(token, { limit: PAGE_SIZE, page: i + 1, folderId: folderFilter })
          )
        ),
        foldersApi.list(token, folderFilter === "root" ? undefined : folderFilter),
        foldersApi.all(token),
        documentsApi.list(token, { limit: 1 }), // workspace-wide count for the header
      ])
        .then(([results, children, everyFolder, everything]) => {
          pagesLoaded.current = pageCount;
          setDocuments(results.flatMap((r) => r.items));
          setTotal(results[0]?.pagination.total ?? 0);
          setFolders(children);
          setAllFolders(everyFolder);
          setWorkspaceTotal(everything.pagination.total);
        })
        .catch((err) =>
          setError(err instanceof ApiException ? err.message : "Failed to load documents")
        )
        .finally(() => setLoading(false)),
    [token, folderFilter]
  );
  const reloadDocuments = useCallback(() => loadDocuments(pagesLoaded.current), [loadDocuments]);

  useEffect(() => {
    loadDocuments(1);
  }, [loadDocuments]);

  function openFolder(path: { id: string; name: string }[]) {
    setLoading(true);
    setError("");
    setNewFolderName(null);
    setFolderPath(path);
  }

  async function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault();
    const name = newFolderName?.trim();
    if (!name || creatingFolder) return;
    setCreatingFolder(true);
    setError("");
    try {
      await foldersApi.create(token, { name, parentId: currentFolder?.id });
      setNewFolderName(null);
      await reloadDocuments();
    } catch (err) {
      setError(err instanceof ApiException ? err.details.join(" · ") : "Couldn't create the folder");
    } finally {
      setCreatingFolder(false);
    }
  }

  async function handleDeleteFolder(folder: Folder) {
    setError("");
    try {
      await foldersApi.delete(token, folder.id);
      await reloadDocuments();
    } catch (err) {
      setError(err instanceof ApiException ? err.message : "Couldn't delete the folder");
    }
  }

  async function handleMove(doc: Document, folderId: string | null) {
    setError("");
    try {
      await documentsApi.move(token, doc.id, folderId);
      await reloadDocuments();
    } catch (err) {
      setError(err instanceof ApiException ? err.message : "Couldn't move the document");
    }
  }

  async function handleReprocess(doc: Document) {
    setError("");
    try {
      await documentsApi.reprocess(token, doc.id);
      await reloadDocuments();
    } catch (err) {
      setError(err instanceof ApiException ? err.message : "Couldn't reprocess the document");
    }
  }

  // Keep statuses fresh while the worker is processing uploads.
  const processing = documents.some((d) => d.status === "PROCESSING");
  useEffect(() => {
    if (!processing) return;
    const id = setInterval(reloadDocuments, 2000);
    return () => clearInterval(id);
  }, [processing, reloadDocuments]);

  async function handleLoadMore() {
    setLoadingMore(true);
    await loadDocuments(pagesLoaded.current + 1);
    setLoadingMore(false);
  }

  async function handleSummarize(id: string) {
    setSummaries((prev) => ({ ...prev, [id]: { loading: true } }));
    try {
      const data = await aiApi.summarize(token, id);
      setSummaries((prev) => ({ ...prev, [id]: { data } }));
    } catch (err) {
      const message = err instanceof ApiException ? err.message : "Summary failed";
      setSummaries((prev) => ({ ...prev, [id]: { error: message } }));
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = "";

    // Fail fast on what the API would reject anyway
    const mimeType = detectMimeType(file);
    if (!mimeType) {
      setError(`"${file.name}" isn't a supported file type`);
      return;
    }
    if (file.size === 0) {
      setError(`"${file.name}" is empty`);
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`"${file.name}" is larger than the 100 MB limit`);
      return;
    }

    setUploading(true);
    setError("");

    let documentId: string | null = null;
    try {
      // 1. Get presigned URL
      const created = await documentsApi.getUploadUrl(token, {
        name: file.name,
        mimeType,
        sizeBytes: file.size,
        ...(currentFolder ? { folderId: currentFolder.id } : {}),
      });
      documentId = created.documentId;

      // 2. Upload directly to S3 (a network/CORS failure rejects instead of returning a status)
      const put = await fetch(created.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": mimeType },
      }).catch(() => null);
      if (!put?.ok) {
        // Don't leave an orphaned PENDING record behind.
        await documentsApi.delete(token, documentId).catch(() => {});
        throw new ApiException(
          put?.status ?? 0,
          put ? `Storage upload failed (${put.status})` : "Couldn't reach file storage — upload failed"
        );
      }

      // 3. Confirm upload
      await documentsApi.confirmUpload(token, documentId);

      // 4. Reload list
      await reloadDocuments();
    } catch (err) {
      setError(err instanceof ApiException ? err.message : "Upload failed");
      if (documentId) reloadDocuments();
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await documentsApi.delete(token, id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      setTotal((t) => Math.max(0, t - 1));
      setWorkspaceTotal((t) => Math.max(0, t - 1));
    } catch (err) {
      setError(err instanceof ApiException ? err.message : "Delete failed");
    }
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return "just now"; // also covers small client/server clock skew
    if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
    if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
    if (diff < 604800000) return Math.floor(diff / 86400000) + "d ago";
    return d.toLocaleDateString();
  }

  const statusColors: Record<string, { bg: string; color: string }> = {
    READY: { bg: "hsl(155, 75%, 50%, 0.15)", color: "hsl(155, 75%, 55%)" },
    PROCESSING: { bg: "hsl(40, 90%, 55%, 0.15)", color: "hsl(40, 90%, 55%)" },
    PENDING: { bg: "hsl(252, 78%, 54%, 0.15)", color: "var(--brand-400)" },
    FAILED: { bg: "hsl(0, 75%, 50%, 0.15)", color: "hsl(0, 75%, 55%)" },
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h1 className="panel-title">Documents</h1>
          <p className="panel-subtitle">
            {currentFolder
              ? `${total} document${total !== 1 ? "s" : ""} in ${currentFolder.name}`
              : `${workspaceTotal} document${workspaceTotal !== 1 ? "s" : ""} in your workspace`}
          </p>
        </div>
        {canUpload && (
        <div style={{ display: "flex", gap: 10 }}>
          <button
            className="btn-secondary"
            onClick={() => setNewFolderName((v) => (v === null ? "" : null))}
            aria-expanded={newFolderName !== null}
          >
            New folder
          </button>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleUpload}
            style={{ display: "none" }}
            accept={ACCEPT_ATTR}
            data-testid="upload-input"
          />
          <button
            className="btn-primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{ padding: "10px 20px", fontSize: "14px" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: "relative", zIndex: 1 }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>{uploading ? "Uploading..." : "Upload"}</span>
          </button>
        </div>
        )}
      </div>

      <nav className="folder-breadcrumb" aria-label="Folder">
        <button
          className={`folder-crumb ${currentFolder ? "" : "current"}`}
          onClick={() => openFolder([])}
          aria-current={currentFolder ? undefined : "page"}
        >
          All documents
        </button>
        {folderPath.map((f, i) => (
          <span key={f.id} className="folder-crumb-wrap">
            <span className="folder-crumb-sep" aria-hidden>/</span>
            <button
              className={`folder-crumb ${i === folderPath.length - 1 ? "current" : ""}`}
              onClick={() => openFolder(folderPath.slice(0, i + 1))}
              aria-current={i === folderPath.length - 1 ? "page" : undefined}
            >
              {f.name}
            </button>
          </span>
        ))}
      </nav>

      {newFolderName !== null && (
        <form className="folder-new glass-card" onSubmit={handleCreateFolder} aria-label="New folder">
          <input
            className="form-input"
            placeholder="Folder name"
            aria-label="Folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            maxLength={100}
            autoFocus
          />
          <button type="submit" className="btn-primary" disabled={creatingFolder || !newFolderName.trim()} style={{ padding: "10px 18px", fontSize: "14px" }}>
            <span>{creatingFolder ? "Creating…" : "Create"}</span>
          </button>
          <button type="button" className="btn-secondary" onClick={() => setNewFolderName(null)}>Cancel</button>
        </form>
      )}

      {error && <div className="auth-error" style={{ marginBottom: "1rem" }}>{error}</div>}

      {!loading && folders.length > 0 && (
        <div className="folder-list" aria-label="Folders">
          {folders.map((f) => {
            const empty = (f._count?.documents ?? 0) + (f._count?.children ?? 0) === 0;
            return (
              <div key={f.id} className="folder-row glass-card">
                <button className="folder-open" onClick={() => openFolder([...folderPath, { id: f.id, name: f.name }])}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="hsl(40, 90%, 55%, 0.25)" stroke="hsl(40, 90%, 60%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  <span className="doc-name">{f.name}</span>
                  <span className="doc-meta">
                    {f._count?.documents ?? 0} doc{f._count?.documents === 1 ? "" : "s"}
                    {f._count?.children ? ` · ${f._count.children} folder${f._count.children === 1 ? "" : "s"}` : ""}
                  </span>
                </button>
                {canUpload && empty && (
                  <button
                    className="doc-action-btn"
                    onClick={() => handleDeleteFolder(f)}
                    title="Delete empty folder"
                    aria-label={`Delete folder ${f.name}`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="panel-empty">
          <div className="loading-spinner" />
          <p>Loading documents...</p>
        </div>
      ) : documents.length === 0 && folders.length > 0 ? null : documents.length === 0 ? (
        <div className="panel-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <p style={{ color: "var(--text-muted)", marginTop: "1rem" }}>
            {currentFolder ? "This folder is empty" : "No documents yet"}
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
            {!canUpload
              ? "Documents shared in your workspace will appear here"
              : currentFolder
                ? "Upload here, or move documents into this folder"
                : "Upload your first document to get started"}
          </p>
        </div>
      ) : (
        <div className="doc-list">
          {documents.map((doc) => {
            const sc = statusColors[doc.status] || statusColors.PENDING;
            const summary = summaries[doc.id];
            return (
              <div key={doc.id} className="doc-item">
              <div className="doc-row glass-card">
                <div className="doc-icon-wrap">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(252, 78%, 70%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="doc-name">{doc.name}</div>
                  <div className="doc-meta">{formatSize(doc.sizeBytes)} · {formatDate(doc.createdAt)}</div>
                  {doc.status === "FAILED" && (
                    <div className="doc-meta doc-failure" role="status">
                      {doc.processingError ?? "Processing failed"}
                    </div>
                  )}
                </div>
                <span
                  className="doc-status"
                  style={{ background: sc.bg, color: sc.color }}
                  title={doc.status === "FAILED" ? doc.processingError ?? "Processing failed" : undefined}
                >
                  {doc.status === "READY" ? "✓ Ready" : doc.status}
                </span>
                {doc.status === "READY" && (
                  <button
                    className="doc-action-btn"
                    onClick={() => handleSummarize(doc.id)}
                    disabled={summaries[doc.id]?.loading}
                    title="Summarize with AI"
                    aria-label={`Summarize ${doc.name}`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2z" />
                    </svg>
                  </button>
                )}
                {doc.status === "FAILED" && canDelete(doc) && (
                  <button
                    className="btn-secondary doc-retry"
                    onClick={() => handleReprocess(doc)}
                    aria-label={`Retry processing ${doc.name}`}
                  >
                    Retry
                  </button>
                )}
                {canDelete(doc) && (doc.status === "READY" || doc.status === "FAILED") && (allFolders.length > 0 || currentFolder) && (
                  <select
                    className="form-input doc-move"
                    aria-label={`Move ${doc.name}`}
                    title="Move to folder"
                    value=""
                    onChange={(e) => handleMove(doc, e.target.value === "__root" ? null : e.target.value)}
                  >
                    <option value="" disabled>Move…</option>
                    {currentFolder && <option value="__root">All documents (no folder)</option>}
                    {allFolders
                      .filter((f) => f.id !== currentFolder?.id)
                      .map((f) => (
                        <option key={f.id} value={f.id}>{f.path.slice(1).split("/").join(" / ")}</option>
                      ))}
                  </select>
                )}
                {canDelete(doc) && (
                <button
                  className="doc-action-btn"
                  onClick={() => handleDelete(doc.id, doc.name)}
                  title="Delete document"
                  aria-label={`Delete ${doc.name}`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
                )}
              </div>
              {summary && (
                <div className="doc-summary" role="region" aria-label={`Summary of ${doc.name}`}>
                  {summary.loading && <p className="doc-summary-muted">Summarizing…</p>}
                  {summary.error && <p className="doc-summary-error" role="alert">{summary.error}</p>}
                  {summary.data && (
                    <>
                      <p>{summary.data.summary}</p>
                      {summary.data.keyPoints.length > 0 && (
                        <ul>
                          {summary.data.keyPoints.map((point, i) => (
                            <li key={i}>{point}</li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              )}
              </div>
            );
          })}
          {documents.length < total && (
            <button
              className="btn-secondary"
              onClick={handleLoadMore}
              disabled={loadingMore}
              style={{ alignSelf: "center", marginTop: "0.5rem" }}
            >
              {loadingMore ? "Loading..." : `Load more (${total - documents.length} remaining)`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────
   Search Panel
────────────────────────────────────────────── */
function SearchPanel({ token }: { token: string }) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("hybrid");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [searchError, setSearchError] = useState("");
  const [took, setTook] = useState(0);
  // Only semantic scores are similarities in [0, 1]; hybrid (RRF) and fulltext (ts_rank) aren't percentages.
  const [scoredAsSimilarity, setScoredAsSimilarity] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    const q = query.trim();
    setSearching(true);
    setSearched(false);
    setSearchError("");
    try {
      const res = await searchApi.search(token, { q, mode, limit: 20 });
      setResults(res.results);
      setTook(res.took);
      // A semantic request falls back to fulltext without a key: trust the mode the API used
      setScoredAsSimilarity(res.mode === "semantic");
      setSearchedQuery(q);
      setSearched(true);
    } catch (err) {
      setResults([]);
      setSearchError(err instanceof ApiException ? err.details.join(" · ") : "Search failed. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h1 className="panel-title">AI Search</h1>
          <p className="panel-subtitle">Search across all your documents with AI-powered semantic understanding</p>
        </div>
      </div>

      <form onSubmit={handleSearch} className="search-bar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--brand-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          className="search-input"
          placeholder="Ask anything about your documents..."
          value={query}
          maxLength={500}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <select
          className="search-mode"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
        >
          <option value="hybrid">Hybrid</option>
          <option value="semantic">Semantic</option>
          <option value="fulltext">Fulltext</option>
        </select>
        <button type="submit" className="btn-primary" style={{ padding: "8px 16px", fontSize: "13px" }} disabled={searching}>
          <span>{searching ? "..." : "Search"}</span>
        </button>
      </form>

      {searchError && <div className="auth-error" role="alert" style={{ marginBottom: "1rem" }}>{searchError}</div>}

      {searched && (
        <div style={{ marginBottom: "1rem" }}>
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
            {results.length} result{results.length !== 1 ? "s" : ""} · {took}ms
          </p>
        </div>
      )}

      {results.length > 0 ? (
        <div className="doc-list">
          {results.map((r) => (
            <div key={r.id} className="doc-row glass-card">
              <div className="doc-icon-wrap">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(252, 78%, 70%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="doc-name">{r.name}</div>
                {r.highlights?.[0] && (
                  <div className="doc-meta">
                    <Highlight text={r.highlights[0]} />
                  </div>
                )}
              </div>
              {scoredAsSimilarity && (
                <span className="search-score">
                  {(r.score * 100).toFixed(0)}% match
                </span>
              )}
            </div>
          ))}
        </div>
      ) : searched ? (
        <div className="panel-empty">
          <p style={{ color: "var(--text-muted)" }}>No results found for &quot;{searchedQuery}&quot;</p>
        </div>
      ) : !searching && !searchError ? (
        <div className="panel-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <p style={{ color: "var(--text-muted)", marginTop: "1rem" }}>Search your documents</p>
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Try &quot;invoice processing&quot; or &quot;Q3 financial results&quot;</p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Renders a ts_headline snippet. Only the <mark> tags are produced by the
 * server; the text between them is raw document content (user-controlled), so
 * it is rendered as text — never via dangerouslySetInnerHTML.
 */
function Highlight({ text }: { text: string }) {
  const parts = text.split(/<mark>(.*?)<\/mark>/g);
  return (
    <>
      {parts.map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : part))}
    </>
  );
}

/* ──────────────────────────────────────────────
   Chat Panel
────────────────────────────────────────────── */
function uniqueSources(citations: Citation[]) {
  return [...new Set(citations.map((c) => c.documentName))];
}

function ChatPanel({ token }: { token: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Set when handleSend creates a conversation, so the load effect doesn't
  // overwrite the optimistic user message with a not-yet-populated history.
  const createdBySend = useRef<string | null>(null);

  // Load conversations
  useEffect(() => {
    conversationsApi.list(token).then(setConversations).catch(() => {});
  }, [token]);

  // Load messages when active conv changes
  useEffect(() => {
    if (!activeConv) return;
    if (createdBySend.current === activeConv) {
      createdBySend.current = null;
      return;
    }
    setMessages([]);
    conversationsApi.get(token, activeConv).then((c) => setMessages(c.messages)).catch(() => {});
  }, [activeConv, token]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamText]);

  async function handleNewChat() {
    if (streaming) return;
    try {
      const conv = await conversationsApi.create(token, { title: "New conversation" });
      setConversations((prev) => [conv, ...prev]);
      setActiveConv(conv.id);
    } catch {
      // ignore
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || streaming) return;

    // Create conversation if none selected
    let convId = activeConv;
    if (!convId) {
      try {
        const conv = await conversationsApi.create(token, { title: input.slice(0, 50) });
        setConversations((prev) => [conv, ...prev]);
        convId = conv.id;
        createdBySend.current = convId;
        setActiveConv(convId);
      } catch {
        return;
      }
    }

    const appendAssistant = (content: string, extra: Partial<Message> = {}) =>
      setMessages((prev) => [
        ...prev,
        { id: "ai-" + Date.now(), role: "assistant", content, createdAt: new Date().toISOString(), ...extra },
      ]);

    // Add user message to UI
    const userMsg: Message = {
      id: "temp-" + Date.now(),
      role: "user",
      content: input.trim(),
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setStreaming(true);
    setStreamText("");

    // Every outcome ends as a message in the list: streamText is only shown
    // while streaming, so anything left there would vanish when it ends.
    let fullText = "";
    let finished = false;
    try {
      let citations: Citation[] = [];
      for await (const chunk of conversationsApi.sendMessage(token, convId, userMsg.content)) {
        if (chunk.type === "chunk" && chunk.content) {
          fullText += chunk.content;
          setStreamText(fullText);
        } else if (chunk.type === "citations") {
          citations = chunk.citations ?? [];
        } else if (chunk.type === "done") {
          finished = true;
          appendAssistant(fullText, { citations });
        } else if (chunk.type === "error") {
          finished = true;
          appendAssistant(fullText, { error: chunk.error || "Something went wrong. Please try again." });
        }
      }
      if (!finished) {
        appendAssistant(fullText, { error: "The response was cut off. Please try again." });
      }
    } catch (err) {
      if (!finished) {
        appendAssistant(fullText, {
          error: err instanceof ApiException ? err.message : "Failed to get a response. Please try again.",
        });
      }
    } finally {
      setStreamText("");
      setStreaming(false);
    }
  }

  return (
    <div className="panel chat-panel">
      {/* Conversations sidebar */}
      <div className="chat-sidebar">
        <button className="btn-primary chat-new-btn" onClick={handleNewChat} disabled={streaming} style={{ padding: "8px 14px", fontSize: "13px", width: "100%" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: "relative", zIndex: 1 }}>
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          <span>New Chat</span>
        </button>
        <div className="chat-conv-list">
          {conversations.map((c) => (
            <button
              key={c.id}
              className={`chat-conv-item ${activeConv === c.id ? "active" : ""}`}
              onClick={() => setActiveConv(c.id)}
              disabled={streaming && activeConv !== c.id}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.title || "Untitled"}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Chat main */}
      <div className="chat-main">
        <div className="chat-messages">
          {messages.length === 0 && !streaming && (
            <div className="panel-empty" style={{ marginTop: "4rem" }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <p style={{ color: "var(--text-muted)", marginTop: "1rem" }}>Ask anything about your documents</p>
              <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>AI will search and cite relevant passages</p>
            </div>
          )}

          {messages.map((msg) => {
            const isUser = msg.role.toLowerCase() === "user";
            const sources = isUser ? [] : uniqueSources(msg.citations ?? msg.metadata?.citations ?? []);
            return (
              <div
                key={msg.id}
                className={`chat-msg ${isUser ? "chat-msg-user" : "chat-msg-ai"}`}
                data-role={isUser ? "user" : "assistant"}
              >
                <div className="chat-msg-avatar">{isUser ? "You" : "AI"}</div>
                <div className="chat-msg-content">
                  {msg.content}
                  {msg.error && (
                    <p className="chat-msg-error" role="alert" style={{ marginTop: msg.content ? "0.5rem" : 0 }}>
                      ⚠️ {msg.error}
                    </p>
                  )}
                  {sources.length > 0 && (
                    <div className="chat-citations" aria-label="Sources">
                      {sources.map((name) => (
                        <span key={name} className="chat-citation">{name}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {streaming && streamText && (
            <div className="chat-msg chat-msg-ai">
              <div className="chat-msg-avatar">AI</div>
              <div className="chat-msg-content">
                {streamText}
                <span className="typing-cursor">▊</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSend} className="chat-input-bar">
          <input
            type="text"
            className="chat-input"
            placeholder="Ask a question about your documents..."
            value={input}
            maxLength={10000}
            onChange={(e) => setInput(e.target.value)}
            disabled={streaming}
          />
          <button
            type="submit"
            className="btn-primary"
            disabled={streaming || !input.trim()}
            style={{ padding: "10px 16px", fontSize: "13px", borderRadius: "10px" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: "relative", zIndex: 1 }}>
              <path d="m22 2-7 20-4-9-9-4z" />
              <path d="m22 2-11 11" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
