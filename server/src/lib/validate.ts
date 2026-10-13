import { z, type ZodTypeAny } from "zod";
import { ApiError } from "./ApiError.js";

/**
 * Typed request parsing.
 *
 * The plan called for a `validate()` middleware that rewrites `req.body`/`req.query`. That shape
 * has two problems here: Express 5 defines `req.query` as a lazily-evaluated getter, so
 * reassigning it is fragile, and a middleware loses the schema's type at the controller, forcing
 * an `as SomeInput` cast at every call site.
 *
 * Parsing at the controller boundary with these helpers instead keeps everything fully inferred
 * — `parseBody(req, registerSchema)` returns `RegisterInput` — with no casts and no request
 * mutation. Validation still happens before any service is touched, and a bad payload still
 * becomes a 400 with field-level details via the error handler.
 */

function toApiError(error: z.ZodError): ApiError {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "(root)";
    (details[path] ??= []).push(issue.message);
  }
  return ApiError.badRequest("The request contained invalid data", details);
}

export function parse<T extends ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw toApiError(result.error);
  return result.data;
}

export const parseBody = <T extends ZodTypeAny>(req: { body: unknown }, schema: T) =>
  parse(schema, req.body);

export const parseQuery = <T extends ZodTypeAny>(req: { query: unknown }, schema: T) =>
  parse(schema, req.query);

export const parseParams = <T extends ZodTypeAny>(req: { params: unknown }, schema: T) =>
  parse(schema, req.params);

/** Shared `:id` param schema — every collection route takes a cuid-shaped id. */
export const idParamSchema = z.object({ id: z.string().trim().min(1, "An id is required") });
