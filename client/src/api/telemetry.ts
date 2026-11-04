import type {
  DeviceStatus,
  ErrorLog,
  LatestTelemetry,
  MoisturePoint,
  SensorZoneGroup,
  SystemHealthResponse,
} from "@semico/shared";
import { api, qs } from "../lib/api/http";

export interface SeriesParams {
  /** `day` for the weekly trend the dashboard draws, `hour` for intraday detail. */
  interval?: "hour" | "day";
  range?: "24h" | "7d" | "30d" | "90d";
  zoneId?: string;
}

/** `/farms/me/telemetry` and the diagnostics beside it. */
export const telemetryApi = {
  latest: (zoneId?: string) =>
    api.get<LatestTelemetry | null>(`/farms/me/telemetry/latest${qs({ zoneId })}`),

  latestPerZone: () => api.get<LatestTelemetry[]>("/farms/me/telemetry/latest-per-zone"),

  series: (params: SeriesParams = {}) =>
    api.get<MoisturePoint[]>(`/farms/me/telemetry${qs(params)}`),

  deviceStatus: () => api.get<DeviceStatus | null>("/farms/me/device-status"),

  systemHealth: () => api.get<SystemHealthResponse>("/farms/me/system-health"),
  errorLogs: (limit = 20) => api.get<ErrorLog[]>(`/farms/me/system-health/errors${qs({ limit })}`),

  /** Sensors grouped by zone — already grouped server-side, so the page does not reduce per render. */
  sensors: () => api.get<SensorZoneGroup[]>("/farms/me/sensors"),
};
