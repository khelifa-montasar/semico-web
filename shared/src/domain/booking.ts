import { z } from "zod";
import { BOOKING_STATUSES, FARM_TIMEZONE } from "../enums.js";
import type { BookingStatus } from "../enums.js";

/**
 * Consultation-booking contracts.
 *
 * The page hardcodes April 2026, an availability list and two blocked slots. These contracts
 * keep that UX but make it real: availability is computed per month in `Africa/Algiers`, and a
 * booking is rejected if the slot is gone.
 */

/** e.g. "9:30 am" — matches the strings the picker already renders. */
export const slotSchema = z
  .string()
  .trim()
  .regex(/^\d{1,2}:\d{2} (am|pm)$/, "Slot must look like 9:30 am");

export const availabilityQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Month must look like 2026-04")
    .optional(),
  /**
   * The specific day to report slots for, `YYYY-MM-DD`.
   *
   * The response can only describe one day's slots at a time (11 slots × 31 days would be a
   * pointless payload), so the picker names the day it is showing. Omitted means "the first
   * bookable day of the month".
   */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must look like 2026-04-23")
    .optional(),
});

export const createBookingSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[+0-9 ()-]*$/, "Enter a valid phone number")
    .optional()
    .or(z.literal("")),
  /** `YYYY-MM-DD` — the calendar day being booked, in farm time. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must look like 2026-04-23"),
  startTime: slotSchema,
  /** Advisory: what the visitor's browser thinks its zone is. Selection still uses farm time. */
  visitorTimezone: z.string().trim().max(64).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

/** Owner-side status change. Cancelling frees the slot again. */
export const updateBookingStatusSchema = z.object({
  status: z.enum(BOOKING_STATUSES),
});

export type UpdateBookingStatusInput = z.infer<typeof updateBookingStatusSchema>;

export interface BookingSlot {
  time: string;
  available: boolean;
  /** Why it is unavailable, when known — drives the disabled state's tooltip. */
  reason?: string;
}

export interface BookingAvailability {
  month: string;
  /** The day the `slots` below describe, as `YYYY-MM-DD`. */
  date: string;
  /** Day numbers in this month that can be booked at all. */
  availableDays: number[];
  daysInMonth: number;
  slots: BookingSlot[];
  timezone: string;
  meetingType: string;
  durationMin: number;
}

export interface Booking {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  /** ISO date of the booked day (UTC midnight of the farm-local day). */
  date: string;
  startTime: string;
  timezone: string;
  meetingType: string;
  durationMin: number;
  status: BookingStatus;
  notes: string | null;
  createdAt: string;
}

export const BOOKING_DEFAULTS = {
  timezone: FARM_TIMEZONE,
  meetingType: "Google Meet",
  durationMin: 30,
} as const;
