import { ERROR_CODES, type ErrorCode } from "@semico/shared";

/**
 * The only error type services and repositories should throw.
 *
 * Anything else reaching the error handler is treated as an unexpected 500 and logged with its
 * stack. Because every deliberate failure carries a stable `code`, the client can branch on it
 * and render its own translated message instead of showing English server prose to an Arabic
 * user.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode | string;
  readonly details?: Record<string, string[]>;
  /** Marks errors we do not want pino to log at error level (e.g. expected 401s). */
  readonly expected: boolean;

  constructor(
    status: number,
    code: ErrorCode | string,
    message: string,
    options: { details?: Record<string, string[]>; expected?: boolean; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = options.details;
    this.expected = options.expected ?? status < 500;
  }

  static badRequest(message: string, details?: Record<string, string[]>): ApiError {
    return new ApiError(400, ERROR_CODES.VALIDATION_FAILED, message, { details });
  }

  static unauthorized(message = "You must sign in to continue", code: ErrorCode = ERROR_CODES.UNAUTHORIZED): ApiError {
    return new ApiError(401, code, message);
  }

  static forbidden(message = "You do not have access to this resource"): ApiError {
    return new ApiError(403, ERROR_CODES.FORBIDDEN, message);
  }

  /**
   * Used for cross-farm access. Deliberately a 404 rather than a 403: a 403 would confirm that a
   * resource with that id exists, letting someone enumerate other farms' data by id.
   */
  static notFound(message = "Resource not found"): ApiError {
    return new ApiError(404, ERROR_CODES.NOT_FOUND, message);
  }

  static conflict(message: string, code: ErrorCode = ERROR_CODES.CONFLICT): ApiError {
    return new ApiError(409, code, message);
  }

  static tooManyRequests(message = "Too many requests, please slow down"): ApiError {
    return new ApiError(429, ERROR_CODES.RATE_LIMITED, message);
  }

  static internal(message = "Something went wrong", cause?: unknown): ApiError {
    return new ApiError(500, ERROR_CODES.INTERNAL, message, { cause, expected: false });
  }
}
