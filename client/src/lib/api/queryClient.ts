import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./http";

/**
 * The shared query cache.
 *
 * Retry policy is the interesting part: auth and permission failures are never retried, because
 * they will not fix themselves and retrying only delays the redirect or the error message. Network
 * and 5xx failures get two attempts.
 *
 * `staleTime` is deliberately non-zero so navigating between dashboard tabs does not refetch data
 * that was just loaded; live values (telemetry) opt into `refetchInterval` per query instead.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && [400, 401, 403, 404, 409, 429].includes(error.status)) {
          return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      // A failed mutation is a user-visible action; retrying it silently could double-apply it.
      retry: false,
    },
  },
});
