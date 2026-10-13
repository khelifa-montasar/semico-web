import { useQuery } from "@tanstack/react-query";
import { queryKeys, telemetryApi } from "@/api";

/**
 * System diagnostics.
 *
 * These poll rather than fetch once: the whole point of the screen is to show whether the hardware
 * is currently healthy, and a stale answer is worse than a slightly later one. The interval is
 * deliberately unhurried — a farm controller reports on the order of minutes, so polling faster
 * would only add load without adding information.
 */

const HEALTH_POLL_MS = 30_000;
const ERROR_LOG_POLL_MS = 60_000;

export function useSystemHealth() {
  return useQuery({
    queryKey: queryKeys.systemHealth.detail(),
    queryFn: () => telemetryApi.systemHealth(),
    refetchInterval: HEALTH_POLL_MS,
    // Keep the last known state visible during a refetch so the page doesn't flash.
    placeholderData: (previous) => previous,
  });
}

export function useErrorLogs(limit = 20) {
  return useQuery({
    queryKey: queryKeys.systemHealth.errors(limit),
    queryFn: () => telemetryApi.errorLogs(limit),
    refetchInterval: ERROR_LOG_POLL_MS,
    placeholderData: (previous) => previous,
  });
}
