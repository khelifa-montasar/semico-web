import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAP_ATTRIBUTION,
  MAP_MAX_ZOOM,
  MAP_TILE_URL,
  MOISTURE,
  MOISTURE_BANDS,
  PLOT,
  buildSensors,
  buildZones,
} from "../../src/features/demoPlot/config";
import { bandToken } from "../../src/features/demoPlot/format";
import { LT, GH } from "../../src/app/theme/tokens";

/**
 * The map, audited statically and through the data it consumes.
 *
 * WHY THIS FILE DOES NOT RENDER `PlotMap`: importing it means importing Leaflet, and Leaflet touches
 * `window` at module scope, so it throws immediately under Node —
 *
 *   leaflet-src.js:230  var requestFn = window.requestAnimationFrame || ...
 *
 * Rendering it needs a DOM, which would mean adding jsdom. That is out of scope, so the map is
 * covered two other ways instead: the pure data feeding it, and a source audit of the three-layer
 * constraint. Being explicit about that gap is better than implying the map is tested end to end.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const plotMapSource = readFileSync(
  path.resolve(here, "../../src/features/demoPlot/components/PlotMap.tsx"),
  "utf8",
);

describe("the map's data", () => {
  it("gives every zone a polygon the map can draw", () => {
    const zones = buildZones();

    expect(zones).toHaveLength(6);
    for (const zone of zones) {
      // Leaflet wants [lat, lng] pairs; anything else renders in the wrong hemisphere.
      expect(zone.bounds).toHaveLength(4);
      for (const [lat, lng] of zone.bounds) {
        expect(lat).toBeCloseTo(PLOT.center.lat, 1);
        expect(lng).toBeCloseTo(PLOT.center.lng, 1);
      }
    }
  });

  it("gives every zone a band colour from the shared palette", () => {
    const zones = buildZones();

    for (const zone of zones) {
      const token = bandToken(zone.moisture);
      expect(["crit", "warn", "green", "blue"]).toContain(token);

      // The colour must come from a token, so light and dark both resolve.
      expect(typeof LT[token]).toBe("string");
      expect(typeof GH[token]).toBe("string");
    }
  });

  it("shows a dry zone as red and a wet one as blue", () => {
    // The two extremes are what a jury reads at a glance.
    expect(bandToken(MOISTURE.min)).toBe("crit");
    expect(bandToken(MOISTURE.wetThreshold + 1)).toBe("blue");
  });

  it("starts with at least one zone outside the optimal band", () => {
    // A demo where every zone starts healthy shows nothing on the map.
    const unusual = buildZones().filter(
      (zone) => zone.moisture < MOISTURE.optimalMin || zone.moisture > MOISTURE.optimalMax,
    );
    expect(unusual.length).toBeGreaterThan(0);
  });

  it("places twelve sensor dots, two per zone, inside their polygons", () => {
    const zones = buildZones();
    const sensors = buildSensors(zones);

    expect(sensors).toHaveLength(12);

    for (const sensor of sensors) {
      const zone = zones.find((candidate) => candidate.id === sensor.zoneId);
      const latitudes = zone?.bounds.map(([lat]) => lat) ?? [];
      const longitudes = zone?.bounds.map(([, lng]) => lng) ?? [];

      expect(sensor.position.lat).toBeGreaterThan(Math.min(...latitudes));
      expect(sensor.position.lat).toBeLessThan(Math.max(...latitudes));
      expect(sensor.position.lng).toBeGreaterThan(Math.min(...longitudes));
      expect(sensor.position.lng).toBeLessThan(Math.max(...longitudes));
    }
  });

  it("puts the water source at the plot's edge, clear of every zone", () => {
    const zones = buildZones();
    const northWest = zones[0]?.bounds[0];
    expect(northWest).toBeDefined();

    // Mirrors the offset PlotMap applies; asserted here so a change to one shows up as a failure.
    const waterLat = (northWest?.[0] ?? 0) + 0.00012;
    const waterLng = (northWest?.[1] ?? 0) - 0.00028;

    for (const zone of zones) {
      const inside =
        waterLat < Math.max(...zone.bounds.map(([lat]) => lat)) &&
        waterLat > Math.min(...zone.bounds.map(([lat]) => lat)) &&
        waterLng < Math.max(...zone.bounds.map(([, lng]) => lng)) &&
        waterLng > Math.min(...zone.bounds.map(([, lng]) => lng));

      // The droplet must not sit on top of a zone's fill.
      expect(inside).toBe(false);
    }
  });

  it("exposes exactly four moisture bands for the legend", () => {
    expect(MOISTURE_BANDS).toHaveLength(4);
    expect(MOISTURE_BANDS.map((band) => band.key)).toEqual(["red", "amber", "green", "blue"]);
  });
});

describe("source audit: the three-layer constraint", () => {
  it("draws only polygons, sensor dots and one water marker", () => {
    // The spec is explicit: "Three layers only. No pipes, no valves, no flow lines."
    for (const layer of ["<Polygon", "<CircleMarker", "<Marker"]) {
      expect(plotMapSource).toContain(layer);
    }

    // Matched as JSX TAGS, not bare words: `zone.valveOpen` is a legitimate property here, and a
    // substring search for "valve" flagged it — the constraint is about map layers, not vocabulary.
    const lower = plotMapSource.toLowerCase();
    for (const forbidden of ["<polyline", "<pipe", "<valve", "<flowline", "<geojson", "<layergroup"]) {
      expect(lower, `map layer ${forbidden} is not allowed`).not.toContain(forbidden);
    }
  });

  it("uses Esri World Imagery with the attribution its terms require", () => {
    expect(plotMapSource).toContain("MAP_TILE_URL");
    expect(plotMapSource).toContain("MAP_ATTRIBUTION");

    // The URL and credit themselves come from config, so assert them directly too.
    expect(MAP_TILE_URL).toContain("World_Imagery");
    expect(MAP_TILE_URL).toContain("{z}/{y}/{x}");
    expect(MAP_ATTRIBUTION).toContain("Esri");
  });

  it("does not hijack the scroll wheel inside a scrolling page", () => {
    expect(plotMapSource).toContain("scrollWheelZoom={false}");
  });

  it("caps the zoom at the imagery's maximum", () => {
    expect(plotMapSource).toContain("maxZoom={MAP_MAX_ZOOM}");
    expect(MAP_MAX_ZOOM).toBeGreaterThanOrEqual(PLOT.zoom);
  });

  it("keeps the water source out of the tab order", () => {
    // It is decoration, so it must not be focusable or announced.
    expect(plotMapSource).toContain("interactive={false}");
    expect(plotMapSource).toContain("keyboard={false}");
  });

  it("colours zones from their live moisture, not a fixed colour", () => {
    // If the fill were hardcoded the map would stop responding to the simulation.
    expect(plotMapSource).toContain("bandColour(zone.moisture, c)");
  });

  it("opens the drawer from both a zone and a sensor click", () => {
    expect(plotMapSource).toContain("onSelectZone(zone.id, null)");
    expect(plotMapSource).toContain("onSelectZone(zone.id, sensor.id)");
  });

  it("draws its own icons rather than relying on Leaflet's image assets", () => {
    // Leaflet's default marker resolves PNGs relative to its stylesheet, which routinely breaks
    // under a bundler — the classic missing-marker bug.
    expect(plotMapSource).toContain("divIcon");
    expect(plotMapSource).not.toContain("L.Icon.Default");
    expect(plotMapSource).not.toContain("marker-icon.png");
  });

  it("imports Leaflet's stylesheet, without which the map renders unstyled", () => {
    expect(plotMapSource).toContain('import "leaflet/dist/leaflet.css"');
  });

  it("does not leave debugging output in the module", () => {
    expect(plotMapSource).not.toMatch(/console\.(log|debug|warn)/);
  });
});
