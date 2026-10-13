import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AuthUser, LoginInput, RegisterInput } from "@semico/shared";
import { authApi } from "@/api/auth";
import { setAccessToken, setUnauthorizedHandler } from "@/lib/api/http";

/**
 * Session state for the whole app.
 *
 * Boot sequence: ask the server to refresh using the httpOnly cookie. If that succeeds we have an
 * access token and can fetch the profile; if it fails the visitor is simply anonymous. This is why
 * a page reload does not sign you out, without the client ever storing a long-lived credential.
 */

export type AuthStatus = "loading" | "authenticated" | "anonymous";

export interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  isAuthenticated: boolean;
  login: (input: LoginInput) => Promise<AuthUser>;
  register: (input: RegisterInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
  /** Re-reads the profile — used after a Settings save changes the name or avatar. */
  reloadUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  // When a refresh finally fails mid-session, drop straight to anonymous. Without this the app
  // would keep rendering a dashboard whose every request 401s.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setStatus("anonymous");
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const refreshed = await authApi.refresh();
        if (!refreshed) {
          if (!cancelled) setStatus("anonymous");
          return;
        }
        const profile = await authApi.me();
        if (!cancelled) {
          setUser(profile);
          setStatus("authenticated");
        }
      } catch {
        // Any failure here just means "not signed in" — it is not an error worth surfacing.
        if (!cancelled) setStatus("anonymous");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /** Shared by login and register: both return a session in the same shape. */
  const adoptSession = useCallback(async (session: { user: AuthUser; accessToken: string }) => {
    setAccessToken(session.accessToken);
    setUser(session.user);
    setStatus("authenticated");
    return session.user;
  }, []);

  const login = useCallback(
    async (input: LoginInput) => adoptSession(await authApi.login(input)),
    [adoptSession],
  );

  const register = useCallback(
    async (input: RegisterInput) => adoptSession(await authApi.register(input)),
    [adoptSession],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      // Clear locally even if the server call failed — the user asked to sign out.
      setAccessToken(null);
      setUser(null);
      setStatus("anonymous");
    }
  }, []);

  const reloadUser = useCallback(async () => {
    const profile = await authApi.me();
    setUser(profile);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      isAuthenticated: status === "authenticated" && user !== null,
      login,
      register,
      logout,
      reloadUser,
    }),
    [user, status, login, register, logout, reloadUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return context;
}
