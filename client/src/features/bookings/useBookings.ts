import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateBookingInput } from "@semico/shared";
import { bookingsApi, queryKeys } from "@/api";

/**
 * Consultation bookings.
 *
 * Availability is fetched per day. The response can only describe one day's slots at a time — 11
 * slots across 31 days would be a pointless payload — so the calendar picks the day and the query
 * follows it.
 */

export function useBookingAvailability(params: { month?: string; date?: string }) {
  return useQuery({
    queryKey: queryKeys.bookings.availability(params),
    queryFn: () => bookingsApi.availability(params),
    // Keeps the previous month (or day) on screen while the next loads.
    placeholderData: (previous) => previous,
  });
}

export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBookingInput) => bookingsApi.create(input),
    onSuccess: () => {
      // The slot is now taken, so every cached availability for it is stale.
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    },
  });
}
