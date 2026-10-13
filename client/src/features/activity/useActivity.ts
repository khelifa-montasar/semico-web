import { useQuery } from "@tanstack/react-query";
import { activityApi, queryKeys, type ActivityFilters } from "@/api";

/**
 * The activity feed and its calendar.
 *
 * Thin wrappers over the API module: the hook exists so components depend on a named intent rather
 * than on query options, which keeps cache keys and refetch behaviour in one place.
 */

export function useActivityFeed(filters: ActivityFilters = {}) {
  return useQuery({
    queryKey: queryKeys.activity.feed(filters),
    queryFn: () => activityApi.feed(filters),
    // Keeps the previous page on screen while the next loads, so the table doesn't collapse to a
    // skeleton every time the filter changes.
    placeholderData: (previous) => previous,
  });
}

export function useActivityCalendar(month?: string) {
  return useQuery({
    queryKey: queryKeys.activity.calendar(month),
    queryFn: () => activityApi.calendar(month),
    // The month only changes when the user navigates, and a new month is a single small request.
    staleTime: 5 * 60_000,
  });
}
