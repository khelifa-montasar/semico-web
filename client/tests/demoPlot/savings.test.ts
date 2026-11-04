import { describe, expect, it } from "vitest";
import { BMC } from "../../src/features/demoPlot/config";
import { LITRES_PER_DRIP_EVENT, savingsTotals } from "../../src/features/demoPlot/engine/savings";

/**
 * Water savings.
 *
 * The KPI the whole module is built to show, so its arithmetic is pinned rather than assumed —
 * including the degenerate case, which is where a `NaN` would reach the screen.
 */

describe("litres per drip event", () => {
  it("is the traditional baseline less the BMC saving", () => {
    expect(LITRES_PER_DRIP_EVENT).toBe(BMC.traditionalLitresPerZonePerEvent * 0.5);
    expect(LITRES_PER_DRIP_EVENT).toBe(450);
  });
});

describe("savingsTotals", () => {
  it("returns zeros — not NaN — before anything has been irrigated", () => {
    const totals = savingsTotals(0);

    expect(totals).toEqual({
      dripLitres: 0,
      traditionalLitres: 0,
      savedLitres: 0,
      savedPercent: 0,
    });
    // The specific failure this guards: 0/0 reaching the KPI as "NaN %".
    expect(Number.isNaN(totals.savedPercent)).toBe(false);
  });

  it("always reports the BMC's 50% saving", () => {
    for (const events of [1, 2, 7, 36, 100, 5000]) {
      expect(savingsTotals(events).savedPercent).toBe(BMC.waterSavingPercent);
    }
  });

  it("computes saved as traditional minus drip", () => {
    const totals = savingsTotals(6);

    expect(totals.traditionalLitres).toBe(6 * BMC.traditionalLitresPerZonePerEvent);
    expect(totals.dripLitres).toBe(6 * LITRES_PER_DRIP_EVENT);
    expect(totals.savedLitres).toBe(totals.traditionalLitres - totals.dripLitres);
  });

  it("scales linearly with the event count", () => {
    const one = savingsTotals(1);
    const ten = savingsTotals(10);

    expect(ten.savedLitres).toBe(one.savedLitres * 10);
    expect(ten.dripLitres).toBe(one.dripLitres * 10);
  });

  it("never reports more saved than was used traditionally", () => {
    for (const events of [0, 1, 13, 240]) {
      const totals = savingsTotals(events);
      expect(totals.savedLitres).toBeLessThanOrEqual(totals.traditionalLitres);
      expect(totals.dripLitres).toBeGreaterThanOrEqual(0);
    }
  });

  it("stays finite for a long run", () => {
    const totals = savingsTotals(100_000);
    expect(Number.isFinite(totals.savedLitres)).toBe(true);
    expect(Number.isFinite(totals.savedPercent)).toBe(true);
  });
});
