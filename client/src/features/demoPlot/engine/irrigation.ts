import { ALERT_RULES, DEMO_FAULTS, IRRIGATION, MOISTURE, PLOT } from "../config";
import type { IrrigationStatus, Sensor, SimulationState, Zone } from "../types";

/**
 * Irrigation scheduling and status.
 *
 * Each zone irrigates once every `IRRIGATION.intervalMinutes` simulated minutes, staggered by
 * `staggerMinutes` so six valves never open on the same tick — which would look like a bug and
 * would flatten the savings curve.
 */

/** Whether this zone's valve is scripted to fail right now, for the `noIrrigation` rule. */
export function isValveFailing(zoneId: string, minute: number): boolean {
  if (zoneId !== DEMO_FAULTS.failingZoneId) return false;

  const minuteOfDay = ((minute % 1440) + 1440) % 1440;
  return (
    minuteOfDay >= DEMO_FAULTS.noIrrigationStartMinute &&
    minuteOfDay < DEMO_FAULTS.noIrrigationStartMinute + DEMO_FAULTS.noIrrigationDurationMinutes
  );
}

/** Whether this sensor is scripted to stop reporting right now, for the `offline` rule. */
export function isSensorFaulted(sensorId: string, minute: number): boolean {
  if (sensorId !== DEMO_FAULTS.offlineSensorId) return false;

  const minuteOfDay = ((minute % 1440) + 1440) % 1440;
  return (
    minuteOfDay >= DEMO_FAULTS.offlineStartMinute &&
    minuteOfDay < DEMO_FAULTS.offlineStartMinute + DEMO_FAULTS.offlineDurationMinutes
  );
}

/** Simulated minutes until a zone's next irrigation. Never negative. */
export function minutesUntilDue(zone: Zone, minute: number): number {
  return Math.max(0, zone.nextIrrigationMinute - minute);
}

/** The soonest irrigation across all zones, or null when there are no zones. */
export function nextIrrigationInMinutes(zones: Zone[], minute: number): number | null {
  if (zones.length === 0) return null;
  return Math.min(...zones.map((zone) => minutesUntilDue(zone, minute)));
}

/**
 * The overall status shown in KPI 5.
 *
 *   Active    — at least one valve is open
 *   Scheduled — nothing open, but something is due within the scheduling window
 *   Idle      — nothing open and nothing due soon
 */
export function irrigationStatus(zones: Zone[], minute: number): IrrigationStatus {
  if (zones.some((zone) => zone.valveOpen)) return "Active";

  const soonest = nextIrrigationInMinutes(zones, minute);
  if (soonest !== null && soonest <= IRRIGATION.scheduledWindowMinutes) return "Scheduled";

  return "Idle";
}

/** Zones with a valve open right now. */
export function wateringZoneCount(zones: Zone[]): number {
  return zones.filter((zone) => zone.valveOpen).length;
}

/**
 * How many of `[from, to)` had this zone actually watering.
 *
 * Returns a duration rather than a boolean so a tick shorter than an irrigation is charged
 * proportionally, and a tick that contains a whole irrigation is not charged for more than it used.
 */
export function irrigatingMinutesBetween(zone: Zone, from: number, to: number): number {
  if (zone.valveOpenedAtMinute === null) return 0;

  const start = Math.max(from, zone.valveOpenedAtMinute);
  const end = Math.min(to, zone.valveOpenedAtMinute + IRRIGATION.durationMinutes);

  return Math.max(0, end - start);
}

/** True when every zone sits in the healthy band — the "N / 6 zones optimal" KPI. */
export function optimalZoneCount(zones: Zone[]): number {
  return zones.filter(
    (zone) => zone.moisture >= MOISTURE.optimalMin && zone.moisture <= MOISTURE.optimalMax,
  ).length;
}

/** Mean moisture across the plot, one decimal place. */
export function averageMoisture(zones: Zone[]): number {
  if (zones.length === 0) return 0;
  const total = zones.reduce((sum, zone) => sum + zone.moisture, 0);
  return Math.round((total / zones.length) * 10) / 10;
}

/** Sensors that have gone quiet for longer than the rule allows. */
export function staleSensors(state: SimulationState): Sensor[] {
  return state.sensors.filter(
    (sensor) => state.min - sensor.lastReportMinute >= ALERT_RULES.offlineAfterMinutes,
  );
}

/** Sanity guard used by the engine: the plot must always have `rows × columns` zones. */
export const EXPECTED_ZONE_COUNT = PLOT.rows * PLOT.columns;
