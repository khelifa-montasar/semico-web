import { HISTORY, IRRIGATION, MOISTURE, buildSensors, buildZones } from "../config";
import type { KpiSnapshot, Sensor, SimulationState, Zone } from "../types";
import { evaluateAlerts, activeAlerts, criticalCount } from "./alerts";
import {
  averageMoisture,
  irrigationStatus,
  isSensorFaulted,
  isValveFailing,
  nextIrrigationInMinutes,
  optimalZoneCount,
  wateringZoneCount,
} from "./irrigation";
import { savingsTotals } from "./savings";
import { advanceMoisture, soilTemperature } from "./soil";

/**
 * The simulation, as one pure function.
 *
 * `step(state, minutes)` returns the next state and touches nothing else — no clock, no storage, no
 * network. That is what makes the whole model testable without a browser, and what keeps React out
 * of the physics.
 */

/** Samples kept per zone for the drawer's 24-hour chart. */
const MAX_HISTORY_SAMPLES = Math.round(HISTORY.windowMinutes / HISTORY.sampleEveryMinutes);

/** The initial state: a freshly seeded plot at minute zero, with no alerts yet. */
export function createInitialState(): SimulationState {
  const zones = buildZones();
  return {
    min: 0,
    zones,
    sensors: buildSensors(zones),
    alerts: [],
    dripLitresUsed: 0,
    traditionalLitresUsed: 0,
    irrigationEvents: 0,
  };
}

/** Overlap of [aStart, aEnd) with [bStart, bEnd), never negative. */
function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * Advances one zone by one tick.
 *
 * The irrigation window is computed as an interval rather than as a flag, because at 20× a single
 * tick can be longer than a whole 12-minute irrigation. Charging a full tick of watering would soak
 * the zone; charging none would ignore the irrigation entirely.
 */
function stepZone(
  zone: Zone,
  from: number,
  to: number,
  random: () => number,
): { zone: Zone; startedIrrigation: boolean } {
  let openedAt = zone.valveOpenedAtMinute;
  let nextDue = zone.nextIrrigationMinute;
  let lastIrrigation = zone.lastIrrigation;
  let pendingStartMinutes = zone.pendingStartMinutes;
  let startedIrrigation = false;

  // Is an irrigation due inside this tick?
  if (nextDue <= to && (openedAt === null || nextDue >= openedAt)) {
    if (isValveFailing(zone.id, to)) {
      // The scripted fault: the valve is due but will not start. This is what makes the
      // `noIrrigation` rule reachable rather than permanently dormant.
      pendingStartMinutes += to - from;
    } else {
      // Start when it fell due, not when the tick happened to land — otherwise a 20-minute tick
      // would delay every irrigation by up to 20 minutes.
      openedAt = Math.max(from, nextDue);
      nextDue = openedAt + IRRIGATION.intervalMinutes;
      lastIrrigation = { atMinute: openedAt, durationMinutes: IRRIGATION.durationMinutes };
      pendingStartMinutes = 0;
      startedIrrigation = true;
    }
  }

  const irrigatingMinutes =
    openedAt === null
      ? 0
      : overlap(from, to, openedAt, openedAt + IRRIGATION.durationMinutes);

  const moisture = advanceMoisture(zone.moisture, { minutes: to - from, irrigatingMinutes, random });

  // A sample roughly every `sampleEveryMinutes`, taken from the tick that crossed the boundary, so
  // the chart holds ~288 points over a day whatever the speed.
  const crossedSampleBoundary =
    Math.floor(to / HISTORY.sampleEveryMinutes) > Math.floor(from / HISTORY.sampleEveryMinutes);
  const history = crossedSampleBoundary
    ? [...zone.history, moisture].slice(-MAX_HISTORY_SAMPLES)
    : zone.history;

  return {
    zone: {
      ...zone,
      moisture,
      soilTempC: soilTemperature(to),
      valveOpen: openedAt !== null && to < openedAt + IRRIGATION.durationMinutes,
      valveOpenedAtMinute: openedAt,
      nextIrrigationMinute: nextDue,
      lastIrrigation,
      pendingStartMinutes,
      history,
      // Counters advance once per TICK, not once per simulated minute: a "consecutive reading" is a
      // poll result, so at 20× the three readings the dry rule wants arrive after three ticks.
      consecutiveDry: moisture < MOISTURE.redBelow ? zone.consecutiveDry + 1 : 0,
      consecutiveWet: moisture > MOISTURE.wetThreshold ? zone.consecutiveWet + 1 : 0,
    },
    startedIrrigation,
  };
}

/** Sensors report each tick, except during the scripted offline window. */
function stepSensors(sensors: Sensor[], minute: number, minutes: number): Sensor[] {
  return sensors.map((sensor) => {
    if (isSensorFaulted(sensor.id, minute)) {
      // Silent: `lastReportMinute` deliberately does not move, which is what the rule measures.
      return { ...sensor, online: false };
    }

    return {
      ...sensor,
      online: true,
      lastReportMinute: minute,
      // Slow drain, floored well above the level that would make the status noisy.
      batteryPercent: Math.max(35, sensor.batteryPercent - minutes * 0.002),
    };
  });
}

/** Advances the whole simulation by `minutes` simulated minutes. */
export function step(
  state: SimulationState,
  minutes: number,
  random: () => number = Math.random,
): SimulationState {
  const from = state.min;
  const to = from + minutes;

  const zones: Zone[] = [];
  let irrigationEvents = state.irrigationEvents;

  for (const zone of state.zones) {
    const result = stepZone(zone, from, to, random);
    zones.push(result.zone);
    if (result.startedIrrigation) irrigationEvents += 1;
  }

  const sensors = stepSensors(state.sensors, to, minutes);

  const totals = savingsTotals(irrigationEvents);

  const next: SimulationState = {
    min: to,
    zones,
    sensors,
    alerts: state.alerts,
    dripLitresUsed: totals.dripLitres,
    traditionalLitresUsed: totals.traditionalLitres,
    irrigationEvents,
  };

  // Alerts are evaluated against the finished state, so a rule can never fire on a half-applied
  // tick.
  return { ...next, alerts: evaluateAlerts(next) };
}

/** Everything the KPI bar shows, derived from state so it cannot drift from it. */
export function toKpis(state: SimulationState): KpiSnapshot {
  const totals = savingsTotals(state.irrigationEvents);

  return {
    savedLitres: Math.round(totals.savedLitres),
    savedPercent: totals.savedPercent,
    averageMoisture: averageMoisture(state.zones),
    optimalZones: optimalZoneCount(state.zones),
    zoneCount: state.zones.length,
    activeAlerts: activeAlerts(state.alerts).length,
    criticalAlerts: criticalCount(state.alerts),
    irrigationStatus: irrigationStatus(state.zones, state.min),
    wateringZones: wateringZoneCount(state.zones),
    nextIrrigationInMinutes: nextIrrigationInMinutes(state.zones, state.min),
  };
}
