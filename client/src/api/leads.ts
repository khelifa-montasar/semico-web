import type { CreateLeadInput, Lead, UpdateLeadInput } from "@semico/shared";
import { api, qs } from "../lib/api/http";

/**
 * Sales leads.
 *
 * `create` is public — the lead form is on the marketing pages and filled in by anonymous
 * visitors. Listing and updating are owner-only.
 */
export const leadsApi = {
  create: (input: CreateLeadInput) => api.post<Lead>("/leads", input),

  list: (filters: { status?: string; page?: number; pageSize?: number } = {}) =>
    api.getPage<Lead[]>(`/leads${qs(filters)}`),

  update: (id: string, input: UpdateLeadInput) => api.patch<Lead>(`/leads/${id}`, input),
};
