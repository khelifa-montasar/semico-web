import type {
  AnalyticsHeatmap,
  AnalyticsOverview,
  DryingRatePoint,
  MoisturePoint,
} from "@semico/shared";
import { api, qs } from "../lib/api/http";

export interface RangeParams {
  range?: "24h" | "7d" | "30d" | "90d";
  zoneId?: string;
  /** Explicit window (ISO). Overrides `range` when given — backs the From/To picker. */
  from?: string;
  to?: string;
}

/**
 * `/farms/me/analytics`
 *
 * NOTE ON THE NUMBERS: the water-savings figures in the overview are MODELLED from a fixed
 * per-event estimate, not measured — there is no flow-meter baseline in this project. If they are
 * displayed, they should be presented as an estimate rather than as a reading.
 */
export const analyticsApi = {
  overview: (params: RangeParams = {}) =>
    api.get<AnalyticsOverview>(`/farms/me/analytics/overview${qs(params)}`),

  /** Same series the dashboard chart uses, so the two views cannot disagree. */
  moisture: (params: RangeParams = {}) =>
    api.get<MoisturePoint[]>(`/farms/me/analytics/moisture${qs(params)}`),

  /** Hourly drying curve for one day, with the rainfall what-if applied. */
  flow: (params: { date?: string; rainfallMm?: number; zoneId?: string } = {}) =>
    api.get<DryingRatePoint[]>(`/farms/me/analytics/flow${qs(params)}`),

  heatmap: (month?: string) =>
    api.get<AnalyticsHeatmap>(`/farms/me/analytics/heatmap${qs({ month })}`),

  /** Returns a Blob — this endpoint sends CSV, not the JSON envelope. */
  exportCsv: (params: RangeParams = {}) =>
    api.getBlob(`/farms/me/analytics/export${qs({ ...params, format: "csv" })}`),
};
