import { z } from "zod";
import type { Localized, ValveState } from "../enums.js";

/**
 * Telemetry, device status and system-health contracts.
 *
 * The fixed shapes here are dictated by what the pages already render: a 7-day moisture series
 * for the Dashboard chart, a 48-point hourly flow series for Analytics, and the 7 diagnostic
 * cards on System Health.
 */

export const telemetryQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  zoneId: z.string().trim().optional(),
  /** `hour` for intraday detail, `day` for the weekly trend the Dashboard draws. */
  interval: z.enum(["hour", "day"]).default("day"),
  /** Convenience window used when `from`/`to` are omitted. */
  range: z.enum(["24h", "7d", "30d", "90d"]).default("7d"),
});

export type TelemetryQuery = z.infer<typeof telemetryQuerySchema>;

/** One point on the Dashboard's 7-day chart. */
export interface MoisturePoint {
  /** ISO date (day granularity) or ISO timestamp (hour granularity). */
  at: string;
  /** Axis label, precomputed server-side in the farm timezone. */
  label: string;
  rootMoisture: number;
  surfaceMoisture: number | null;
}

export interface LatestTelemetry {
  zoneId: string | null;
  zoneName: string | null;
  recordedAt: string;
  rootMoisture: number | null;
  surfaceMoisture: number | null;
  soilTempC: number | null;
  batteryPct: number | null;
  flowRateLpm: number | null;
  loraRssi: number | null;
  valveState: ValveState | null;
}

/** Farm-level radio/power/connectivity summary — feeds the System Health cards. */
export interface DeviceStatus {
  firmwareVersion: string | null;
  controllerOnline: boolean;
  loraRssi: number | null;
  cellularStatus: string | null;
  cellularOperator: string | null;
  /** 0–5 bars, as the UI renders "Signal 4/5". */
  cellularSignal: number | null;
  batteryPct: number | null;
  updatedAt: string;
}

export interface SystemComponent {
  id: string;
  /** Stable identifier so the client can map an icon without matching on translated text. */
  key: string;
  name: Localized;
  /** Display value, already formatted for humans ("72%", "-68 dBm", "Online"). */
  value: string;
  status: (typeof import("../enums.js").COMPONENT_STATUSES)[number];
  detail: Localized | null;
  updatedAt: string;
}

export interface ErrorLog {
  id: string;
  occurredAt: string;
  component: string;
  componentName: Localized;
  message: Localized;
  action: Localized | null;
}

export interface SystemHealthResponse {
  components: SystemComponent[];
  deviceStatus: DeviceStatus | null;
  /** Counts per status, so the UI doesn't have to reduce the list itself. */
  summary: { green: number; orange: number; red: number };
  online: boolean;
}
