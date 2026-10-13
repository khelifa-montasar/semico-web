import type { Request, Response } from "express";
import { loginSchema, registerSchema } from "@semico/shared";
import { ApiError } from "../../lib/ApiError.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from "../../lib/cookies.js";
import { created, noContent, ok } from "../../lib/response.js";
import { parseBody } from "../../lib/validate.js";
import { authService, type IssuedSession } from "./auth.service.js";

/**
 * HTTP layer for authentication.
 *
 * Responsibilities are narrow: parse and validate input against the shared schemas, call the
 * service, own the cookie, and shape the response. Status codes and cookie handling live here and
 * nowhere else.
 */

function requireAuthContext(req: Request) {
  if (!req.auth) throw ApiError.internal("Route is missing requireAuth middleware");
  return req.auth;
}

/** Issues the standard session response: body carries the access token, cookie carries refresh. */
function respondWithSession(res: Response, session: IssuedSession, status: 200 | 201): Response {
  setRefreshCookie(res, session.refreshToken);
  return status === 201 ? created(res, session.response) : ok(res, session.response);
}

export const authController = {
  register: asyncHandler(async (req, res) => {
    const input = parseBody(req, registerSchema);
    const session = await authService.register(input, req);
    return respondWithSession(res, session, 201);
  }),

  login: asyncHandler(async (req, res) => {
    const input = parseBody(req, loginSchema);
    const session = await authService.login(input, req);
    return respondWithSession(res, session, 200);
  }),

  /**
   * Rotates the session. Called on boot and silently by the client after a 401, which is why the
   * refresh cookie is scoped to these routes rather than sent with every request.
   */
  refresh: asyncHandler(async (req, res) => {
    const token = readRefreshCookie(req.cookies);
    if (!token) {
      throw ApiError.unauthorized("No active session", "TOKEN_INVALID");
    }

    try {
      const session = await authService.refresh(token, req);
      return respondWithSession(res, session, 200);
    } catch (error) {
      // A dead refresh token must not linger in the browser, or every later request retries it.
      clearRefreshCookie(res);
      throw error;
    }
  }),

  logout: asyncHandler(async (req, res) => {
    const auth = requireAuthContext(req);
    await authService.logout(readRefreshCookie(req.cookies), auth.userId, req);
    clearRefreshCookie(res);
    return noContent(res);
  }),

  me: asyncHandler(async (req, res) => {
    const auth = requireAuthContext(req);
    const user = await authService.me(auth.userId);
    return ok(res, user);
  }),
};
