import { prisma } from "../../db/prisma.js";

/**
 * Analytics reads.
 *
 * Everything here is an aggregate over telemetry and the activity feed for one farm. The two hot
 * reads are a time-range scan of `Telemetry` and a time-range scan of `ActivityLog`, both of which
 * carry `(farmId, <time>)` composite indexes.
 */
export const analyticsRepository = {
  telemetryInRange(farmId: string, window: { from: Date; to: Date }, zoneId?: string) {
    return prisma.telemetry.findMany({
      where: {
        farmId,
        recordedAt: { gte: window.from, lte: window.to },
        ...(zoneId ? { zoneId } : {}),
      },
      orderBy: { recordedAt: "asc" },
      select: { recordedAt: true, rootMoisture: true, surfaceMoisture: true, flowRateLpm: true },
    });
  },

  activityInRange(farmId: string, window: { from: Date; to: Date }) {
    return prisma.activityLog.findMany({
      where: { farmId, occurredAt: { gte: window.from, lte: window.to } },
      select: { occurredAt: true, kind: true, type: true },
    });
  },

  errorsInRange(farmId: string, window: { from: Date; to: Date }) {
    return prisma.errorLog.count({
      where: { farmId, occurredAt: { gte: window.from, lte: window.to } },
    });
  },

  componentSummary(farmId: string) {
    return prisma.systemComponent.groupBy({
      by: ["status"],
      where: { farmId },
      _count: { _all: true },
    });
  },

  /** Readings inside one farm-local day, for the hourly drying curve. */
  readingsForDay(farmId: string, window: { from: Date; to: Date }) {
    return prisma.telemetry.findMany({
      where: { farmId, recordedAt: { gte: window.from, lte: window.to } },
      orderBy: { recordedAt: "asc" },
      select: { recordedAt: true, rootMoisture: true, flowRateLpm: true },
    });
  },
};
