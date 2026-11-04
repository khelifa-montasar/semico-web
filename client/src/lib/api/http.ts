import type { ApiErrorBody, ApiSuccess, PaginationMeta } from "@semico/shared";

/**
 * The single HTTP entry point for the client.
 *
 * Responsibilities:
 *   • attach the access token and unwrap the `{ data }` envelope
 *   • turn an `{ error }` envelope into a thrown `ApiError` carrying the stable `code`
 *   • on a 401, refresh once (single-flight) and retry the original request exactly once
 *
 * The access token is held in a module-scoped variable — deliberately NOT localStorage or
 * sessionStorage. A long-lived credential sitting in storage is readable by any XSS payload; the
 * long-lived half of the session lives in an httpOnly cookie this code can never read.
 */

/**
 * Base path for every API call.
 *
 * MUST include the version segment. The server mounts everything under `/api/v1`, and the Vite dev
 * proxy forwards `/api` to it verbatim WITHOUT rewriting — so a base of `/api` produces
 * `POST /api/auth/login`, which matches no route and returns a bare 404. The version has to live
 * here rather than in the proxy config.
 */
const BASE_URL = import.meta.env.VITE_API_URL ?? "/api/v1";

/**
 * Fail loudly in development if the base path loses its version segment.
 *
 * Without this the symptom is a bare 404 with no hint that the path was wrong — `POST
 * /api/auth/login` looks like a missing endpoint rather than a misconfigured base URL, and it
 * breaks every call at once. Checked at module load so it appears on the first request.
 */
if (import.meta.env.DEV && !/^\/api\/v\d+/.test(BASE_URL) && !/^https?:\/\/.+\/api\/v\d+/.test(BASE_URL)) {
  console.warn(
    `[api] VITE_API_URL is "${BASE_URL}", which does not contain an API version segment. The ` +
      `server mounts under /api/v1, so every request will 404. Set VITE_API_URL=/api/v1.`,
  );
}

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/**
 * The farm `/farms/me/*` currently acts on, when the owner holds more than one.
 *
 * Persisted in localStorage because it is a per-browser preference, not session state: reloading
 * should not silently drop the owner back onto their oldest farm. It is a CONVENIENCE only — the
 * server still decides whether the caller may act on that farm, and returns 403 if not, so a
 * tampered value cannot reach data it should not.
 */
const ACTIVE_FARM_KEY = "semico.activeFarmId";

function readStoredFarmId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_FARM_KEY);
  } catch {
    // Private mode, or storage disabled. Falling back to the default farm is correct.
    return null;
  }
}

let activeFarmId: string | null = typeof window === "undefined" ? null : readStoredFarmId();
const activeFarmListeners = new Set<() => void>();

export function subscribeActiveFarmId(listener: () => void): () => void {
  activeFarmListeners.add(listener);
  return () => activeFarmListeners.delete(listener);
}

export function setActiveFarmId(farmId: string | null): void {
  if (activeFarmId === farmId) return;
  activeFarmId = farmId;
  for (const listener of activeFarmListeners) listener();
  try {
    if (farmId) window.localStorage.setItem(ACTIVE_FARM_KEY, farmId);
    else window.localStorage.removeItem(ACTIVE_FARM_KEY);
  } catch {
    // The in-memory value still works for this page's lifetime.
  }
}

export function getActiveFarmId(): string | null {
  return activeFarmId;
}

/**
 * The header for a farm-scoped request.
 *
 * Only under `/farms/` — NOT on `/farms` itself, which is the collection (list/create) and takes no
 * farm. Sending a stale id there would make creating a farm fail with a 403 about a farm the caller
 * no longer holds.
 */
function farmHeader(path: string): Record<string, string> {
  if (!activeFarmId || !path.startsWith("/farms/")) return {};
  return { "X-Farm-Id": activeFarmId };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, string[]>;

  constructor(status: number, code: string, message: string, details?: Record<string, string[]>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** True for errors the UI should show inline on a form field rather than as a toast. */
  get hasFieldErrors(): boolean {
    return Boolean(this.details && Object.keys(this.details).length > 0);
  }
}

/** Called when refreshing fails for good — the AuthProvider hooks this to clear its state. */
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Skips the refresh-and-retry dance; used by the refresh call itself to avoid recursion. */
  skipRefresh?: boolean;
}

/** A page of results, keeping the server's pagination metadata alongside the rows. */
export interface Page<T> {
  data: T;
  meta: PaginationMeta | undefined;
}

/**
 * Refreshes the session, collapsing concurrent attempts into one request.
 *
 * Without this, five queries firing together after a token expires would each trigger their own
 * refresh — and because refresh tokens rotate, four of the five would present an already-revoked
 * token and the server would (correctly) revoke the whole family and sign the user out.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include", // the refresh cookie is httpOnly; the browser attaches it
        headers: { Accept: "application/json" },
      });

      if (!response.ok) return false;

      const payload = (await response.json()) as ApiSuccess<{ accessToken: string }>;
      accessToken = payload.data.accessToken;
      return true;
    } catch {
      // A network failure is not an auth failure, but there is nothing to retry with either.
      return false;
    } finally {
      // Cleared so a later expiry can refresh again.
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    if (body?.error) {
      return new ApiError(response.status, body.error.code, body.error.message, body.error.details);
    }
  } catch {
    // Fall through to a generic error when the body is not the expected envelope.
  }
  return new ApiError(response.status, "INTERNAL", response.statusText || "Request failed");
}

/**
 * Performs the request and returns the WHOLE envelope.
 *
 * Callers use `apiFetch` (data only) or `apiFetchPage` (data + pagination) — resolving the retry
 * and error handling here means neither of them can get it subtly different.
 */
async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiSuccess<T>> {
  const { body, skipRefresh, headers, ...rest } = options;

  const send = async (): Promise<Response> =>
    fetch(`${BASE_URL}${path}`, {
      ...rest,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...farmHeader(path),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  let response = await send();

  // One refresh, one retry. A second 401 means the refresh did not help, so stop and sign out.
  if (response.status === 401 && !skipRefresh) {
    const refreshed = await refreshSession();
    if (refreshed) {
      response = await send();
    } else {
      accessToken = null;
      onUnauthorized?.();
      throw await parseError(response);
    }
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  // 204 has no body — logout returns one.
  if (response.status === 204) return { data: undefined as T };

  return (await response.json()) as ApiSuccess<T>;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return (await request<T>(path, options)).data;
}

/** Like `apiFetch`, but keeps `meta` so list views can paginate. */
export async function apiFetchPage<T>(path: string, options: RequestOptions = {}): Promise<Page<T>> {
  const envelope = await request<T>(path, options);
  return { data: envelope.data, meta: envelope.meta };
}

/**
 * For endpoints that return a file rather than the JSON envelope.
 *
 * The CSV export deliberately bypasses the envelope handling above, so error responses still need
 * parsing — hence the shared `parseError`.
 */
export async function apiFetchBlob(path: string, accept = "text/csv"): Promise<Blob> {
  const response = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      Accept: accept,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...farmHeader(path),
    },
  });

  if (!response.ok) throw await parseError(response);
  return response.blob();
}

/** Convenience wrappers so call sites read as intent rather than fetch options. */
export const api = {
  get: <T>(path: string, options?: RequestOptions) => apiFetch<T>(path, { ...options, method: "GET" }),

  /** GET that preserves pagination metadata. */
  getPage: <T>(path: string, options?: RequestOptions) =>
    apiFetchPage<T>(path, { ...options, method: "GET" }),

  /** GET for a file download (CSV export). */
  getBlob: (path: string, accept?: string) => apiFetchBlob(path, accept),

  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: "PATCH", body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: "DELETE" }),
};

/**
 * Builds a query string, dropping empty values so callers can pass optional filters freely.
 *
 * Generic over the object shape rather than constrained to `Record<string, ...>`. TypeScript gives
 * interfaces no implicit index signature, so a plain `interface ActivityFilters` is rejected by a
 * `Record` parameter even when every property is a valid scalar — a type alias would have been
 * accepted, which makes the failure confusing rather than instructive.
 */
export function qs<T extends object>(params: T): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

export { refreshSession };
