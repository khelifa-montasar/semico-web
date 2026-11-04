import { describe, expect, it } from "vitest";
import { toDryingRateChartPoints } from "../../src/features/analytics/chartData";

describe("toDryingRateChartPoints", () => {
  it("keeps the observed baseline distinct from the rainfall-adjusted scenario", () => {
    expect(toDryingRateChartPoints([
      { hour: 8, label: "08:00", rate: 4.5, adjustedRate: 2 },
      { hour: 9, label: "09:00", rate: 1, adjustedRate: 0 },
    ])).toEqual([
      { hour: 8, baselineRate: 4.5, simulatedRate: 2 },
      { hour: 9, baselineRate: 1, simulatedRate: 0 },
    ]);
  });

  it("uses the baseline when an adjusted rate is absent", () => {
    expect(toDryingRateChartPoints([
      { hour: 8, label: "08:00", rate: 3 },
    ])).toEqual([
      { hour: 8, baselineRate: 3, simulatedRate: 3 },
    ]);
  });
});
