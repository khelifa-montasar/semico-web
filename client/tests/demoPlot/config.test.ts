import { describe, expect, it } from "vitest";
import {
  BMC,
  HISTORY,
  IRRIGATION,
  MOISTURE,
  MOISTURE_BANDS,
  PLOT,
  buildSensors,
  buildZones,
  zoneStatus,
} from "../../src/features/demoPlot/config";

/**
 * Plot geometry and configuration.
 *
 * The geometry is worth testing properly because a wrong conversion factor produces a plot that
 * still *looks* like a plot — it is simply the wrong size on the ground, which nothing else in the
 * system would catch.
 */

const METERS_PER_DEGREE_LAT = 110_574;
const metersPerDegreeLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

describe("plot geometry", () => {
  it("builds the specified 2 × 3 grid of zones", () => {
    const zones = buildZones();

    expect(zones).toHaveLength(6);
    expect(PLOT.rows).toBe(2);
    expect(PLOT.columns).toBe(3);
    expect(zones.map((z) => z.id)).toEqual(["Z1", "Z2", "Z3", "Z4", "Z5", "Z6"]);
  });

  it("measures 120 m × 80 m on the ground, in 40 m cells", () => {
    const [first, second] = buildZones();

    // Measure a zone's own rectangle back into metres rather than trusting the degrees.
    const north = first?.bounds[0]?.[0] ?? 0;
    const south = first?.bounds[2]?.[0] ?? 0;
    const west = first?.bounds[0]?.[1] ?? 0;
    const east = first?.bounds[1]?.[1] ?? 0;

    const cellHeightM = (north - south) * METERS_PER_DEGREE_LAT;
    const cellWidthM = (east - west) * metersPerDegreeLng(PLOT.center.lat);

    expect(cellHeightM).toBeCloseTo(40, 1);
    expect(cellWidthM).toBeCloseTo(40, 1);
    // Three cells wide, two tall.
    expect(cellWidthM * PLOT.columns).toBeCloseTo(120, 0);
    expect(cellHeightM * PLOT.rows).toBeCloseTo(80, 0);

    // Adjacent cells share an edge and do not overlap.
    expect(first?.bounds[1]?.[1]).toBeCloseTo(second?.bounds[0]?.[1] ?? -1, 10);
  });

  it("places the plot on the USTHB campus at the specified centre and zoom", () => {
    expect(PLOT.center.lat).toBeCloseTo(36.7162, 4);
    expect(PLOT.center.lng).toBeCloseTo(3.1849, 4);
    expect(PLOT.zoom).toBe(19);

    // The plot must straddle its own centre point.
    const zones = buildZones();
    const latitudes = zones.flatMap((z) => z.bounds.map(([lat]) => lat));
    const longitudes = zones.flatMap((z) => z.bounds.map(([, lng]) => lng));

    expect(Math.min(...latitudes)).toBeLessThan(PLOT.center.lat);
    expect(Math.max(...latitudes)).toBeGreaterThan(PLOT.center.lat);
    expect(Math.min(...longitudes)).toBeLessThan(PLOT.center.lng);
    expect(Math.max(...longitudes)).toBeGreaterThan(PLOT.center.lng);
  });

  it("gives every zone a well-formed rectangle", () => {
    for (const zone of buildZones()) {
      expect(zone.bounds).toHaveLength(4);

      const [nw, ne, se, sw] = zone.bounds as [
        [number, number],
        [number, number],
        [number, number],
        [number, number],
      ];

      // North above south, east of west.
      expect(nw[0]).toBeGreaterThan(sw[0]);
      expect(ne[1]).toBeGreaterThan(nw[1]);
      // Opposite corners match, so it is a rectangle rather than a trapezium.
      expect(nw[0]).toBeCloseTo(ne[0], 10);
      expect(sw[0]).toBeCloseTo(se[0], 10);
      expect(nw[1]).toBeCloseTo(sw[1], 10);
      expect(ne[1]).toBeCloseTo(se[1], 10);

      // The stored centre is the rectangle's centre.
      expect(zone.center.lat).toBeCloseTo((nw[0] + sw[0]) / 2, 10);
      expect(zone.center.lng).toBeCloseTo((nw[1] + ne[1]) / 2, 10);
    }
  });

  it("maps rows north-to-south and columns west-to-east, like the map reads", () => {
    const zones = buildZones();
    const z1 = zones.find((z) => z.id === "Z1");
    const z3 = zones.find((z) => z.id === "Z3");
    const z4 = zones.find((z) => z.id === "Z4");

    // Z1 is the north-west cell, Z3 its eastern neighbour, Z4 the cell below Z1.
    expect(z1?.row).toBe(0);
    expect(z1?.column).toBe(0);
    expect(z3?.column).toBe(2);
    expect(z4?.row).toBe(1);
    expect(z3?.center.lng).toBeGreaterThan(z1?.center.lng ?? 0);
    expect(z4?.center.lat).toBeLessThan(z1?.center.lat ?? 0);
  });
});

describe("sensors", () => {
  it("places two sensors inside every zone", () => {
    const zones = buildZones();
    const sensors = buildSensors(zones);

    expect(sensors).toHaveLength(12);

    for (const zone of zones) {
      const own = sensors.filter((sensor) => sensor.zoneId === zone.id);
      expect(own).toHaveLength(2);

      const latitudes = zone.bounds.map(([lat]) => lat);
      const longitudes = zone.bounds.map(([, lng]) => lng);

      for (const sensor of own) {
        // A sensor rendered outside its own polygon would look like a bug on the map.
        expect(sensor.position.lat).toBeGreaterThan(Math.min(...latitudes));
        expect(sensor.position.lat).toBeLessThan(Math.max(...latitudes));
        expect(sensor.position.lng).toBeGreaterThan(Math.min(...longitudes));
        expect(sensor.position.lng).toBeLessThan(Math.max(...longitudes));
      }
    }
  });

  it("gives every sensor a unique id matching its zone", () => {
    const sensors = buildSensors(buildZones());
    const ids = sensors.map((sensor) => sensor.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("Z3-S2");
    for (const sensor of sensors) {
      expect(sensor.id.startsWith(sensor.zoneId)).toBe(true);
    }
  });

  it("starts every sensor online with a healthy battery", () => {
    for (const sensor of buildSensors(buildZones())) {
      expect(sensor.online).toBe(true);
      expect(sensor.batteryPercent).toBeGreaterThan(50);
      expect(sensor.batteryPercent).toBeLessThanOrEqual(100);
    }
  });
});

describe("moisture bands", () => {
  it("classifies readings at the exact band boundaries", () => {
    // Below 18 is critical; 18 itself is not.
    expect(zoneStatus(MOISTURE.redBelow - 0.1)).toBe("critical");
    expect(zoneStatus(MOISTURE.redBelow)).toBe("low");

    expect(zoneStatus(MOISTURE.amberBelow - 0.1)).toBe("low");
    expect(zoneStatus(MOISTURE.amberBelow)).toBe("optimal");
  });

  it("reports only three statuses, even for a wet zone", () => {
    // The drawer's chip has exactly three states, so a zone above the wet threshold still reads
    // "optimal". This is deliberate — but it is NOT the same test as the optimal-zone count, which
    // has an upper bound. Both are asserted here so the distinction is on record.
    expect(zoneStatus(MOISTURE.wetThreshold + 1)).toBe("optimal");
    expect(MOISTURE.optimalMax).toBeLessThan(MOISTURE.wetThreshold);
  });

  it("defines bands that cover every possible reading without a gap", () => {
    const sorted = [...MOISTURE_BANDS].sort((a, b) => a.upperExclusive - b.upperExclusive);

    expect(sorted).toHaveLength(4);
    expect(sorted[0]?.upperExclusive).toBe(MOISTURE.redBelow);
    expect(sorted[1]?.upperExclusive).toBe(MOISTURE.amberBelow);
    expect(sorted[2]?.upperExclusive).toBe(MOISTURE.greenBelow);
    // The last band is open-ended so no reading can fall outside the scale.
    expect(sorted[3]?.upperExclusive).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("configuration invariants", () => {
  it("keeps a clamp range that contains the wet threshold", () => {
    expect(MOISTURE.min).toBeLessThan(MOISTURE.redBelow);
    expect(MOISTURE.max).toBeGreaterThan(MOISTURE.wetThreshold);
  });

  it("samples exactly 288 points across the chart's 24-hour window", () => {
    expect(HISTORY.windowMinutes / HISTORY.sampleEveryMinutes).toBe(288);
  });

  it("stagger × zone count stays inside one irrigation interval", () => {
    // If the stagger were larger than the interval, the grid would wrap and two zones would water
    // at the same moment — which is exactly what the stagger exists to prevent.
    expect(IRRIGATION.staggerMinutes * (PLOT.rows * PLOT.columns)).toBeLessThanOrEqual(
      IRRIGATION.intervalMinutes,
    );
  });

  it("holds the BMC figures the KPI bar and the report both quote", () => {
    expect(BMC.productivityGainPercent).toBe(35);
    expect(BMC.waterSavingPercent).toBe(50);
    expect(BMC.traditionalLitresPerZonePerEvent).toBe(900);
  });

  it("gives the zones a spread of starting conditions, including a dry one", () => {
    const moisture = buildZones().map((zone) => zone.moisture);

    // A demo where every zone starts identical shows nothing on the map.
    expect(new Set(moisture).size).toBeGreaterThan(1);
    expect(moisture.some((value) => value < MOISTURE.redBelow)).toBe(true);
  });
});
