"use client";

import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { authApi, setRefreshHandler, ApiException, type AuthTokens, type RegisterPayload, type SessionOrganization } from "./api";

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface Organization {
  id: string;
  name: string;
}

interface Session {
  user: User;
  organization: Organization | null;
  accessToken: string;
  refreshToken: string | null;
}

interface AuthState {
  user: User | null;
  organization: Organization | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  /** Moves the session into another organization the user belongs to. */
  switchOrganization: (organizationId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/* ──────────────────────────────────────────────
   Session store
   localStorage is the source of truth, read through useSyncExternalStore:
   no setState-in-effect on mount, no hydration mismatch (the server snapshot
   is "loading"), and login/logout in one tab propagates to the others via
   the `storage` event.
────────────────────────────────────────────── */

const STORAGE_KEY = "docuflow_auth";
const SESSION_EVENT = "docuflow-auth-change";

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode) — session lasts until reload
  }
  window.dispatchEvent(new Event(SESSION_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(SESSION_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SESSION_EVENT, onChange);
  };
}

function parseSession(raw: string | null): Session | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<Session>;
    return s.accessToken && s.user ? (s as Session) : null;
  } catch {
    return null;
  }
}

function sessionFromTokens(tokens: AuthTokens): Session {
  return {
    user: { ...tokens.user, role: tokens.organization.role },
    organization: { id: tokens.organization.id, name: tokens.organization.name },
    accessToken: tokens.tokens.accessToken,
    refreshToken: tokens.tokens.refreshToken,
  };
}

/** Applies a refresh response: new tokens and, when present, the session's (possibly changed) org and role. */
function withTokens(
  current: Session,
  tokens: { accessToken: string; refreshToken: string; organization?: SessionOrganization }
): Session {
  const org = tokens.organization;
  return {
    ...current,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    ...(org
      ? { user: { ...current.user, role: org.role }, organization: { id: org.id, name: org.name } }
      : {}),
  };
}

/** Serializes refresh-token use across tabs (refresh tokens are single-use). */
function withRefreshLock<T>(run: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request("docuflow-auth-refresh", run) as Promise<T>;
  }
  return run();
}

/**
 * Called when `rejectedToken` got a 401. Exchanges the stored refresh token for
 * a new pair and returns the new access token, or null if the session is over.
 *
 * Refresh tokens are single-use, so tabs must not refresh concurrently: the
 * loser would get a 401 and wipe the session the winner just saved. A Web Lock
 * serializes refreshes across tabs, and inside it a session whose access token
 * already differs from the rejected one was refreshed by someone else — reuse it.
 */
async function refreshSession(rejectedToken: string): Promise<string | null> {
  const run = async (): Promise<string | null> => {
    const current = parseSession(readRaw());
    if (!current) return null;
    if (current.accessToken !== rejectedToken) return current.accessToken;
    if (!current.refreshToken) {
      writeSession(null);
      return null;
    }
    try {
      const tokens = await authApi.refresh(current.refreshToken);
      // Logged out (or switched account) while the request was in flight
      if (parseSession(readRaw())?.refreshToken !== current.refreshToken) return null;
      // The server may have moved the session (e.g. removed from this org → another one)
      writeSession(withTokens(current, tokens));
      return tokens.accessToken;
    } catch (err) {
      // Only a definitive rejection ends the session; a network blip keeps it
      if (err instanceof ApiException && err.statusCode === 401) writeSession(null);
      return null;
    }
  };

  return withRefreshLock(run);
}

async function switchSession(organizationId: string): Promise<void> {
  await withRefreshLock(async () => {
    const current = parseSession(readRaw());
    if (!current?.refreshToken) throw new ApiException(401, "Your session has ended. Please sign in again.");
    try {
      const tokens = await authApi.refresh(current.refreshToken, organizationId);
      writeSession(withTokens(current, tokens));
    } catch (err) {
      if (err instanceof ApiException && err.statusCode === 401) writeSession(null);
      throw err;
    }
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // `undefined` on the server and during hydration → isLoading
  const raw = useSyncExternalStore<string | null | undefined>(subscribe, readRaw, () => undefined);
  const session = useMemo(() => (raw === undefined ? null : parseSession(raw)), [raw]);

  useEffect(() => {
    setRefreshHandler(refreshSession);
    return () => setRefreshHandler(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await authApi.login({ email, password });
    writeSession(sessionFromTokens(tokens));
  }, []);

  const register = useCallback(
    async (data: RegisterPayload) => {
      await authApi.register(data);
      let tokens: AuthTokens;
      try {
        tokens = await authApi.login({ email: data.email, password: data.password });
      } catch {
        // Retrying the signup would now fail with "already exists"
        throw new ApiException(0, "Your account was created, but signing in failed. Please sign in.");
      }
      writeSession(sessionFromTokens(tokens));
    },
    []
  );

  const logout = useCallback(async () => {
    const token = session?.accessToken;
    writeSession(null);
    if (token) {
      try {
        await authApi.logout(token);
      } catch {
        // Ignore logout errors — the local session is already gone
      }
    }
  }, [session?.accessToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      organization: session?.organization ?? null,
      accessToken: session?.accessToken ?? null,
      refreshToken: session?.refreshToken ?? null,
      isLoading: raw === undefined,
      isAuthenticated: session !== null,
      login,
      register,
      logout,
      switchOrganization: switchSession,
    }),
    [raw, session, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
