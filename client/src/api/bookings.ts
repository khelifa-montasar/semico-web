import type { Booking, BookingAvailability, CreateBookingInput, UpdateBookingStatusInput } from "@semico/shared";
import { api, qs } from "../lib/api/http";

/**
 * `/bookings`
 *
 * Availability and creation are public — the consultation form sits on the marketing pages and is
 * filled in by anonymous visitors. The owner-side list and status changes are not farm-scoped:
 * these are company consultations, not per-farm records.
 */
export const bookingsApi = {
  /**
   * `date` names the day whose slots to report — the response describes one day at a time.
   * Omitting it returns the first bookable day of the month.
   */
  availability: (params: { month?: string; date?: string } = {}) =>
    api.get<BookingAvailability>(`/bookings/availability${qs(params)}`),

  create: (input: CreateBookingInput) => api.post<Booking>("/bookings", input),

  list: (filters: { status?: string; page?: number; pageSize?: number } = {}) =>
    api.getPage<Booking[]>(`/bookings${qs(filters)}`),

  updateStatus: (id: string, input: UpdateBookingStatusInput) =>
    api.patch<Booking>(`/bookings/${id}`, input),
};
