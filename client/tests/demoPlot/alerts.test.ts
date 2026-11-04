import { describe, expect, it } from "vitest";
import { ALERT_RULES, IRRIGATION, MOISTURE } from "../../src/features/demoPlot/config";
import {
  activeAlerts,
  alertsForZone,
  criticalCount,
  evaluateAlerts,
} from "../../src/features/demoPlot/engine/alerts";
import { createInitialState } from "../../src/features/demoPlot/engine/step";
import type { Alert, SimulationState, Zone } from "../../src/features/demoPlot/types";

/**
 * The four alert rules and their lifecycle.
 *
 * Two things are worth stating up front, because both bit me while writing this file:
 *
 * 1. `evaluateAlerts` returns `Alert[]`, NOT a state. Progression has to go through `tick`, which
 *    merges the new alerts back into the state. Treating the return value as a state silently gives
 *    you `undefined` for `zones` on the next line.
 * 2. `createInitialState()` leaves every sensor's `lastReportMinute` at 0 and the clock at 0.
 *    Advancing the clock without refreshing the sensors makes all twelve genuinely overdue, so the
 *    `offline` rule fires twelve times and swamps whatever you were actually testing. Every fixture
 *    here starts from a plot whose sensors are reporting.
 */

/** A plot at `minute` where every sensor has just reported. */
function healthyAt(minute: number): SimulationState {
  const base = createInitialState();
  return {
    ...base,
    min: minute,
    sensors: base.sensors.map((sensor) => ({ ...sensor, lastReportMinute: minute })),
  };
}

/** Applies per-zone conditions, keyed by zone id. */
function applyConditions(state: SimulationState, conditions: Record<string, Partial<Zone>>): SimulationState {
  return {
    ...state,
    zones: state.zones.map((zone) =>
      conditions[zone.id] ? { ...zone, ...conditions[zone.id] } : zone,
    ),
  };
}

/** Advances the clock, keeps the sensors reporting, and evaluates the rules. */
function tick(state: SimulationState, minutes = 1): SimulationState {
  const minute = state.min + minutes;
  const next: SimulationState = {
    ...state,
    min: minute,
    sensors: state.sensors.map((sensor) => ({ ...sensor, lastReportMinute: minute })),
  };
  return { ...next, alerts: evaluateAlerts(next) };
}

/** A settled plot: conditions applied and the rules evaluated once. */
function scenario(minute: number, conditions: Record<string, Partial<Zone>> = {}): SimulationState {
  const state = applyConditions(healthyAt(minute), conditions);
  return { ...state, alerts: evaluateAlerts(state) };
}

const openOf = (state: SimulationState): Alert[] => activeAlerts(state.alerts);

const DRY: Partial<Zone> = { consecutiveDry: ALERT_RULES.dryConsecutive, moisture: MOISTURE.redBelow - 1 };
const WET: Partial<Zone> = { consecutiveWet: ALERT_RULES.wetConsecutive, moisture: MOISTURE.wetThreshold + 1 };
const OVERDUE: Partial<Zone> = { pendingStartMinutes: IRRIGATION.pendingStartGraceMinutes };
const CLEAR: Partial<Zone> = {
  consecutiveDry: 0,
  consecutiveWet: 0,
  pendingStartMinutes: 0,
  moisture: 30,
};

/** Clears every zone condition on a state. */
const calm = (state: SimulationState): SimulationState =>
  applyConditions(state, Object.fromEntries(state.zones.map((zone) => [zone.id, CLEAR])));

describe("raising", () => {
  it("raises `dry` once the consecutive counter reaches the threshold", () => {
    const notYet = scenario(100, { Z1: { ...DRY, consecutiveDry: ALERT_RULES.dryConsecutive - 1 } });
    expect(openOf(notYet)).toHaveLength(0);

    const [alert] = openOf(scenario(100, { Z1: DRY }));

    expect(alert?.type).toBe("dry");
    expect(alert?.severity).toBe("warning");
    expect(alert?.zoneId).toBe("Z1");
    expect(alert?.active).toBe(true);
  });

  it("raises `wet` on its own counter, and only for a wet zone", () => {
    const [alert] = openOf(scenario(100, { Z2: WET }));

    expect(alert?.type).toBe("wet");
    expect(alert?.severity).toBe("warning");
    expect(alert?.zoneId).toBe("Z2");
    // One alert, not one per zone.
    expect(openOf(scenario(100, { Z2: WET }))).toHaveLength(1);
  });

  it("raises `noIrrigation` as the only critical rule", () => {
    const state = scenario(100, { Z5: OVERDUE });
    const [alert] = openOf(state);

    expect(alert?.type).toBe("noIrrigation");
    expect(alert?.severity).toBe("critical");
    expect(criticalCount(state.alerts)).toBe(1);
  });

  it("does not raise `noIrrigation` one minute early", () => {
    expect(
      openOf(scenario(100, { Z5: { pendingStartMinutes: IRRIGATION.pendingStartGraceMinutes - 1 } })),
    ).toHaveLength(0);
  });

  it("raises `offline` against the sensor, attributed to its zone", () => {
    const base = createInitialState();
    const silent = base.sensors.find((sensor) => sensor.zoneId === "Z3");
    expect(silent).toBeDefined();

    // Only one sensor is quiet; the rest report at 10_000 and so are still fresh at minute 10.
    const state: SimulationState = {
      ...base,
      min: ALERT_RULES.offlineAfterMinutes,
      sensors: base.sensors.map((sensor) =>
        sensor.id === silent!.id ? sensor : { ...sensor, lastReportMinute: 10_000 },
      ),
    };

    const open = activeAlerts(evaluateAlerts(state));
    expect(open).toHaveLength(1);

    const [alert] = open;
    expect(alert?.type).toBe("offline");
    expect(alert?.severity).toBe("info");
    // The panel names a zone, so a sensor alert must carry the zone it belongs to.
    expect(alert?.zoneId).toBe("Z3");
    expect(alert?.targetId).toBe(silent!.id);
  });

  it("does not raise `offline` one minute before the threshold", () => {
    const state: SimulationState = {
      ...createInitialState(),
      min: ALERT_RULES.offlineAfterMinutes - 1,
    };
    expect(activeAlerts(evaluateAlerts(state))).toHaveLength(0);
  });

  it("raises nothing on a healthy, reporting plot", () => {
    expect(openOf(scenario(500))).toHaveLength(0);
  });
});

describe("lifecycle", () => {
  it("raises an alert once, not on every evaluation", () => {
    let state = scenario(100, { Z1: DRY });
    const firstId = openOf(state)[0]?.id;

    for (let i = 0; i < 10; i += 1) state = tick(state);

    expect(openOf(state)).toHaveLength(1);
    // The same alert, at its original raise time — not eleven of them.
    expect(openOf(state)[0]?.id).toBe(firstId);
    expect(openOf(state)[0]?.raisedAtMinute).toBe(100);
  });

  it("resolves an alert when its condition clears, keeping it as history", () => {
    let state = scenario(100, { Z1: DRY });
    expect(openOf(state)).toHaveLength(1);

    state = tick(calm(state), 5);

    expect(openOf(state)).toHaveLength(0);
    // Retained but inactive — the drawer shows a zone's past alerts.
    expect(state.alerts).toHaveLength(1);
    expect(state.alerts[0]?.active).toBe(false);
  });

  it("re-raises with a fresh id if the condition returns", () => {
    let state = scenario(100, { Z1: DRY });
    const firstId = openOf(state)[0]?.id;

    state = tick(calm(state), 5);
    state = tick(applyConditions(state, { Z1: DRY }), 5);

    const reRaised = openOf(state);
    expect(reRaised).toHaveLength(1);
    // A new id, so the panel treats it as newly raised rather than reviving the resolved row.
    expect(reRaised[0]?.id).not.toBe(firstId);
  });

  it("resolves one condition without disturbing another", () => {
    let state = scenario(50, { Z1: DRY, Z2: WET });
    expect(openOf(state).map((alert) => alert.type).sort()).toEqual(["dry", "wet"]);

    // Calm only Z2.
    state = applyConditions(state, { Z2: CLEAR });
    state = tick(state);

    const stillOpen = openOf(state);
    expect(stillOpen).toHaveLength(1);
    expect(stillOpen[0]?.type).toBe("dry");
  });

  it("caps the retained history so a long demo cannot grow without bound", () => {
    let state = healthyAt(0);

    // 70 raise-and-resolve cycles, more than the 60-alert history cap.
    for (let cycle = 0; cycle < 70; cycle += 1) {
      state = tick(applyConditions(state, { Z1: DRY }));
      state = tick(calm(state));
    }

    expect(state.alerts.length).toBeLessThanOrEqual(60);
    expect(openOf(state)).toHaveLength(0);
    // Non-trivial: history is being kept, not simply never populated.
    expect(state.alerts.length).toBeGreaterThan(0);
  });
});

describe("ordering and filtering", () => {
  it("sorts active alerts most recent first", () => {
    let state = scenario(100, { Z1: DRY });
    state = applyConditions(state, { Z2: WET });
    state = tick(state, 100);

    const ordered = openOf(state);
    expect(ordered).toHaveLength(2);
    expect(ordered[0]?.raisedAtMinute).toBe(200);
    expect(ordered[1]?.raisedAtMinute).toBe(100);
  });

  it("filters alerts by zone", () => {
    const state = scenario(20, { Z1: DRY, Z3: WET });

    expect(alertsForZone(state.alerts, "Z1")).toHaveLength(1);
    expect(alertsForZone(state.alerts, "Z3")).toHaveLength(1);
    expect(alertsForZone(state.alerts, "Z6")).toHaveLength(0);
  });

  it("keeps a resolved alert in its zone's history", () => {
    let state = scenario(20, { Z1: DRY });
    state = tick(calm(state), 5);

    // Resolved, but still attributable to the zone that raised it.
    expect(alertsForZone(state.alerts, "Z1")).toHaveLength(1);
    expect(alertsForZone(state.alerts, "Z1")[0]?.active).toBe(false);
  });

  it("counts only active critical alerts", () => {
    const state = scenario(10, { Z1: OVERDUE, Z2: DRY });

    // A warning is open too, but only the irrigation failure is critical.
    expect(openOf(state)).toHaveLength(2);
    expect(criticalCount(state.alerts)).toBe(1);
  });

  it("stops counting a critical alert once it resolves", () => {
    let state = scenario(10, { Z1: OVERDUE });
    expect(criticalCount(state.alerts)).toBe(1);

    state = tick(calm(state), 5);
    expect(criticalCount(state.alerts)).toBe(0);
  });
});

describe("rule thresholds come from config", () => {
  it("honours the configured consecutive-reading count", () => {
    // Guards against a rule hard-coding 3 while the config says otherwise.
    expect(
      openOf(scenario(10, { Z1: { consecutiveDry: Math.max(0, ALERT_RULES.dryConsecutive - 1) } })),
    ).toHaveLength(0);
    expect(openOf(scenario(10, { Z1: DRY }))).toHaveLength(1);
  });

  it("honours the configured offline threshold", () => {
    const silentAt = (silence: number) => {
      const base = createInitialState();
      return activeAlerts(
        evaluateAlerts({
          ...base,
          min: silence,
          sensors: base.sensors.map((sensor, index) =>
            index === 0 ? sensor : { ...sensor, lastReportMinute: 10_000 },
          ),
        }),
      );
    };

    expect(silentAt(ALERT_RULES.offlineAfterMinutes - 1)).toHaveLength(0);
    expect(silentAt(ALERT_RULES.offlineAfterMinutes)).toHaveLength(1);
  });
});
