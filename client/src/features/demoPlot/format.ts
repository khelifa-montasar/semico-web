import { MOISTURE_BANDS } from "./config";
import type { AlertSeverity, AlertType, ZoneStatus } from "./types";

/**
 * Presentation helpers for the demo plot.
 *
 * Everything the user reads as a time comes from the SIMULATED clock, not the wall clock — the plot
 * runs at up to 20× speed, so a real timestamp would contradict the numbers beside it.
 */

/** Simulated minutes since midnight, wrapped to a 24-hour day. */
export function minuteOfDay(minute: number): number {
  return ((minute % 1440) + 1440) % 1440;
}

/** `14:22` on the simulated day. Always `en-GB` so the digits match the mono numerals elsewhere. */
export function clockLabel(minute: number): string {
  const total = minuteOfDay(minute);
  const hours = Math.floor(total / 60);
  const minutes = Math.floor(total % 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Which simulated day this minute falls on, 1-based — the plot starts on day 1. */
export function dayNumber(minute: number): number {
  return Math.floor(minute / 1440) + 1;
}

/** Maps a status to the translation key that names it, so components stay free of copy. */
export const ZONE_STATUS_KEY: Record<ZoneStatus, "statusOptimal" | "statusLow" | "statusCritical"> = {
  optimal: "statusOptimal",
  low: "statusLow",
  critical: "statusCritical",
};

/** Maps an alert type to its title and action keys. */
export const ALERT_COPY_KEY: Record<
  AlertType,
  { title: "dry" | "wet" | "offline" | "noIrrigation"; action: "actionDry" | "actionWet" | "actionOffline" | "actionNoIrrigation" }
> = {
  dry: { title: "dry", action: "actionDry" },
  wet: { title: "wet", action: "actionWet" },
  offline: { title: "offline", action: "actionOffline" },
  noIrrigation: { title: "noIrrigation", action: "actionNoIrrigation" },
};

/**
 * Severity ordering, most severe first.
 *
 * Used to sort the alerts panel, so a critical irrigation failure is never buried under a cosmetic
 * sensor warning that happened a minute later.
 */
export const SEVERITY_RANK: Record<AlertSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/** The token name carrying a severity's colour. */
export const SEVERITY_TOKEN: Record<AlertSeverity, "crit" | "warn" | "blue"> = {
  critical: "crit",
  warning: "warn",
  info: "blue",
};

/**
 * Which band a reading falls in, as a token name.
 *
 * Reads the bands from config rather than re-deriving them, so the map, the legend and the drawer
 * cannot disagree about where "low" becomes "optimal".
 */
export function bandToken(moisture: number): "crit" | "warn" | "green" | "blue" {
  const band = MOISTURE_BANDS.find((candidate) => moisture < candidate.upperExclusive);
  return band?.token ?? "blue";
}
