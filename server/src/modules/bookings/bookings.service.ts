import { Prisma } from "@prisma/client";
import {
  BOOKING_DEFAULTS,
  ERROR_CODES,
  type Booking,
  type BookingAvailability,
  type BookingSlot,
  type CreateBookingInput,
  type PaginationMeta,
} from "@semico/shared";
import { ApiError } from "../../lib/ApiError.js";
import { parsePage } from "../../lib/pagination.js";
import {
  daysInFarmMonth,
  endOfFarmMonth,
  farmDayKey,
  parseFarmDay,
  parseFarmMonth,
  startOfFarmDay,
  startOfFarmMonth,
} from "../../lib/time.js";
import { bookingsRepository } from "./bookings.repository.js";

/**
 * Consultation bookings.
 *
 * The page used to hardcode April 2026, a list of available days and two blocked slots. Here the
 * slots come from one canonical list, and a slot is free unless something already occupies it —
 * either a booking or an explicit block.
 *
 * All dates are handled in farm-local time (Africa/Algiers, UTC+1), which is what the UI prints.
 */

/**
 * The slot grid. 30-minute consultations with a lunch break, matching the design.
 *
 * Deliberately a server-side constant rather than a database table: these are business hours, not
 * user data, and keeping them in code means availability cannot drift from the picker.
 */
const SLOTS = [
  "9:00 am",
  "9:30 am",
  "10:00 am",
  "10:30 am",
  "11:00 am",
  "2:00 pm",
  "2:30 pm",
  "3:00 pm",
  "3:30 pm",
  "4:00 pm",
  "4:30 pm",
] as const;

function toBooking(row: {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  day: Date;
  startTime: string;
  timezone: string;
  meetingType: string;
  durationMin: number;
  status: string;
  notes: string | null;
  createdAt: Date;
}): Booking {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    // The stored `day` is UTC midnight of the farm-local date; hand back the plain date.
    date: row.day.toISOString().slice(0, 10),
    startTime: row.startTime,
    timezone: row.timezone,
    meetingType: row.meetingType,
    durationMin: row.durationMin,
    status: row.status as Booking["status"],
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

export const bookingsService = {
  /**
   * Slots for a month, plus which days can be booked at all.
   *
   * "Available" means not already booked and not explicitly blocked. Past days are excluded —
   * offering a slot that has already passed is worse than showing nothing.
   */
  async availability(month?: string, date?: string): Promise<BookingAvailability> {
    const anchor = month ? parseFarmMonth(month) : new Date();
    if (!anchor) {
      throw ApiError.badRequest("Month must look like 2026-04", { month: ["Expected YYYY-MM"] });
    }

    const from = startOfFarmMonth(anchor);
    const to = endOfFarmMonth(anchor);
    const monthKey = farmDayKey(from).slice(0, 7);

    const [bookings, blocks] = await Promise.all([
      bookingsRepository.bookedInRange(from, to),
      bookingsRepository.blockedInRange(from, to),
    ]);

    const takenKeys = new Set(
      bookings.map((booking) => `${farmDayKey(booking.day)}|${booking.startTime}`),
    );
    const blockedReasons = new Map(
      blocks.map((block) => [`${farmDayKey(block.day)}|${block.startTime}`, "Unavailable"]),
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayUtc = new Date(
      Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
    );

    const totalDays = daysInFarmMonth(from);
    const availableDays: number[] = [];

    for (let dayNumber = 1; dayNumber <= totalDays; dayNumber += 1) {
      const day = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), dayNumber));

      // Days already gone cannot be booked.
      if (day.getTime() < todayUtc.getTime()) continue;

      const key = `${farmDayKey(day)}`;
      const hasFreeSlot = SLOTS.some(
        (slot) => !takenKeys.has(`${key}|${slot}`) && !blockedReasons.has(`${key}|${slot}`),
      );

      if (hasFreeSlot) availableDays.push(dayNumber);
    }

    // The picker shows one day's slots at a time. When the caller names a day, report that one;
    // otherwise the first bookable day, so the response is always meaningful.
    const requestedDay = date ? parseFarmDay(date) : null;
    if (date && !requestedDay) {
      throw ApiError.badRequest("Date must look like 2026-04-23", { date: ["Expected YYYY-MM-DD"] });
    }

    let focusDate: Date;
    if (requestedDay) {
      // A requested day must belong to the month being displayed, or the returned slots would
      // silently describe a different month from the calendar the visitor is looking at.
      if (
        requestedDay.getUTCFullYear() !== from.getUTCFullYear() ||
        requestedDay.getUTCMonth() !== from.getUTCMonth()
      ) {
        throw ApiError.badRequest("That date is not in the requested month", {
          date: ["Must fall within the requested month"],
        });
      }
      if (requestedDay.getTime() < todayUtc.getTime()) {
        throw ApiError.badRequest("That date has already passed", {
          date: ["Choose today or a later date"],
        });
      }
      focusDate = requestedDay;
    } else {
      const focusDay = availableDays[0] ?? todayUtc.getUTCDate();
      focusDate = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), focusDay));
    }

    const focusKey = farmDayKey(focusDate);

    const slots: BookingSlot[] = SLOTS.map((time) => {
      const key = `${focusKey}|${time}`;
      if (takenKeys.has(key)) return { time, available: false, reason: "Booked" };
      const blocked = blockedReasons.get(key);
      if (blocked) return { time, available: false, reason: blocked };
      return { time, available: true };
    });

    return {
      month: monthKey,
      date: focusKey,
      availableDays,
      daysInMonth: totalDays,
      slots,
      timezone: BOOKING_DEFAULTS.timezone,
      meetingType: BOOKING_DEFAULTS.meetingType,
      durationMin: BOOKING_DEFAULTS.durationMin,
    };
  },

  /**
   * Books a slot.
   *
   * The uniqueness constraint on `(day, startTime)` is the real guarantee; the availability check
   * here exists to return a clear error rather than a raw constraint violation. Two requests
   * racing for the same slot will still see one of them fail at the database level.
   */
  async create(input: CreateBookingInput): Promise<Booking> {
    const day = parseFarmDay(input.date);
    if (!day) {
      throw ApiError.badRequest("Date must look like 2026-04-23", { date: ["Expected YYYY-MM-DD"] });
    }

    // The picker never offers a past day, but the endpoint accepted one — so a client could book a
    // consultation into last month and it would sit in the owner's list as a live appointment.
    if (day.getTime() < startOfFarmDay(new Date()).getTime()) {
      throw ApiError.badRequest("That date has already passed", {
        date: ["Choose today or a later date"],
      });
    }

    if (!(SLOTS as readonly string[]).includes(input.startTime)) {
      throw ApiError.badRequest("That is not a valid consultation slot", {
        startTime: [`Expected one of: ${SLOTS.join(", ")}`],
      });
    }

    const { taken, blocked } = await bookingsRepository.dayState(day);

    if (taken.has(input.startTime)) {
      throw ApiError.conflict(
        "That slot has just been taken. Please choose another time.",
        ERROR_CODES.SLOT_UNAVAILABLE,
      );
    }
    if (blocked.has(input.startTime)) {
      throw ApiError.conflict("That slot is not available.", ERROR_CODES.SLOT_UNAVAILABLE);
    }

    const row = await bookingsRepository.create({
      name: input.name,
      email: input.email,
      phone: input.phone && input.phone.length > 0 ? input.phone : null,
      day,
      startTime: input.startTime,
      visitorTimezone: input.visitorTimezone ?? null,
      notes: input.notes ?? null,
    });

    return toBooking(row);
  },

  /** Owner-facing list, so the farm can see who is coming. */
  async list(
    filters: { status?: string | undefined },
    page: { page?: unknown; pageSize?: unknown },
  ): Promise<{ bookings: Booking[]; meta: PaginationMeta }> {
    const window = parsePage(page);
    const [rows, total] = await bookingsRepository.list(filters, window);

    return {
      bookings: rows.map(toBooking),
      meta: {
        page: window.page,
        pageSize: window.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / window.pageSize)),
      },
    };
  },

  /**
   * Confirm or cancel.
   *
   * Cancelling RELEASES the slot by clearing `slotKey`; re-instating a cancelled booking has to
   * reclaim it, which fails with a conflict if someone else has taken it in the meantime.
   */
  async updateStatus(id: string, status: "PENDING" | "CONFIRMED" | "CANCELLED"): Promise<Booking> {
    const existing = await bookingsRepository.findById(id);
    if (!existing) throw ApiError.notFound("That booking does not exist");

    const slotKey =
      status === "CANCELLED"
        ? null
        : `${existing.day.toISOString().slice(0, 10)}|${existing.startTime}`;

    try {
      return toBooking(await bookingsRepository.updateStatus(id, status, slotKey));
    } catch (error) {
      // Reclaiming a slot that has since been taken is a conflict, not a server error.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw ApiError.conflict(
          "That slot has been taken by another booking",
          ERROR_CODES.SLOT_UNAVAILABLE,
        );
      }
      throw error;
    }
  },
};
