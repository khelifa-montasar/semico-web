import { useQuery } from "@tanstack/react-query";
import { analyticsApi, queryKeys, type RangeParams } from "@/api";

/**
 * Analytics reads.
 *
 * The rainfall "what-if" is applied SERVER-side and passed as a query parameter, rather than being
 * recomputed in the browser. That keeps one definition of the model: if the client re-implemented
 * the offset, the chart and the exported CSV could disagree about the same setting.
 *
 * Callers should debounce the rainfall value before passing it here — it changes on every pointer
 * step and each distinct value is a distinct cache entry.
 */

export function useAnalyticsOverview(params: RangeParams = {}) {
  return useQuery({
    queryKey: queryKeys.analytics.overview(params.range ?? "7d"),
    queryFn: () => analyticsApi.overview(params),
  });
}

export function useDryingRate(date: string | undefined, rainfallMm: number) {
  return useQuery({
    queryKey: queryKeys.analytics.flow(date, rainfallMm),
    queryFn: () => analyticsApi.flow({ date, rainfallMm }),
    // Keeps the previous curve on screen while the slider settles, instead of blinking to empty.
    placeholderData: (previous) => previous,
  });
}

export function useIrrigationHeatmap(month?: string) {
  return useQuery({
    queryKey: queryKeys.analytics.heatmap(month),
    queryFn: () => analyticsApi.heatmap(month),
    staleTime: 5 * 60_000,
  });
}
