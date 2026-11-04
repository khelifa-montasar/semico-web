import { describe, expect, it } from "vitest";
import { DEMO_FAULTS, IRRIGATION, MOISTURE, buildZones } from "../../src/features/demoPlot/config";
import {
  EXPECTED_ZONE_COUNT,
  averageMoisture,
  irrigatingMinutesBetween,
  irrigationStatus,
  isSensorFaulted,
  isValveFailing,
  minutesUntilDue,
  nextIrrigationInMinutes,
  optimalZoneCount,
  staleSensors,
  wateringZoneCount,
} from "../../src/features/demoPlot/engine/irrigation";
import { createInitialState } from "../../src/features/demoPlot/engine/step";
import type { Sensor, SimulationState, Zone } from "../../src/features/demoPlot/types";

/**
 * Irrigation scheduling, valve state and the derived read-outs.
 */

describe("the two scripted faults", () => {
  it("binds the valve fault to its zone and window only", () => {
    const window = DEMO_FAULTS.noIrrigationStartMinute;

    expect(isValveFailing(DEMO_FAULTS.failingZoneId, window)).toBe(true);
    expect(isValveFailing(DEMO_FAULTS.failingZoneId, window + 1)).toBe(true);

    // One minute before the window, and at its exclusive end.
    expect(isValveFailing(DEMO_FAULTS.failingZoneId, window - 1)).toBe(false);
    expect(isValveFailing(DEMO_FAULTS.failingZoneId, window + DEMO_FAULTS.noIrrigationDurationMinutes)).toBe(
      false,
    );

    // And never for a different zone.
    expect(isValveFailing("Z1", window + 10)).toBe(false);
  });

  it("REGRESSION: the valve fault window must overlap that zone's schedule", () => {
    // This is the bug the engine harness caught: a 20-minute window fell between two of Z5's
    // irrigation times (240 minutes apart), so the `noIrrigation` rule could never fire and was
    // effectively dead code. The window is now longer than the interval, which guarantees an
    // overlap rather than relying on the stagger arithmetic happening to line up.
    expect(DEMO_FAULTS.noIrrigationDurationMinutes).toBeGreaterThanOrEqual(IRRIGATION.intervalMinutes);

    const zone = buildZones().find((candidate) => candidate.id === DEMO_FAULTS.failingZoneId);
    expect(zone).toBeDefined();

    // Walk a simulated day and confirm at least one of that zone's due times lands in the window.
    const start = DEMO_FAULTS.noIrrigationStartMinute;
    const end = start + DEMO_FAULTS.noIrrigationDurationMinutes;

    let due = zone?.nextIrrigationMinute ?? 0;
    let overlapped = false;
    while (due < 1440 * 2) {
      const minuteOfDay = ((due % 1440) + 1440) % 1440;
      if (minuteOfDay >= start && minuteOfDay < end) {
        overlapped = true;
        break;
      }
      due += IRRIGATION.intervalMinutes;
    }

    expect(overlapped).toBe(true);
  });

  it("binds the sensor fault to its sensor and window only", () => {
    const window = DEMO_FAULTS.offlineStartMinute;

    expect(isSensorFaulted(DEMO_FAULTS.offlineSensorId, window)).toBe(true);
    expect(isSensorFaulted(DEMO_FAULTS.offlineSensorId, window - 1)).toBe(false);
    expect(isSensorFaulted(DEMO_FAULTS.offlineSensorId, window + DEMO_FAULTS.offlineDurationMinutes)).toBe(
      false,
    );
    expect(isSensorFaulted("Z1-S1", window + 5)).toBe(false);
  });

  it("keeps the offline window longer than the rule that detects it", () => {
    // A shorter fault than the detection threshold would never raise an `offline` alert.
    expect(DEMO_FAULTS.offlineDurationMinutes).toBeGreaterThan(10);
  });
});

describe("timing helpers", () => {
  it("never reports negative time until due", () => {
    const zone = buildZones()[0] as Zone;
    expect(minutesUntilDue({ ...zone, nextIrrigationMinute: 100 }, 40)).toBe(60);
    expect(minutesUntilDue({ ...zone, nextIrrigationMinute: 100 }, 100)).toBe(0);
    expect(minutesUntilDue({ ...zone, nextIrrigationMinute: 100 }, 500)).toBe(0);
  });

  it("finds the soonest irrigation across the plot", () => {
    const zones = buildZones().map((zone, index) => ({ ...zone, nextIrrigationMinute: 500 - index * 10 }));
    expect(nextIrrigationInMinutes(zones, 0)).toBe(450);
    expect(nextIrrigationInMinutes([], 0)).toBeNull();
  });
});

describe("irrigationStatus", () => {
  it("is Active whenever any valve is open", () => {
    const zones = buildZones().map((zone, index) => ({ ...zone, valveOpen: index === 4 }));
    expect(irrigationStatus(zones, 0)).toBe("Active");
  });

  it("is Scheduled when nothing is open but something is due within the window", () => {
    const zones = buildZones().map((zone) => ({
      ...zone,
      valveOpen: false,
      nextIrrigationMinute: 0,
    }));
    const zonesWithSoon = zones.map((zone, index) =>
      index === 0 ? { ...zone, nextIrrigationMinute: IRRIGATION.scheduledWindowMinutes } : { ...zone, nextIrrigationMinute: 10_000 },
    );

    expect(irrigationStatus(zonesWithSoon, 0)).toBe("Scheduled");
  });

  it("is Idle when nothing is open and nothing is due soon", () => {
    const zones = buildZones().map((zone) => ({
      ...zone,
      valveOpen: false,
      nextIrrigationMinute: 100_000,
    }));
    expect(irrigationStatus(zones, 0)).toBe("Idle");
  });

  it("treats exactly the window boundary as Scheduled, and one minute later as Idle", () => {
    const at = (due: number) =>
      irrigationStatus(
        buildZones().map((zone, index) => ({
          ...zone,
          valveOpen: false,
          nextIrrigationMinute: index === 0 ? due : 100_000,
        })),
        0,
      );

    expect(at(IRRIGATION.scheduledWindowMinutes)).toBe("Scheduled");
    expect(at(IRRIGATION.scheduledWindowMinutes + 1)).toBe("Idle");
  });
});

describe("irrigatingMinutesBetween", () => {
  const zone = { ...(buildZones()[0] as Zone), valveOpenedAtMinute: 100 };

  it("charges the whole window when the tick contains it", () => {
    expect(irrigatingMinutesBetween(zone, 100, 112)).toBe(IRRIGATION.durationMinutes);
  });

  it("charges a proportional slice for a partial tick", () => {
    expect(irrigatingMinutesBetween(zone, 90, 110)).toBe(10);
    expect(irrigatingMinutesBetween(zone, 105, 130)).toBe(7);
  });

  it("charges nothing before the valve opened or after it closed", () => {
    expect(irrigatingMinutesBetween(zone, 0, 90)).toBe(0);
    expect(irrigatingMinutesBetween(zone, 112, 200)).toBe(0);
    expect(irrigatingMinutesBetween(zone, 500, 600)).toBe(0);
  });

  it("charges nothing when the valve has never opened", () => {
    expect(irrigatingMinutesBetween({ ...zone, valveOpenedAtMinute: null }, 0, 100)).toBe(0);
  });

  it("never charges more than the irrigation duration, however long the tick", () => {
    expect(irrigatingMinutesBetween(zone, 0, 10_000)).toBeLessThanOrEqual(IRRIGATION.durationMinutes);
  });
});

describe("plot read-outs", () => {
  it("counts open valves", () => {
    const zones = buildZones().map((zone, index) => ({ ...zone, valveOpen: index < 2 }));
    expect(wateringZoneCount(zones)).toBe(2);
  });

  it("counts optimal zones inclusively at both bounds", () => {
    const moisture = [MOISTURE.optimalMin, MOISTURE.optimalMax, MOISTURE.optimalMin - 0.1, MOISTURE.optimalMax + 0.1, 30, 30];
    const zones = buildZones().map((zone, index) => ({ ...zone, moisture: moisture[index] ?? 30 }));

    // 25 and 35 count; 24.9 and 35.1 do not.
    expect(optimalZoneCount(zones)).toBe(4);
  });

  it("averages moisture to one decimal place", () => {
    const zones = buildZones().map((zone, index) => ({ ...zone, moisture: [10, 20, 30, 40, 25, 25][index] ?? 0 }));
    expect(averageMoisture(zones)).toBe(25);
  });

  it("returns zero average for an empty plot rather than NaN", () => {
    expect(averageMoisture([])).toBe(0);
  });

  it("exposes the expected zone count as rows × columns", () => {
    expect(EXPECTED_ZONE_COUNT).toBe(6);
    expect(buildZones()).toHaveLength(EXPECTED_ZONE_COUNT);
  });
});

describe("staleSensors", () => {
  it("finds sensors that have gone quiet for longer than the rule allows", () => {
    const base = createInitialState();
    const sensors: Sensor[] = base.sensors.map((sensor, index) =>
      index === 0 ? { ...sensor, lastReportMinute: 0 } : { ...sensor, lastReportMinute: 100 },
    );

    const state: SimulationState = { ...base, min: 100, sensors };
    const stale = staleSensors(state);

    expect(stale).toHaveLength(1);
    expect(stale[0]?.id).toBe(base.sensors[0]?.id);
  });

  it("reports nothing while every sensor is reporting", () => {
    const base = createInitialState();
    expect(staleSensors({ ...base, min: 5 })).toHaveLength(0);
  });
});
