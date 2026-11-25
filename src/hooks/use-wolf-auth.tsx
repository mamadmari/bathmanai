import { mapServerUser, restFetch } from "@/lib/backend";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const TOKEN_KEY = "wolf.token";
const EXPIRES_KEY = "wolf.expiresAt";
const SESSION_CHECK_MS = 30_000;

export type WolfUser = {
  id: string;
  name?: string;
  username?: string;
  tgId?: number;
  tgUsername?: string;
  firstName?: string;
  lastName?: string;
  image?: string;
  phone?: string;
  role?: "admin" | "vip" | "user" | "assistant";
  isVip?: boolean;
  vipPackage?: string;
  vipExpiresAt?: number;
  isAdmin?: boolean;
  isAssistant?: boolean;
  enabled?: boolean;
  canTrade?: boolean;
  theme?: string;
  language?: string;
  defaultTimeframe?: string;
  defaultMarket?: string;
  notificationsEnabled?: boolean;
  walletAddress?: string;
  registeredAt?: number;
  lastActivity?: number;
};

export type WolfAuth = {
  user: WolfUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isAssistant: boolean;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  loginTelegram: (initData: string) => Promise<void>;
  logout: () => Promise<void>;
  updatePreferences: (prefs: Record<string, unknown>) => Promise<void>;
};

const WolfAuthContext = createContext<WolfAuth | null>(null);

function readToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = window.localStorage.getItem(TOKEN_KEY);
  const expiresAt = Number(window.localStorage.getItem(EXPIRES_KEY) ?? 0);
  // Session already expired (server TTL is 1h by default) → drop it locally.
  if (token && expiresAt && Date.now() > expiresAt) {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(EXPIRES_KEY);
    return null;
  }
  return token;
}

function storeSession(token: string, expiresAt?: number | null) {
  window.localStorage.setItem(TOKEN_KEY, token);
  if (expiresAt) window.localStorage.setItem(EXPIRES_KEY, String(expiresAt));
  else window.localStorage.removeItem(EXPIRES_KEY);
}

function clearSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(EXPIRES_KEY);
}

/** Shared hard-session-timeout watchdog (kicks the user out on expiry). */
function useSessionTimeout(token: string | null, onExpire: () => void) {
  useEffect(() => {
    if (!token) return;
    const check = () => {
      const expiresAt = Number(window.localStorage.getItem(EXPIRES_KEY) ?? 0);
      if (expiresAt && Date.now() > expiresAt) {
        clearSession();
        onExpire();
      }
    };
    check();
    const id = window.setInterval(check, SESSION_CHECK_MS);
    return () => window.clearInterval(id);
  }, [token, onExpire]);
}

// ─── REST backend (self-hosted server/ — NO Convex) ────────────────────────
function RestWolfAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(readToken);
  // Start as resolved when there is no token; otherwise resolve immediately
  // from the cached session only after /api/auth/me confirms it.
  const [me, setMe] = useState<WolfUser | null | undefined>(() => (readToken() ? undefined : null));

  // Load /api/auth/me whenever a token is present. Transient failures (network
  // blips, a restarting API) keep the user signed in from the login response
  // instead of bouncing back to the auth page — that bounce loop is exactly
  // what made "login → loading loop → black screen" on the VPS. Only a real
  // 401 (session revoked/expired) clears the session.
  useEffect(() => {
    if (!token) {
      setMe(null);
      return;
    }
    // A successful login already supplies the user. Do not replace it with an
    // unresolved state while the background session check is running.
    // This prevents RequireAuth/Auth from re-entering a permanent spinner.

    let cancelled = false;
    (async () => {
      try {
        // Do not make the dashboard depend on this request. The login response
        // already contains the complete user; this is only a background
        // refresh. Use a short timeout so a stale browser/proxy connection
        // cannot keep the auth state pending forever.
        const data = await restFetch<{ user: any }>("/api/auth/me", { token, timeoutMs: 4_000 });
        console.log("[auth] /api/auth/me OK:", !!data?.user);
        if (!cancelled && data?.user) setMe(mapServerUser(data.user));
      } catch (e: any) {
        console.error("[auth] /api/auth/me failed:", e?.message, "status:", e?.status);
        if (!cancelled && e?.status === 401) {
          clearSession();
          setToken(null);
          setMe(null);
        }
        // non-401 (timeout/network/5xx): keep whatever me we already have;
        // the panel shows per-card errors instead of a dead screen.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Stale-token fallback: only fires while /api/auth/me has never resolved
  // (restFetch aborts after 12s, so this is a last-resort backstop).
  useEffect(() => {
    if (!token || me !== undefined) return;
    const id = window.setTimeout(() => {
      // Never leave the entire application behind RequireAuth's spinner. If
      // login supplied no user and the session check is unavailable, recover
      // to the login page after the bounded request window.
      if (me === undefined) {
        clearSession();
        setToken(null);
        setMe(null);
      }
    }, 6_000);
    return () => window.clearTimeout(id);
  }, [token, me]);

  useSessionTimeout(token, () => setToken(null));

  const login = useCallback(async (username: string, password: string) => {
    console.log("[auth] login starting for", username);
    const data = await restFetch<{ token: string; user: any }>("/api/auth/login", {
      method: "POST",
      body: { username, password },
    });
    console.log("[auth] login OK, token:", !!data.token, "user:", !!data.user);
    storeSession(data.token);
    window.sessionStorage.setItem("wolf.loginComplete", "1");
    setToken(data.token);
    // The login response carries the full user — seed immediately so the
    // dashboard renders even if the follow-up /api/auth/me refresh is slow.
    setMe(mapServerUser(data.user));
  }, []);

  const loginTelegram = useCallback(async (initData: string) => {
    const data = await restFetch<{ token: string; user: any }>("/api/auth/miniapp", {
      method: "POST",
      body: { initData },
    });
    storeSession(data.token);
    window.sessionStorage.setItem("wolf.loginComplete", "1");
    setToken(data.token);
    setMe(mapServerUser(data.user));
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      try {
        await restFetch("/api/auth/logout", { method: "POST", token });
      } catch {
        // session may already be gone
      }
    }
    clearSession();
    window.sessionStorage.removeItem("wolf.loginComplete");
    setToken(null);
    setMe(null);
  }, [token]);

  const updatePreferences = useCallback(async (prefs: Record<string, unknown>) => {
    if (!token) throw new Error("نشست شما منقضی شده است.");
    await restFetch("/api/auth/preferences", { method: "POST", token, body: prefs });
    const data = await restFetch<{ user: any }>("/api/auth/me", { token });
    setMe(mapServerUser(data.user));
  }, [token]);

  const value = useMemo<WolfAuth>(
    () => ({
      user: me ?? null,
      // A token received from login is enough to enter the protected route;
      // only the initial restoration of an old token is considered loading.
      isLoading: token !== null && me === undefined && !window.sessionStorage.getItem("wolf.loginComplete"),
      isAuthenticated: Boolean(me),
      isAdmin: Boolean(me && (me.isAdmin === true || me.role === "admin")),
      isAssistant: Boolean(me && !((me.isAdmin === true) || me.role === "admin") && (me.isAssistant === true || me.role === "assistant")),
      token,
      login,
      loginTelegram,
      logout,
      updatePreferences,
    }),
    [me, token, login, loginTelegram, logout, updatePreferences],
  );

  return <WolfAuthContext.Provider value={value}>{children}</WolfAuthContext.Provider>;
}

export function WolfAuthProvider({ children }: { children: ReactNode }) {
  return <RestWolfAuthProvider>{children}</RestWolfAuthProvider>;
}

export function useWolfAuth(): WolfAuth {
  const ctx = useContext(WolfAuthContext);
  if (!ctx) throw new Error("useWolfAuth must be used within WolfAuthProvider");
  return ctx;
}
