/**
 * API client helper for DocuFlow AI frontend.
 * All requests go through the Next.js rewrite proxy → NestJS backend.
 */

const API_BASE = "/api/v1";

interface ApiError {
  statusCode: number;
  message: string | string[];
  error?: string;
}

export class ApiException extends Error {
  statusCode: number;
  details: string[];

  constructor(statusCode: number, message: string | string[]) {
    const messages = Array.isArray(message) ? message : [message];
    super(messages[0]);
    this.statusCode = statusCode;
    this.details = messages;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body: ApiError | null = null;
    try {
      body = await res.json();
    } catch {
      // Not JSON
    }
    throw new ApiException(
      res.status,
      body?.message || res.statusText
    );
  }

  // 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  // Backend TransformInterceptor wraps every success body as { data, meta }
  const body = await res.json();
  return (body && typeof body === "object" && "data" in body && "meta" in body
    ? body.data
    : body) as T;
}

/* ──────────────────────────────────────────────
   Session refresh
   Access tokens live 15 minutes. When an authenticated request returns 401,
   the client asks the session owner (AuthProvider) for a fresh access token
   once and retries. Concurrent 401s share a single refresh call, because
   refresh tokens are single-use (rotation) — two parallel refreshes would
   revoke each other.
────────────────────────────────────────────── */

/** Receives the access token that was rejected; resolves to a usable one, or null. */
type RefreshHandler = (rejectedToken: string) => Promise<string | null>;

let refreshHandler: RefreshHandler | null = null;
let inflightRefresh: Promise<string | null> | null = null;

export function setRefreshHandler(handler: RefreshHandler | null) {
  refreshHandler = handler;
}

function refreshAccessToken(rejectedToken: string): Promise<string | null> {
  if (!refreshHandler) return Promise.resolve(null);
  if (!inflightRefresh) {
    inflightRefresh = refreshHandler(rejectedToken).finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

/** Authenticated fetch against the API that transparently refreshes once on 401. */
async function authedFetch(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const send = (t: string) =>
    fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { ...authHeaders(t, init.body !== undefined), ...init.headers },
    });

  const res = await send(token);
  if (res.status !== 401) return res;

  const fresh = await refreshAccessToken(token);
  return fresh ? send(fresh) : res;
}

/**
 * Content-Type is only sent with a body: Fastify rejects
 * `application/json` with an empty body (FST_ERR_CTP_EMPTY_JSON_BODY).
 */
function authHeaders(token?: string, hasBody = false): HeadersInit {
  const headers: Record<string, string> = {};
  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

/* ──────────────────────────────────────────────
   Auth API
────────────────────────────────────────────── */

export interface RegisterPayload {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  /** Required unless signing up through an invitation link */
  organizationName?: string;
  invitationToken?: string;
}

export type Role = "VIEWER" | "MEMBER" | "ADMIN" | "OWNER";
export const ROLES: Role[] = ["VIEWER", "MEMBER", "ADMIN", "OWNER"];
export const ROLE_RANK: Record<Role, number> = { VIEWER: 0, MEMBER: 1, ADMIN: 2, OWNER: 3 };

export interface SessionOrganization {
  id: string;
  name: string;
  slug: string;
  role: Role;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthTokens {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  organization: SessionOrganization;
  tokens: TokenPair;
}

export const authApi = {
  // Register does not issue tokens — callers must log in afterwards
  register: (data: RegisterPayload) =>
    fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(handleResponse<Omit<AuthTokens, "tokens">>),

  login: (data: LoginPayload) =>
    fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(handleResponse<AuthTokens>),

  /** Rotates the refresh token; with `organizationId`, the new session acts in that organization. */
  refresh: (refreshToken: string, organizationId?: string) =>
    fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(organizationId ? { refreshToken, organizationId } : { refreshToken }),
    }).then(handleResponse<TokenPair & { organization?: SessionOrganization }>),

  organizations: (token: string) =>
    authedFetch(`/auth/organizations`, token).then(
      handleResponse<(Omit<SessionOrganization, "role"> & { role: Role; current: boolean })[]>
    ),

  logout: (token: string) =>
    // Plain fetch: a 401 here must not trigger a refresh (we're discarding the session anyway)
    fetch(`${API_BASE}/auth/logout`, {
      headers: authHeaders(token),
      method: "POST",
    }).then(handleResponse<void>),

  me: (token: string) =>
    authedFetch(`/auth/me`, token).then(handleResponse<{ userId: string; email: string; organizationId: string; role: string }>),
};

/* ──────────────────────────────────────────────
   Documents API
────────────────────────────────────────────── */

export interface Document {
  folder?: { id: string; name: string } | null;
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  processingError?: string | null;
  summary?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; firstName: string | null; lastName: string | null };
}

export interface DocumentListResponse {
  items: Document[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export const documentsApi = {
  /** `folderId: "root"` lists documents that are not in any folder. */
  list: (token: string, params?: { limit?: number; page?: number; folderId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.page) qs.set("page", String(params.page));
    if (params?.folderId) qs.set("folderId", params.folderId);
    return authedFetch(`/documents?${qs}`, token).then(handleResponse<DocumentListResponse>);
  },

  get: (token: string, id: string) =>
    authedFetch(`/documents/${id}`, token).then(handleResponse<Document>),

  getUploadUrl: (token: string, data: { name: string; mimeType: string; sizeBytes: number; folderId?: string }) =>
    authedFetch(`/documents/upload-url`, token, {
      method: "POST",
      body: JSON.stringify(data),
    }).then(handleResponse<{ documentId: string; uploadUrl: string }>),

  confirmUpload: (token: string, id: string) =>
    authedFetch(`/documents/${id}/confirm`, token, {
      method: "POST",
    }).then(handleResponse<Document>),

  getDownloadUrl: (token: string, id: string) =>
    authedFetch(`/documents/${id}/download`, token).then(handleResponse<{ downloadUrl: string }>),

  delete: (token: string, id: string) =>
    authedFetch(`/documents/${id}`, token, {
      method: "DELETE",
    }).then(handleResponse<void>),

  /** `folderId: null` moves the document out of all folders. */
  move: (token: string, id: string, folderId: string | null) =>
    authedFetch(`/documents/${id}`, token, {
      method: "PATCH",
      body: JSON.stringify({ folderId }),
    }).then(handleResponse<Document>),

  reprocess: (token: string, id: string) =>
    authedFetch(`/documents/${id}/reprocess`, token, { method: "POST" }).then(
      handleResponse<{ id: string; status: string }>
    ),

  indexStatus: (token: string) =>
    authedFetch(`/documents/index-status`, token).then(handleResponse<{ needsIndexing: number }>),

  reindex: (token: string) =>
    authedFetch(`/documents/reindex`, token, { method: "POST" }).then(handleResponse<{ queued: number }>),
};

/* ──────────────────────────────────────────────
   Folders API
   The organization's hidden "/" folder is never listed: "no folder" is the root.
────────────────────────────────────────────── */

export interface Folder {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  _count?: { children: number; documents: number };
}

export const foldersApi = {
  list: (token: string, parentId?: string) =>
    authedFetch(`/folders${parentId ? `?parentId=${parentId}` : ""}`, token).then(handleResponse<Folder[]>),

  all: (token: string) => authedFetch(`/folders/all`, token).then(handleResponse<Folder[]>),

  create: (token: string, data: { name: string; parentId?: string }) =>
    authedFetch(`/folders`, token, { method: "POST", body: JSON.stringify(data) }).then(handleResponse<Folder>),

  delete: (token: string, id: string) =>
    authedFetch(`/folders/${id}`, token, { method: "DELETE" }).then(handleResponse<void>),
};

/* ──────────────────────────────────────────────
   Team API (members + invitations)
────────────────────────────────────────────── */

export interface Member {
  userId: string;
  role: Role;
  joinedAt: string;
  user: { id: string; email: string; firstName: string | null; lastName: string | null };
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "CANCELLED";
  expiresAt: string;
  createdAt: string;
  /** Present while the invitation can still be accepted */
  invitationToken?: string;
  invitedBy: { firstName: string | null; lastName: string | null; email: string };
}

export interface InvitationPreview {
  organizationName: string;
  email: string;
  role: Role;
  status: Invitation["status"];
  invitedBy: string | null;
  hasAccount: boolean;
}

export function inviteLink(token: string) {
  return `${window.location.origin}/invite?token=${encodeURIComponent(token)}`;
}

export const teamApi = {
  members: (token: string) =>
    authedFetch(`/organizations/current/members`, token).then(handleResponse<Member[]>),

  setRole: (token: string, userId: string, role: Role) =>
    authedFetch(`/organizations/current/members/${userId}`, token, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }).then(handleResponse<Member>),

  /** Removing yourself leaves the organization. */
  remove: (token: string, userId: string) =>
    authedFetch(`/organizations/current/members/${userId}`, token, { method: "DELETE" }).then(handleResponse<void>),

  invitations: (token: string) =>
    authedFetch(`/organizations/current/invitations`, token).then(handleResponse<Invitation[]>),

  invite: (token: string, data: { email: string; role: Role }) =>
    authedFetch(`/organizations/current/invitations`, token, {
      method: "POST",
      body: JSON.stringify(data),
    }).then(handleResponse<Invitation & { invitationToken: string }>),

  cancelInvitation: (token: string, id: string) =>
    authedFetch(`/organizations/current/invitations/${id}`, token, { method: "DELETE" }).then(handleResponse<void>),

  previewInvitation: (invitationToken: string) =>
    fetch(`${API_BASE}/invitations/preview?token=${encodeURIComponent(invitationToken)}`).then(
      handleResponse<InvitationPreview>
    ),

  acceptInvitation: (token: string, invitationToken: string) =>
    authedFetch(`/invitations/accept`, token, {
      method: "POST",
      body: JSON.stringify({ token: invitationToken }),
    }).then(handleResponse<{ organization: { id: string; name: string }; role?: Role; alreadyMember?: boolean }>),
};

export interface DocumentSummary {
  summary: string;
  keyPoints: string[];
  wordCount: number;
}

export const aiApi = {
  summarize: (token: string, documentId: string) =>
    authedFetch(`/ai/documents/${documentId}/summarize`, token, { method: "POST" }).then(
      handleResponse<DocumentSummary>
    ),
};

/* ──────────────────────────────────────────────
   Search API
────────────────────────────────────────────── */

export interface SearchResult {
  id: string;
  name: string;
  mimeType: string;
  score: number;
  /** ts_headline snippets. Matches are wrapped in <mark>; everything else is raw document text. */
  highlights: string[];
  status: string;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  mode: string;
  query: string;
  hasMore: boolean;
  took: number;
}

export const searchApi = {
  search: (token: string, params: { q: string; mode?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams({ q: params.q });
    if (params.mode) qs.set("mode", params.mode);
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.offset) qs.set("offset", String(params.offset));
    return authedFetch(`/search?${qs}`, token).then(handleResponse<SearchResponse>);
  },

  suggest: (token: string, q: string) =>
    authedFetch(`/search/suggest?q=${encodeURIComponent(q)}`, token).then(handleResponse<{ suggestions: { id: string; name: string }[] }>),
};

/* ──────────────────────────────────────────────
   Conversations API
────────────────────────────────────────────── */

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface Citation {
  documentId: string;
  documentName: string;
  chunkIndex: number;
}

export interface Message {
  id: string;
  /** "USER" | "ASSISTANT" from the API; compare case-insensitively. */
  role: string;
  content: string;
  /** Set on messages streamed in this session. */
  citations?: Citation[];
  /** Persisted messages carry citations here. */
  metadata?: { citations?: Citation[] } | null;
  /** Client-only: why this answer failed or is incomplete. */
  error?: string;
  createdAt: string;
}

export const conversationsApi = {
  create: (token: string, data: { title?: string; documentIds?: string[] }) =>
    authedFetch(`/conversations`, token, {
      method: "POST",
      body: JSON.stringify(data),
    }).then(handleResponse<Conversation>),

  list: (token: string) =>
    authedFetch(`/conversations`, token).then(handleResponse<Conversation[]>),

  get: (token: string, id: string) =>
    authedFetch(`/conversations/${id}`, token).then(handleResponse<Conversation & { messages: Message[] }>),

  delete: (token: string, id: string) =>
    authedFetch(`/conversations/${id}`, token, {
      method: "DELETE",
    }).then(handleResponse<void>),

  /**
   * Send a message and read the SSE stream.
   * Returns an async generator of chunks.
   */
  sendMessage: async function* (
    token: string,
    conversationId: string,
    content: string,
    documentIds?: string[]
  ) {
    const res = await authedFetch(`/conversations/${conversationId}/messages`, token, {
      method: "POST",
      body: JSON.stringify({ content, documentIds }),
    });

    if (!res.ok) {
      // 404 / 503 ("AI is not configured") arrive as normal JSON errors
      await handleResponse(res);
    }

    const reader = res.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (!done) buffer += decoder.decode(value, { stream: true });
      // On close, also parse a final event that wasn't newline-terminated
      const lines = buffer.split("\n");
      buffer = done ? "" : lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            yield data as { type: string; content?: string; citations?: Citation[]; error?: string };
          } catch {
            // Skip malformed JSON
          }
        }
      }
      if (done) break;
    }
  },
};

/* ──────────────────────────────────────────────
   Workflows (AI agent) API
────────────────────────────────────────────── */

export type WorkflowType = "document_categorization" | "data_extraction" | "general";
export type WorkflowStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

export interface Workflow {
  id: string;
  type: WorkflowType;
  status: WorkflowStatus;
  input: { instructions?: string; [key: string]: unknown };
  output: {
    result: string;
    toolCalls: number;
    updatedDocumentIds: string[];
    totalTokens: number;
  } | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export const MAX_WORKFLOW_INSTRUCTIONS = 2000;

export const workflowsApi = {
  create: (token: string, data: { type: WorkflowType; instructions: string }) =>
    authedFetch(`/workflows`, token, {
      method: "POST",
      body: JSON.stringify(data),
    }).then(handleResponse<Workflow>),

  list: (token: string) =>
    authedFetch(`/workflows`, token).then(handleResponse<Workflow[]>),

  get: (token: string, id: string) =>
    authedFetch(`/workflows/${id}`, token).then(handleResponse<Workflow>),
};

/* ──────────────────────────────────────────────
   Settings API (organization AI keys)
   The key is write-only: responses carry only its last 4 characters.
────────────────────────────────────────────── */

export interface AiKeyStatus {
  configured: boolean;
  source: "organization" | "environment" | null;
  last4: string | null;
  updatedAt: string | null;
  updatedBy: { firstName: string | null; lastName: string | null } | null;
  canStoreKeys: boolean;
}

export const settingsApi = {
  getAi: (token: string) =>
    authedFetch(`/settings/ai`, token).then(handleResponse<AiKeyStatus>),

  setOpenAIKey: (token: string, apiKey: string) =>
    authedFetch(`/settings/ai/openai-key`, token, {
      method: "PUT",
      body: JSON.stringify({ apiKey }),
    }).then(handleResponse<AiKeyStatus>),

  removeOpenAIKey: (token: string) =>
    authedFetch(`/settings/ai/openai-key`, token, { method: "DELETE" }).then(handleResponse<void>),
};
