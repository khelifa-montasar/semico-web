import { prisma } from "../../db/prisma.js";

/**
 * Consultations.
 *
 * Availability is derived from two sources: existing bookings and explicit `BookingBlock` rows
 * (the two slots the design marks unavailable, plus lunch, seeded for the next 60 days).
 */
export const bookingsRepository = {
  /** Bookings and blocks for one day, used to work out which slots are still free. */
  async dayState(day: Date) {
    const [bookings, blocks] = await prisma.$transaction([
      prisma.booking.findMany({
        where: { day, status: { not: "CANCELLED" } },
        select: { startTime: true },
      }),
      prisma.bookingBlock.findMany({ where: { day }, select: { startTime: true, reason: true } }),
    ]);

    return {
      taken: new Set(bookings.map((booking) => booking.startTime)),
      blocked: new Map(blocks.map((block) => [block.startTime, block.reason])),
    };
  },

  /** All non-cancelled bookings in a month window, for building the available-days list. */
  bookedInRange(from: Date, to: Date) {
    return prisma.booking.findMany({
      where: { day: { gte: from, lte: to }, status: { not: "CANCELLED" } },
      select: { day: true, startTime: true },
    });
  },

  blockedInRange(from: Date, to: Date) {
    return prisma.bookingBlock.findMany({
      where: { day: { gte: from, lte: to } },
      select: { day: true, startTime: true },
    });
  },

  create(data: {
    name: string;
    email: string;
    phone: string | null;
    day: Date;
    startTime: string;
    visitorTimezone: string | null;
    notes: string | null;
  }) {
    return prisma.booking.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        day: data.day,
        startTime: data.startTime,
        // Claims the slot. A second active booking for the same slot violates the unique index and
        // surfaces as a conflict rather than a silent double-booking.
        slotKey: `${data.day.toISOString().slice(0, 10)}|${data.startTime}`,
        notes: data.notes,
        timezone: "Africa/Algiers",
        meetingType: "Google Meet",
        durationMin: 30,
        status: "PENDING",
      },
    });
  },

  list(filters: { status?: string | undefined }, window: { skip: number; take: number }) {
    const where = filters.status ? { status: filters.status } : {};
    return prisma.$transaction([
      prisma.booking.findMany({
        where,
        orderBy: [{ day: "asc" }, { startTime: "asc" }],
        skip: window.skip,
        take: window.take,
      }),
      prisma.booking.count({ where }),
    ]);
  },

  findById(id: string) {
    return prisma.booking.findUnique({ where: { id } });
  },

  updateStatus(id: string, status: string, slotKey: string | null) {
    return prisma.booking.update({ where: { id }, data: { status, slotKey } });
  },
};
