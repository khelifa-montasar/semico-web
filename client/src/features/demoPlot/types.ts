/**
 * Domain types for the Demo Plot Simulation module.
 *
 * Everything here is client-side only: the simulation is never persisted and never sent to the
 * server. Keeping the types in one file means the engine, the hook and the components all agree on
 * the same shapes, and the whole module stays deletable in one move.
 */

/** The four alert types. There are deliberately no others. */
export type AlertType = "dry" | "wet" | "offline" | "noIrrigation";

export type AlertSeverity = "info" | "warning" | "critical";

/** How a zone reads at a glance: the same bands the map colours use. */
export type ZoneStatus = "optimal" | "low" | "critical";

export type IrrigationStatus = "Active" | "Scheduled" | "Idle";

export interface Sensor {
  id: string;
  /** The zone this sensor sits in — a sensor click opens its zone's drawer. */
  zoneId: string;
  label: string;
  /** Position for the map marker. */
  position: { lat: number; lng: number };
  /** Simulated minute this sensor last reported. The `offline` rule measures against it. */
  lastReportMinute: number;
  batteryPercent: number;
  online: boolean;
}

export interface Zone {
  id: string;
  /** Display label, e.g. "Z1". */
  label: string;
  row: number;
  column: number;
  /** Polygon corners as [lat, lng], in draw order. */
  bounds: Array<[number, number]>;
  center: { lat: number; lng: number };

  /** Soil moisture, %. Always within config MOISTURE.min..max. */
  moisture: number;
  soilTempC: number;

  sensorIds: string[];

  /** Recent moisture samples for the drawer's 24-hour chart, oldest first. */
  history: number[];

  valveOpen: boolean;
  /**
   * Simulated minute the most recent irrigation window began; null before the first one.
   *
   * Kept after the valve closes, because the tick that closes it still has to charge the water it
   * delivered. "Is the valve open right now" is derived from this plus the duration, not stored.
   */
  valveOpenedAtMinute: number | null;
  /** Simulated minute irrigation is next due for this zone. */
  nextIrrigationMinute: number;
  lastIrrigation: { atMinute: number; durationMinutes: number } | null;

  /** Consecutive readings outside the bands, counted by the dry/wet rules. */
  consecutiveDry: number;
  consecutiveWet: number;

  /**
   * Minutes this zone's valve has been due but not started.
   *
   * The simulation normally opens valves on time, so this stays at 0 — except during the scripted
   * fault window in `DEMO_FAULTS`, which exists so the `noIrrigation` rule has something real to
   * detect instead of being a permanently-dormant branch.
   */
  pendingStartMinutes: number;
}

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  zoneId: string;
  /** What the condition is about: a zone id, or a sensor id for `offline`. */
  targetId: string;
  /** Simulated minute the alert was raised. Every timestamp shown comes from this. */
  raisedAtMinute: number;
  /** Rule-specific context, substituted into the alert's action line. */
  detail: { en: string; ar: string } | null;
  active: boolean;
}

export interface SimulationState {
  min: number;
  zones: Zone[];
  sensors: Sensor[];
  alerts: Alert[];
  /** Litres this drip plot has used, and what flood irrigation would have used, so far today. */
  dripLitresUsed: number;
  traditionalLitresUsed: number;
  /** Total irrigation events started, used for the savings comparison. */
  irrigationEvents: number;
}

/** Derived per tick for the KPI bar — never stored, so it cannot drift from the state. */
export interface KpiSnapshot {
  savedLitres: number;
  savedPercent: number;
  averageMoisture: number;
  optimalZones: number;
  zoneCount: number;
  activeAlerts: number;
  criticalAlerts: number;
  irrigationStatus: IrrigationStatus;
  wateringZones: number;
  nextIrrigationInMinutes: number | null;
}

/** Simulation pacing, controlled from the banner. */
export interface SimulationControls {
  running: boolean;
  /** Simulated minutes advanced per tick. */
  speed: number;
  pause: () => void;
  resume: () => void;
  toggle: () => void;
  setSpeed: (speed: number) => void;
  reset: () => void;
}
