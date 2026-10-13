import type { IrrigationCommand, IrrigateInput, PaginationMeta } from "@semico/shared";
import { api, qs } from "../lib/api/http";

/**
 * `/farms/me/irrigation`
 *
 * The two POSTs are gated server-side by the valve-control capability — an owner always passes, a
 * worker only as an active operator whose permission is currently granted. The client hides the
 * controls for everyone else, but the server is what enforces it, and revoking takes effect on the
 * operator's next request rather than at token expiry.
 */
export const irrigationApi = {
  /** "Irrigate now" — opens a valve for a bounded duration. */
  irrigate: (input: IrrigateInput) =>
    api.post<IrrigationCommand>("/farms/me/irrigation/irrigate", input),

  /** Manual open/close from Settings. */
  setValve: (action: "OPEN" | "CLOSE", zoneId?: string) =>
    api.post<IrrigationCommand>("/farms/me/irrigation/valve", { action, zoneId }),

  history: (filters: { status?: string; zoneId?: string; page?: number; pageSize?: number } = {}) =>
    api.getPage<IrrigationCommand[]>(`/farms/me/irrigation/commands${qs(filters)}`),
};

export type { PaginationMeta };
