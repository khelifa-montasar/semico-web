import type { ActivityCalendar, ActivityLogEntry, PaginationMeta } from "@semico/shared";
import { api, qs } from "../lib/api/http";

export interface ActivityFilters {
  type?: "AUTO" | "MANUAL";
  kind?: string;
  zoneId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

/** `/farms/me/activity` — the bilingual farmer-facing feed, readable by every member. */
export const activityApi = {
  /** Returns the page envelope, because the feed is paginated. */
  feed: (filters: ActivityFilters = {}) =>
    api.getPage<ActivityLogEntry[]>(`/farms/me/activity${qs(filters)}`),

  /** `month` is `YYYY-MM`; omitted means the current month. */
  calendar: (month?: string) =>
    api.get<ActivityCalendar>(`/farms/me/activity/calendar${qs({ month })}`),
};

export type { PaginationMeta };
