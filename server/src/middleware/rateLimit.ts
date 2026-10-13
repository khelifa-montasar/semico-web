import rateLimit from "express-rate-limit";
import type { RequestHandler } from "express";
import { ERROR_CODES } from "@semico/shared";
import { isTest } from "../config/env.js";

/**
 * Rate limiting.
 *
 * Two tiers. A generous global limiter keeps a runaway client from saturating the server, and a
 * much stricter auth limiter slows credential stuffing and owner-code guessing — the two places
 * where an attacker gets feedback on whether they guessed right.
 *
 * Disabled under test so a suite can make many requests without tripping the limit.
 */

function noopLimiter(): RequestHandler {
  return (_req, _res, next) => next();
}

const disabled = isTest;

export const globalLimiter: RequestHandler = disabled
  ? noopLimiter()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 600,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { error: { code: ERROR_CODES.RATE_LIMITED, message: "Too many requests" } },
    });

/** Applied to register/login/refresh. Deliberately tight, and it counts failures equally. */
export const authLimiter: RequestHandler = disabled
  ? noopLimiter()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 20,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      // Do not let one attacker lock out an office behind a shared NAT: key on the credential
      // being attacked as well as the address.
      keyGenerator: (req) => {
        const body = req.body as { email?: unknown } | undefined;
        const email = typeof body?.email === "string" ? body.email.toLowerCase() : "anonymous";
        return `${req.ip ?? "unknown"}:${email}`;
      },
      message: {
        error: {
          code: ERROR_CODES.RATE_LIMITED,
          message: "Too many attempts. Please wait a few minutes and try again.",
        },
      },
    });
