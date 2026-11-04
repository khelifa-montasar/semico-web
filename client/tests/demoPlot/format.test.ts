import { describe, expect, it } from "vitest";
import { MOISTURE } from "../../src/features/demoPlot/config";
import {
  ALERT_COPY_KEY,
  SEVERITY_RANK,
  SEVERITY_TOKEN,
  ZONE_STATUS_KEY,
  bandToken,
  clockLabel,
  dayNumber,
  minuteOfDay,
} from "../../src/features/demoPlot/format";
import type { AlertSeverity, AlertType, ZoneStatus } from "../../src/features/demoPlot/types";

/**
 * Presentation helpers.
 *
 * `clockLabel` matters more than it looks: it is the only clock in the module, and the plot runs at
 * up to 20× speed, so every timestamp on screen comes from here rather than from the wall clock.
 */

describe("simulated clock", () => {
  it("formats and zero-pads", () => {
    expect(clockLabel(0)).toBe("00:00");
    expect(clockLabel(9)).toBe("00:09");
    expect(clockLabel(60)).toBe("01:00");
    expect(clockLabel(90)).toBe("01:30");
    expect(clockLabel(14 * 60 + 22)).toBe("14:22");
    expect(clockLabel(1439)).toBe("23:59");
  });

  it("wraps at a simulated day boundary", () => {
    expect(clockLabel(1440)).toBe("00:00");
    expect(clockLabel(1440 + 61)).toBe("01:01");
    expect(clockLabel(1440 * 5 + 30)).toBe("00:30");
  });

  it("handles negative minutes without producing a negative clock", () => {
    // `minuteOfDay` wraps rather than truncating, so a modulo of a negative number cannot leak out.
    expect(minuteOfDay(-1)).toBe(1439);
    expect(minuteOfDay(-60)).toBe(1380);
    expect(clockLabel(-60)).toBe("23:00");
  });

  it("never emits a malformed label for any minute in a long run", () => {
    for (let minute = 0; minute < 5000; minute += 7) {
      expect(clockLabel(minute)).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  it("counts simulated days from 1", () => {
    expect(dayNumber(0)).toBe(1);
    expect(dayNumber(1439)).toBe(1);
    expect(dayNumber(1440)).toBe(2);
    expect(dayNumber(1440 * 3)).toBe(4);
  });
});

describe("bandToken", () => {
  it("classifies at the exact boundaries", () => {
    expect(bandToken(MOISTURE.redBelow - 0.1)).toBe("crit");
    expect(bandToken(MOISTURE.redBelow)).toBe("warn");

    expect(bandToken(MOISTURE.amberBelow - 0.1)).toBe("warn");
    expect(bandToken(MOISTURE.amberBelow)).toBe("green");

    expect(bandToken(MOISTURE.greenBelow - 0.1)).toBe("green");
    expect(bandToken(MOISTURE.greenBelow)).toBe("blue");
  });

  it("returns a token for every reading in and beyond the clamp", () => {
    const tokens = ["crit", "warn", "green", "blue"];
    for (const moisture of [-100, 0, 6, 17.9, 18, 25, 35, 40, 1000]) {
      expect(tokens).toContain(bandToken(moisture));
    }
  });

  it("keeps the dry band red, so a critical zone is never shown as healthy", () => {
    expect(bandToken(MOISTURE.min)).toBe("crit");
  });
});

describe("copy-key maps", () => {
  it("maps every zone status to a translation key", () => {
    const statuses: ZoneStatus[] = ["optimal", "low", "critical"];
    for (const status of statuses) {
      expect(ZONE_STATUS_KEY[status]).toMatch(/^status(Optimal|Low|Critical)$/);
    }
    expect(Object.keys(ZONE_STATUS_KEY)).toHaveLength(3);
  });

  it("maps every alert type to a title and an action", () => {
    const types: AlertType[] = ["dry", "wet", "offline", "noIrrigation"];
    for (const type of types) {
      expect(ALERT_COPY_KEY[type].title).toBe(type);
      expect(ALERT_COPY_KEY[type].action).toMatch(/^action/);
    }
    // There are exactly four rules; a fifth would need a translation before it could render.
    expect(Object.keys(ALERT_COPY_KEY)).toHaveLength(4);
  });

  it("ranks every severity, with critical most severe", () => {
    const severities: AlertSeverity[] = ["critical", "warning", "info"];
    for (const severity of severities) {
      expect(Number.isFinite(SEVERITY_RANK[severity])).toBe(true);
    }
    expect(SEVERITY_RANK.critical).toBeLessThan(SEVERITY_RANK.warning);
    expect(SEVERITY_RANK.warning).toBeLessThan(SEVERITY_RANK.info);
  });

  it("gives every severity a distinct colour token", () => {
    const tokens = new Set(Object.values(SEVERITY_TOKEN));
    expect(tokens.size).toBe(3);
  });
});
