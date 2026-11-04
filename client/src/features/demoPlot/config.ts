import type { Sensor, Zone, ZoneStatus } from "./types";

/**
 * Configuration for the Demo Plot Simulation.
 *
 * Numbers only — every user-visible string lives in `translations.ts` so the module stays
 * language-agnostic and the two locales cannot drift.
 *
 * The plot is notional: a 120 m × 80 m drip-irrigated demonstration plot on the USTHB campus. Its
 * geometry is derived from a single centre point, so moving the plot is a one-line change.
 */

// ── Where the plot is ────────────────────────────────────────────────────────

export const PLOT = {
  center: { lat: 36.7162, lng: 3.1849 },
  zoom: 19,
  /** 2 rows × 3 columns of equal cells. */
  rows: 2,
  columns: 3,
  widthMeters: 120,
  heightMeters: 80,
  sensorsPerZone: 2,
} as const;

/**
 * Esri World Imagery.
 *
 * Attribution is not optional: Esri's terms require the credit to be visible, so `MAP_ATTRIBUTION`
 * is rendered by the map itself rather than left to chance.
 */
export const MAP_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const MAP_ATTRIBUTION =
  "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community";
export const MAP_MAX_ZOOM = 21;

// ── Soil moisture ────────────────────────────────────────────────────────────

export const MOISTURE = {
  /**
   * Zone colour bands, as upper bounds:
   *   < 18 %   red      (critical)
   *   18–25 %  amber    (low)
   *   25–35 %  green    (optimal)
   *   > 35 %   blue     (wet)
   */
  redBelow: 18,
  amberBelow: 25,
  greenBelow: 35,

  /** The band considered healthy — drives "N / 6 zones optimal". */
  optimalMin: 25,
  optimalMax: 35,

  /** Hard clamp. The soil never reads outside this. */
  min: 6,
  max: 40,

  /** Above this, excess water drains away. */
  wetThreshold: 38,
  /** Percentage points drained per simulated minute while above `wetThreshold`. */
  drainPerMinute: 0.35,
} as const;

/** Classifies a reading into the same bands the map colours use. */
export function zoneStatus(moisture: number): ZoneStatus {
  if (moisture < MOISTURE.redBelow) return "critical";
  if (moisture < MOISTURE.amberBelow) return "low";
  return "optimal";
}

/** The bands, as an ordered list — one definition for the map, the legend and the drawer. */
export const MOISTURE_BANDS = [
  { key: "red", upperExclusive: MOISTURE.redBelow, token: "crit" as const },
  { key: "amber", upperExclusive: MOISTURE.amberBelow, token: "warn" as const },
  { key: "green", upperExclusive: MOISTURE.greenBelow, token: "green" as const },
  { key: "blue", upperExclusive: Number.POSITIVE_INFINITY, token: "blue" as const },
] as const;

// ── Weather and irrigation physics ───────────────────────────────────────────

export const WEATHER = {
  /**
   * Reference evapotranspiration, in percentage points of soil moisture lost per simulated day.
   *
   * A deliberately simple light weather model: one fixed daily rate rather than a solar-radiation
   * curve. The module is a demonstration, and a fixed rate keeps the numbers legible.
   */
  etPerDay: 22,
  /** Percentage points added per simulated minute while a zone's valve is open. */
  irrigationGainPerMinute: 1.4,
  /** Standard deviation of the Gaussian noise added each tick. */
  noiseSigma: 0.25,
} as const;

export const IRRIGATION = {
  /** Each zone irrigates once every this many simulated minutes. */
  intervalMinutes: 240,
  durationMinutes: 12,
  /** Zones are staggered so they do not all water at once. */
  staggerMinutes: 40,
  /** How long a valve may be due but unstarted before `noIrrigation` fires. */
  pendingStartGraceMinutes: 5,
  /** A zone counts as "Scheduled" when its next irrigation is within this window. */
  scheduledWindowMinutes: 60,
} as const;

/**
 * Scripted faults.
 *
 * Two of the four alert rules describe something going wrong — a sensor dropping out and an
 * irrigation failing to start — and the simulation is otherwise well-behaved, so without these the
 * rules would be unreachable code that no one could ever see fire.
 *
 * Both are deterministic (a fixed window each simulated day) rather than random, so the demo
 * behaves the same way in front of a jury as it does on the developer's machine.
 */
export const DEMO_FAULTS = {
  /** A sensor stops reporting for a while, exercising `offline`. */
  offlineSensorId: "Z3-S2",
  offlineStartMinute: 900,
  offlineDurationMinutes: 25,

  /**
   * A zone's valve fails to start, exercising `noIrrigation` (the only critical rule).
   *
   * The window must be at least as long as `IRRIGATION.intervalMinutes`, otherwise it can fall
   * between two of that zone's irrigation times and the rule never fires — which is exactly what an
   * earlier 20-minute window did. A window longer than the interval guarantees an overlap instead
   * of relying on the stagger arithmetic happening to line up.
   */
  failingZoneId: "Z5",
  noIrrigationStartMinute: 1080,
  noIrrigationDurationMinutes: 300,
} as const;

// ── Alert rules ──────────────────────────────────────────────────────────────

export const ALERT_RULES = {
  /** Consecutive readings below `MOISTURE.redBelow` before `dry` fires. */
  dryConsecutive: 3,
  /** Consecutive readings above `MOISTURE.wetThreshold` before `wet` fires. */
  wetConsecutive: 3,
  /** Simulated minutes without a report before a sensor is `offline`. */
  offlineAfterMinutes: 10,
} as const;

// ── Business Model Canvas figures ────────────────────────────────────────────

/**
 * The figures this module exists to visualise.
 *
 * Held here so the KPI bar and `docs/BMC-ALIGNMENT.md` cite the same numbers, and so changing the
 * claim changes the module in one place.
 */
export const BMC = {
  productivityGainPercent: 35,
  waterSavingPercent: 50,
  /** What flood irrigation would use per zone per event, for the savings comparison. */
  traditionalLitresPerZonePerEvent: 900,
} as const;

// ── Simulation pacing ────────────────────────────────────────────────────────

export const SIMULATION = {
  /** Real milliseconds between ticks. */
  tickMs: 1000,
  /** Simulated minutes advanced per tick, at each speed setting. */
  speeds: [1, 5, 20] as const,
  defaultSpeedIndex: 0,
} as const;

/** The drawer's 24-hour chart: a simulated day, sampled every 5 minutes (288 points). */
export const HISTORY = {
  windowMinutes: 1440,
  sampleEveryMinutes: 5,
} as const;

// ── Geometry ─────────────────────────────────────────────────────────────────

const METERS_PER_DEGREE_LAT = 110_574;

/**
 * Longitude degrees shrink towards the poles, so a metre of longitude is worth more degrees as you
 * move north. Using the latitude constant for both axes would draw a plot ~20 % too wide at
 * Algiers, which is exactly the sort of error that looks plausible until it is measured.
 */
function metersPerDegreeLng(latitude: number): number {
  return 111_320 * Math.cos((latitude * Math.PI) / 180);
}

/** Deterministic starting readings, so the demo looks the same on every reload. */
const INITIAL_MOISTURE = [31, 27, 22, 16, 33, 29] as const;
const INITIAL_SOIL_TEMP = [24, 24.5, 25, 25.5, 26, 26.5] as const;

/**
 * Builds the six zones from the single centre point.
 *
 * Row 0 is north-most, column 0 is west-most, so the grid reads like the map.
 */
export function buildZones(): Zone[] {
  const { center, rows, columns, widthMeters, heightMeters } = PLOT;

  const dLat = heightMeters / rows / METERS_PER_DEGREE_LAT;
  const dLng = widthMeters / columns / metersPerDegreeLng(center.lat);

  const northEdge = center.lat + heightMeters / 2 / METERS_PER_DEGREE_LAT;
  const westEdge = center.lng - widthMeters / 2 / metersPerDegreeLng(center.lat);

  const zones: Zone[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      const id = `Z${index + 1}`;

      const north = northEdge - row * dLat;
      const south = north - dLat;
      const west = westEdge + column * dLng;
      const east = west + dLng;

      zones.push({
        id,
        label: id,
        row,
        column,
        // Draw order matters for a simple polygon: clockwise from the north-west corner.
        bounds: [
          [north, west],
          [north, east],
          [south, east],
          [south, west],
        ],
        center: { lat: (north + south) / 2, lng: (west + east) / 2 },
        moisture: INITIAL_MOISTURE[index] ?? 28,
        soilTempC: INITIAL_SOIL_TEMP[index] ?? 25,
        sensorIds: Array.from({ length: PLOT.sensorsPerZone }, (_, i) => `${id}-S${i + 1}`),
        history: [],
        valveOpen: false,
        valveOpenedAtMinute: null,
        // Staggered so six valves never open on the same tick.
        nextIrrigationMinute: index * IRRIGATION.staggerMinutes,
        lastIrrigation: null,
        consecutiveDry: 0,
        consecutiveWet: 0,
        pendingStartMinutes: 0,
      });
    }
  }

  return zones;
}

/** Two sensors per zone, set a third and two thirds across, vertically centred. */
export function buildSensors(zones: Zone[]): Sensor[] {
  return zones.flatMap((zone, zoneIndex) =>
    Array.from({ length: PLOT.sensorsPerZone }, (_, i) => {
      const fraction = (i + 1) / (PLOT.sensorsPerZone + 1);
      // Bounds are [northWest, northEast, southEast, southWest]; only three are needed, so the
      // south-east corner is skipped with a hole rather than named and left unused.
      const [northWest, northEast, , southWest] = zone.bounds;

      return {
        id: `${zone.id}-S${i + 1}`,
        zoneId: zone.id,
        label: `${zone.label}·S${i + 1}`,
        position: {
          lat: northWest[0] + (southWest[0] - northWest[0]) * 0.5,
          lng: northWest[1] + (northEast[1] - northWest[1]) * fraction,
        },
        lastReportMinute: 0,
        // Deterministic, and above the level that would make the status noise about battery.
        batteryPercent: 82 + ((zoneIndex * 2 + i) % 18),
        online: true,
      };
    }),
  );
}
