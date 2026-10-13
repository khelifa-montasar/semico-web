import type { Response } from "express";
import { env, REFRESH_COOKIE_NAME } from "../config/env.js";

/**
 * The refresh-token cookie.
 *
 * httpOnly so JavaScript cannot read it (an XSS bug cannot exfiltrate a long-lived session),
 * SameSite=Lax plus the Vite `/api` proxy so dev stays same-origin, and `path` scoped to the auth
 * routes so it is not attached to every ordinary API call.
 */

const COOKIE_PATH = "/api/v1/auth";

function baseOptions() {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: env.COOKIE_SECURE,
    path: COOKIE_PATH,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    ...baseOptions(),
    maxAge: env.REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
}

/** Must be cleared with the same path/domain attributes it was set with, or it will not match. */
export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, baseOptions());
}

export function readRefreshCookie(cookies: Record<string, unknown> | undefined): string | undefined {
  const value = cookies?.[REFRESH_COOKIE_NAME];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
