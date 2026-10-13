import type { ActivityQuery } from "@semico/shared";
import { prisma } from "../../db/prisma.js";

/**
 * The activity feed and its calendar.
 *
 * `ActivityLog` carries a composite `(farmId, occurredAt)` index because every read here is
 * "one farm, newest first" or "one farm, this month".
 */
export const activityRepository = {
  async list(
    farmId: string,
    query: ActivityQuery,
    window: { skip: number; take: number },
  ) {
    const where = {
      farmId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.zoneId ? { zoneId: query.zoneId } : {}),
      ...(query.from || query.to
        ? {
            occurredAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    // Count and page in one transaction so the total cannot drift from the rows mid-request.
    const [rows, total] = await prisma.$transaction([
      prisma.activityLog.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        skip: window.skip,
        take: window.take,
        include: {
          zone: { select: { id: true, name: true } },
        },
      }),
      prisma.activityLog.count({ where }),
    ]);

    return { rows, total };
  },

  /** Actor names for a page of rows, resolved in one query rather than one per row. */
  async actorsFor(actorIds: (string | null)[]) {
    const unique = [...new Set(actorIds.filter((id): id is string => Boolean(id)))];
    if (unique.length === 0) return new Map<string, string>();

    const users = await prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, fullName: true },
    });

    return new Map(users.map((user) => [user.id, user.fullName]));
  },

  /** Day-of-month numbers in a window that contain at least one irrigation event. */
  async irrigationDays(farmId: string, window: { from: Date; to: Date }) {
    return prisma.activityLog.findMany({
      where: {
        farmId,
        occurredAt: { gte: window.from, lte: window.to },
        kind: { in: ["VALVE_OPEN", "SCHEDULED_IRRIGATION", "THRESHOLD_REACHED"] },
      },
      select: { occurredAt: true },
      orderBy: { occurredAt: "asc" },
    });
  },
};
