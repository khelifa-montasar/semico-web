/**
 * Pagination parsing.
 *
 * Clamped server-side so a caller cannot ask for the whole table with `?pageSize=100000`.
 */
export interface PageWindow {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

export function parsePage(query: { page?: unknown; pageSize?: unknown }): PageWindow {
  const page = Math.max(1, Number(query.page) || 1);
  const requested = Number(query.pageSize) || DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requested));

  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
