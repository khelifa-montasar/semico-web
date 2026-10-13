import type { Response } from "express";
import {
  buildPaginationMeta,
  type ApiSuccess,
  type PaginationMeta,
} from "@semico/shared";

/**
 * Response helpers, so every endpoint emits the same envelope.
 *
 * The client's `http.ts` unwraps `data` and throws on `error`, which means a handler can never
 * accidentally return a bare object that the client then fails to parse.
 */

export function ok<T>(res: Response, data: T, meta?: PaginationMeta): Response {
  const body: ApiSuccess<T> = meta ? { data, meta } : { data };
  return res.status(200).json(body);
}

export function created<T>(res: Response, data: T): Response {
  return res.status(201).json({ data } satisfies ApiSuccess<T>);
}

export function noContent(res: Response): Response {
  return res.status(204).send();
}

/** Convenience for list endpoints: pass the page window and the total row count. */
export function paginated<T>(
  res: Response,
  data: T[],
  params: { page: number; pageSize: number; total: number },
): Response {
  return ok(res, data, buildPaginationMeta(params.page, params.pageSize, params.total));
}
