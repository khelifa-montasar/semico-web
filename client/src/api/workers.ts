import type { InviteWorkerInput, UpdateWorkerInput, Worker } from "@semico/shared";
import { api } from "../lib/api/http";

/** `/farms/me/workers` — owner-only. */
export const workersApi = {
  list: () => api.get<Worker[]>("/farms/me/workers"),

  /**
   * Creates the worker's account and returns a one-time password.
   *
   * There is no mail delivery in this project, so the password comes back exactly once and the
   * owner passes it on. It is never retrievable again.
   */
  invite: (input: InviteWorkerInput) =>
    api.post<{ worker: Worker; temporaryPassword: string }>("/farms/me/workers/invite", input),

  update: (id: string, input: UpdateWorkerInput) =>
    api.patch<Worker>(`/farms/me/workers/${id}`, input),

  /** Grant or revoke valve control. Recorded in both the feed and the audit trail. */
  setValveControl: (id: string, granted: boolean) =>
    api.patch<Worker>(`/farms/me/workers/${id}/valve-control`, { granted }),

  /** Issues a new one-time password and ends the worker's existing sessions. */
  resetPassword: (id: string) =>
    api.post<{ temporaryPassword: string }>(`/farms/me/workers/${id}/reset-password`),

  /** Offboards: disables the account and detaches it from the farm. */
  remove: (id: string) => api.delete<void>(`/farms/me/workers/${id}`),
};
