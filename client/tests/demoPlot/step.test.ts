import { describe, expect, it } from "vitest";
import { BMC, HISTORY, IRRIGATION, MOISTURE, PLOT } from "../../src/features/demoPlot/config";
import { createInitialState, step, toKpis } from "../../src/features/demoPlot/engine/step";
import type { AlertType } from "../../src/features/demoPlot/types";
import { run, seededRandom } from "./helpers";

/**
 * The composed simulation.
 *
 * `step` is pure, so the whole model can be driven here without a clock or a browser — which is the
 * point of keeping the physics out of the React hook.
 */

describe("createInitialState", () => {
  it("starts at minute zero with a full plot and no alerts", () => {
    const state = createInitialState();

    expect(state.min).toBe(0);
    expect(state.zones).toHaveLength(PLOT.rows * PLOT.columns);
    expect(state.sensors).toHaveLength(PLOT.rows * PLOT.columns * PLOT.sensorsPerZone);
    expect(state.alerts).toEqual([]);
    expect(state.irrigationEvents).toBe(0);
    expect(state.dripLitresUsed).toBe(0);
    expect(state.traditionalLitresUsed).toBe(0);
  });

  it("gives each zone its own history array rather than a shared one", () => {
    const state = createInitialState();
    expect(new Set(state.zones.map((zone) => zone.history)).size).toBe(state.zones.length);
  });

  it("returns independent states, so one run cannot corrupt another", () => {
    const first = createInitialState();
    const second = createInitialState();

    first.zones[0]!.moisture = 999;
    expect(second.zones[0]!.moisture).not.toBe(999);
  });
});

describe("stepping", () => {
  it("advances the simulated clock by exactly the tick", () => {
    const start = createInitialState();

    expect(step(start, 1).min).toBe(1);
    expect(step(start, 20).min).toBe(20);
    expect(step(step(start, 1), 1).min).toBe(2);
  });

  it("is deterministic for a given seed", () => {
    // The engine takes `random` as a parameter precisely so this holds.
    const first = run(createInitialState(), 200, 1, seededRandom(1234));
    const second = run(createInitialState(), 200, 1, seededRandom(1234));

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("does not mutate the state it was handed", () => {
    const state = createInitialState();
    const before = JSON.stringify(state);

    step(state, 10);

    expect(JSON.stringify(state)).toBe(before);
  });

  it("produces no NaN over a full simulated day", () => {
    const state = run(createInitialState(), 1440, 1, seededRandom());

    for (const zone of state.zones) {
      expect(Number.isFinite(zone.moisture)).toBe(true);
      expect(Number.isFinite(zone.soilTempC)).toBe(true);
      expect(Number.isFinite(zone.nextIrrigationMinute)).toBe(true);
      expect(zone.history.every(Number.isFinite)).toBe(true);
    }
    for (const sensor of state.sensors) {
      expect(Number.isFinite(sensor.batteryPercent)).toBe(true);
    }
  });

  it("keeps every reading inside the configured clamp", () => {
    const state = run(createInitialState(), 1440, 1, seededRandom(99));

    for (const zone of state.zones) {
      expect(zone.moisture).toBeGreaterThanOrEqual(MOISTURE.min);
      expect(zone.moisture).toBeLessThanOrEqual(MOISTURE.max);
    }
  });

  it("moves moistures apart over time, rather than all zones tracking together", () => {
    // Zones have different starting points and staggered watering, so a well-behaved simulation
    // spreads them out. Identical values would suggest the per-zone state is being shared.
    const state = run(createInitialState(), 300, 1, seededRandom(5));
    const moisture = state.zones.map((zone) => zone.moisture);

    expect(new Set(moisture.map((value) => value.toFixed(2))).size).toBeGreaterThan(1);
  });
});

describe("irrigation scheduling", () => {
  it("waters the first staggered zone on the very first tick", () => {
    const state = run(createInitialState(), 1, 1, seededRandom());

    // Z1 is due at minute 0; the others are staggered 40 minutes apart.
    expect(state.zones[0]?.valveOpen).toBe(true);
    expect(state.zones[1]?.valveOpen).toBe(false);
  });

  it("closes a valve once the configured duration has elapsed", () => {
    expect(run(createInitialState(), 11, 1, seededRandom()).zones[0]?.valveOpen).toBe(true);
    expect(run(createInitialState(), 12, 1, seededRandom()).zones[0]?.valveOpen).toBe(false);
  });

  it("records the irrigation on the zone that received it", () => {
    const state = run(createInitialState(), 1, 1, seededRandom());
    const zone = state.zones[0];

    expect(zone?.lastIrrigation?.atMinute).toBe(0);
    expect(zone?.lastIrrigation?.durationMinutes).toBe(IRRIGATION.durationMinutes);
    expect(state.zones[1]?.lastIrrigation).toBeNull();
  });

  it("counts roughly one event per zone per interval over a day", () => {
    const state = run(createInitialState(), 1440, 1, seededRandom());
    const expected = (1440 / IRRIGATION.intervalMinutes) * 6;

    // Not exact: the scripted fault window blocks two of Z5's attempts, and the late recovery adds
    // one back.
    expect(state.irrigationEvents).toBeGreaterThan(expected * 0.8);
    expect(state.irrigationEvents).toBeLessThan(expected * 1.2);
  });

  it("reschedules a zone after it waters, rather than watering every tick", () => {
    const state = run(createInitialState(), 24, 1, seededRandom());
    // One event for Z1 in the first 24 minutes, not 24 of them.
    expect(state.irrigationEvents).toBeLessThanOrEqual(2);
  });

  it("never opens more than a couple of valves at once on a staggered grid", () => {
    // Staggering (40 minutes apart) with a 12-minute irrigation is what keeps the plot from
    // watering everywhere simultaneously. Tracked in one pass rather than by re-simulating.
    let state = createInitialState();
    const random = seededRandom();
    let maxOpen = 0;

    for (let tick = 0; tick < 400; tick += 1) {
      state = step(state, 1, random);
      maxOpen = Math.max(maxOpen, state.zones.filter((zone) => zone.valveOpen).length);
    }

    expect(maxOpen).toBeLessThanOrEqual(2);
    expect(state.zones).toHaveLength(6);
  });
});

describe("history sampling", () => {
  it("samples on crossing a boundary, not on every tick", () => {
    // The window is 5 minutes, so four one-minute ticks produce no sample and the fifth produces one.
    expect(run(createInitialState(), 4, 1, seededRandom()).zones[0]?.history).toHaveLength(0);
    expect(run(createInitialState(), 5, 1, seededRandom()).zones[0]?.history).toHaveLength(1);
    expect(run(createInitialState(), 10, 1, seededRandom()).zones[0]?.history).toHaveLength(2);
  });

  it("caps the history at the 24-hour sample count", () => {
    const state = run(createInitialState(), 1440, 1, seededRandom());
    const cap = HISTORY.windowMinutes / HISTORY.sampleEveryMinutes;

    for (const zone of state.zones) {
      expect(zone.history.length).toBe(cap);
    }
  });

  it("samples at most once per tick, so high speed records fewer points", () => {
    // ACTUAL BEHAVIOUR: the boundary check is a boolean
    // (`floor(to / sample) > floor(from / sample)`), so a tick spanning several sample intervals
    // still records exactly ONE point. At 1× that gives the full 288 over a day; at 20× it gives
    // one per tick, i.e. 72.
    //
    // Not a defect — the sparkline simply has fewer points at high speed — but it means "288
    // samples" holds only at 1×. Documented rather than assumed.
    expect(run(createInitialState(), 1440, 1, seededRandom()).zones[0]?.history).toHaveLength(288);
    expect(run(createInitialState(), 1440 / 20, 20, seededRandom()).zones[0]?.history).toHaveLength(72);
  });

  it("never records more than the cap, however fast the tick", () => {
    // A single huge tick must not blow past the 288-point buffer.
    const state = run(createInitialState(), 10, 1440, seededRandom());
    expect(state.zones[0]?.history.length).toBeLessThanOrEqual(288);
  });
});

describe("alerts over a simulated day", () => {
  it("fires all four rules at some point", () => {
    // The integration-level assertion: each rule has a real trigger path. A rule that can never
    // fire is dead code, which is what the `noIrrigation` window bug amounted to.
    const seen = new Set<AlertType>();
    let state = createInitialState();
    const random = seededRandom();

    for (let tick = 0; tick < 1440; tick += 1) {
      state = step(state, 1, random);
      for (const alert of state.alerts) if (alert.active) seen.add(alert.type);
    }

    expect([...seen].sort()).toEqual(["dry", "noIrrigation", "offline", "wet"]);
  });

  it("resolves the sensor fault once the sensor reports again", () => {
    let state = createInitialState();
    const random = seededRandom();

    // Step past the scripted offline window plus the detection threshold.
    for (let tick = 0; tick < 1440; tick += 1) state = step(state, 1, random);

    // By the end of the day the sensor is reporting, so no stale offline alert should remain.
    const offlineActive = state.alerts.some((alert) => alert.active && alert.type === "offline");
    expect(offlineActive).toBe(false);
  });
});

describe("toKpis", () => {
  it("agrees with the state it summarises", () => {
    const state = run(createInitialState(), 300, 1, seededRandom());
    const kpis = toKpis(state);

    expect(kpis.zoneCount).toBe(state.zones.length);
    expect(kpis.wateringZones).toBe(state.zones.filter((zone) => zone.valveOpen).length);
    expect(kpis.activeAlerts).toBe(state.alerts.filter((alert) => alert.active).length);
  });

  it("reports the BMC saving and a bounded average", () => {
    const kpis = toKpis(run(createInitialState(), 1440, 1, seededRandom()));

    expect(kpis.savedPercent).toBe(BMC.waterSavingPercent);
    expect(kpis.savedLitres).toBeGreaterThan(0);
    expect(kpis.averageMoisture).toBeGreaterThanOrEqual(MOISTURE.min);
    expect(kpis.averageMoisture).toBeLessThanOrEqual(MOISTURE.max);
    expect(kpis.optimalZones).toBeLessThanOrEqual(kpis.zoneCount);
  });

  it("reports zeroes — not NaN — before the first tick", () => {
    const kpis = toKpis(createInitialState());

    expect(kpis.savedLitres).toBe(0);
    expect(kpis.savedPercent).toBe(0);
    expect(kpis.activeAlerts).toBe(0);
    expect(kpis.criticalAlerts).toBe(0);
    expect(Number.isNaN(kpis.averageMoisture)).toBe(false);
  });

  it("always has a next irrigation time on a non-empty plot", () => {
    const kpis = toKpis(createInitialState());
    expect(kpis.nextIrrigationInMinutes).not.toBeNull();
  });
});

describe("multi-minute ticks", () => {
  it("produces a comparable number of events at 20× as at 1×", () => {
    // A tick longer than an irrigation must not swallow the irrigation entirely.
    const slow = run(createInitialState(), 1440, 1, seededRandom());
    const fast = run(createInitialState(), 72, 20, seededRandom());

    expect(fast.irrigationEvents).toBeGreaterThan(slow.irrigationEvents * 0.8);
    expect(fast.irrigationEvents).toBeLessThan(slow.irrigationEvents * 1.2);
  });

  it("keeps the plot bounded at high speed", () => {
    const state = run(createInitialState(), 500, 20, seededRandom(7));

    for (const zone of state.zones) {
      expect(zone.moisture).toBeGreaterThanOrEqual(MOISTURE.min);
      expect(zone.moisture).toBeLessThanOrEqual(MOISTURE.max);
      expect(Number.isFinite(zone.moisture)).toBe(true);
    }
    expect(state.min).toBe(10_000);
  });

  it("keeps the saved total at the BMC percentage at high speed too", () => {
    const kpis = toKpis(run(createInitialState(), 100, 20, seededRandom()));
    expect(kpis.savedPercent).toBe(BMC.waterSavingPercent);
  });
});
