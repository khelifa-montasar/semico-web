import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { ERROR_CODES, type ApiErrorBody } from "@semico/shared";
import { ApiError } from "../lib/ApiError.js";
import { env, isProduction } from "../config/env.js";

/**
 * The single place a failed request becomes an HTTP response.
 *
 * Everything thrown in a service, repository, parser or guard lands here. Deliberate failures
 * arrive as `ApiError` and keep their status and stable `code`; anything else is an unexpected
 * 500 whose details are logged but never sent to the client.
 */

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new ApiError(404, ERROR_CODES.NOT_FOUND, `No route matches ${req.method} ${req.path}`));
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const apiError = toApiError(error);
  // `pino-http` augments http.IncomingMessage — and therefore Express's Request — with a typed
  // `log`, so there is nothing to redeclare. `requestLogger` is mounted first in app.ts, so this
  // is always present by the time an error reaches here.
  const log = req.log;

  if (apiError.status >= 500) {
    // Unexpected: log with the stack. This is the only place a stack trace is allowed to appear.
    log?.error({ err: error, path: req.path, method: req.method }, "unhandled request error");
  } else if (!apiError.expected) {
    log?.warn({ code: apiError.code, path: req.path }, "request rejected");
  }

  const body: ApiErrorBody = {
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details ? { details: apiError.details } : {}),
    },
  };

  // Never leak internals in production; a local stack is genuinely useful in development.
  if (!isProduction && apiError.status >= 500 && error instanceof Error) {
    (body.error as { stack?: string }).stack = error.stack;
  }

  res.status(apiError.status).json(body);
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  // Zod reaching here means a schema was used without the parse helpers — still report it as 400.
  if (error instanceof ZodError) {
    const details: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const path = issue.path.join(".") || "(root)";
      (details[path] ??= []).push(issue.message);
    }
    return ApiError.badRequest("The request contained invalid data", details);
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return fromPrismaError(error);
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    // Almost always a bug in our own query shape, not bad client input.
    return ApiError.internal("A database query was malformed", error);
  }

  if (error instanceof SyntaxError && "body" in error) {
    return ApiError.badRequest("The request body was not valid JSON");
  }

  return ApiError.internal(
    isProduction ? "Something went wrong" : error instanceof Error ? error.message : String(error),
    error,
  );
}

function fromPrismaError(error: Prisma.PrismaClientKnownRequestError): ApiError {
  switch (error.code) {
    case "P2002": {
      // Unique constraint — surface which field, since the client shows it next to the input.
      const target = error.meta?.target;
      const fields = Array.isArray(target) ? target.join(", ") : String(target ?? "value");
      if (fields.includes("email")) {
        return ApiError.conflict("That email address is already registered", ERROR_CODES.EMAIL_IN_USE);
      }
      if (fields.includes("ownerCode")) {
        return ApiError.conflict("Could not allocate a unique farm code, please retry");
      }
      return ApiError.conflict(`That ${fields} is already in use`, ERROR_CODES.CONFLICT);
    }
    case "P2025":
      return ApiError.notFound();
    case "P2003":
      return ApiError.badRequest("A referenced record does not exist");
    default:
      return ApiError.internal("A database error occurred", error);
  }
}

/** Exported for tests that assert on the mapping. */
export const __testables = { toApiError, fromPrismaError, env };
