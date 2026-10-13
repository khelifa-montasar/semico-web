import type { AuthResponse, AuthUser, LoginInput, RegisterInput } from "@semico/shared";
import { api, refreshSession } from "../lib/api/http";

/**
 * Auth endpoints.
 *
 * Thin on purpose — the interesting behaviour (token storage, the 401 retry, single-flight refresh)
 * lives in `lib/api/http.ts`, so it applies to every request rather than only these four.
 */
export const authApi = {
  login: (input: LoginInput) => api.post<AuthResponse>("/auth/login", input),

  register: (input: RegisterInput) => api.post<AuthResponse>("/auth/register", input),

  me: () => api.get<AuthUser>("/auth/me"),

  /** Returns a 204 with no body. */
  logout: () => api.post<void>("/auth/logout"),

  /** Used on boot: trades the httpOnly refresh cookie for a fresh access token. */
  refresh: () => refreshSession(),
};
