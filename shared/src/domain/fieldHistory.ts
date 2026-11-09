import type { ValveState } from "../enums.js";
import type { ErrorLog, Sensor } from "./telemetry.js";

export type FieldHistoryKind = "zone" | "sensor";

export interface FieldHistoryPoint {
  at: string;
  moisture: number | null;
  samples: number;
}

export interface FieldHistory {
  farmId: string;
  window: { from: string; to: string };
  zone: { id: string; name: string; valveState: ValveState };
  sensor: Sensor | null;
  sensors: Sensor[];
  telemetryScope: FieldHistoryKind;
  latestMoisture: { value: number; recordedAt: string } | null;
  lastWatering: {
    commandId: string;
    executedAt: string;
    durationMin: number | null;
  } | null;
  points: FieldHistoryPoint[];
  warnings: ErrorLog[];
  warningCount: number;
}
