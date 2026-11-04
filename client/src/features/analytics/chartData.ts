import type { DryingRatePoint } from "@semico/shared";

export interface DryingRateChartPoint extends Record<string, number> {
  hour: number;
  baselineRate: number;
  simulatedRate: number;
}

/** Keep the recorded baseline beside the server-modelled rainfall scenario for comparison. */
export function toDryingRateChartPoints(points: DryingRatePoint[]): DryingRateChartPoint[] {
  return points.map((point) => ({
    hour: point.hour,
    baselineRate: point.rate,
    simulatedRate: point.adjustedRate ?? point.rate,
  }));
}
