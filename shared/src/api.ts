import { z } from "zod";

/**
 * The one response envelope used by every endpoint. The client's `http.ts` unwraps `data` and
 * throws on `error`, so route handlers never invent their own shape.
 */

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorBody {
  error: {
    /** Stable, machine-readable code — e.g. `INVALID_OWNER_CODE`. Safe to branch on. */
    code: string;
    /** Human-readable, English fallback. The client may substitute its own i18n copy by code. */
    message: string;
    /** Field-level validation detail, keyed by field path. */
    details?: Record<string, string[]>;
  };
}

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function buildPaginationMeta(
  page: number,
  pageSize: number,
  total: number,
): PaginationMeta {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Error codes the client branches on. Kept central so both sides reference one list. */
export const ERROR_CODES = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  EMAIL_IN_USE: "EMAIL_IN_USE",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  INVALID_OWNER_CODE: "INVALID_OWNER_CODE",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  TOKEN_INVALID: "TOKEN_INVALID",
  REFRESH_REUSE_DETECTED: "REFRESH_REUSE_DETECTED",
  RATE_LIMITED: "RATE_LIMITED",
  VALVE_CONTROL_REQUIRED: "VALVE_CONTROL_REQUIRED",
  SLOT_UNAVAILABLE: "SLOT_UNAVAILABLE",
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
