import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { analyticsApi, irrigationApi, queryKeys, telemetryApi, type SeriesParams } from "@/api";

/**
 * Dashboard data.
 *
 * The dashboard is the one screen that must feel live, so the telemetry queries poll. Everything
 * else is fetched once and left alone — polling the marketing content or the system diagnostics
 * from here would be load without information.
 */

const LIVE_POLL_MS = 30_000;

export function useLatestTelemetry(zoneId?: string) {
  return useQuery({
    queryKey: queryKeys.telemetry.latest(zoneId),
    queryFn: () => telemetryApi.latest(zoneId),
    refetchInterval: LIVE_POLL_MS,
    placeholderData: (previous) => previous,
  });
}

/** The 7-day trend behind the main chart. */
export function useMoistureSeries(params: SeriesParams) {
  return useQuery({
    queryKey: queryKeys.telemetry.series(params),
    queryFn: () => telemetryApi.series(params),
    refetchInterval: LIVE_POLL_MS,
    placeholderData: (previous) => previous,
  });
}

/**
 * Today's savings for the headline tile.
 *
 * NOTE: these figures are MODELLED from a fixed per-event estimate, not measured — see
 * `analytics.service.ts`. The tile is labelled as an estimate in the UI so it does not read as a
 * meter reading.
 */
export function useTodaySaving() {
  return useQuery({
    queryKey: queryKeys.analytics.overview("24h"),
    queryFn: () => analyticsApi.overview({ range: "24h" }),
    staleTime: 5 * 60_000,
  });
}

/**
 * Opens a valve, then refreshes everything the action affected.
 *
 * The invalidation of BOTH telemetry and activity is the part that is easy to get wrong: the
 * endpoint writes an `IrrigationEvent`, moves the valve AND appends a farmer-facing feed row, so
 * invalidating only the telemetry would leave the Activity page showing a history that does not
 * include the thing the user just did.
 */
export function useIrrigate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (durationMin: number) => irrigationApi.irrigate({ durationMin }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.telemetry.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.activity.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.irrigation.all }),
        // The saving tile moves too, since it counts automated events.
        queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all }),
      ]);
    },
  });
}
