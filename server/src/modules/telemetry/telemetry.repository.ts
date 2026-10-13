import { prisma } from "../../db/prisma.js";
import type { TelemetryQuery } from "@semico/shared";

/**
 * Telemetry, device status and diagnostics.
 *
 * All reads are farm-scoped and time-bounded. `Telemetry` carries a composite `(farmId,
 * recordedAt)` index precisely because every query here is a range scan over one farm's readings.
 */
export const telemetryRepository = {
  /** Readings for a farm in a window, used by the chart series. */
  listRange(
    farmId: string,
    window: { from: Date; to: Date; zoneId?: string | undefined },
  ) {
    return prisma.telemetry.findMany({
      where: {
        farmId,
        recordedAt: { gte: window.from, lte: window.to },
        ...(window.zoneId ? { zoneId: window.zoneId } : {}),
      },
      orderBy: { recordedAt: "asc" },
    });
  },

  /**
   * The most recent reading, optionally for one zone.
   *
   * A plain `findFirst` with a descending sort beats a groupBy here because SQLite handles the
   * indexed range scan well and we need the full row, not an aggregate.
   */
  latest(farmId: string, zoneId?: string) {
    return prisma.telemetry.findFirst({
      where: { farmId, ...(zoneId ? { zoneId } : {}) },
      orderBy: { recordedAt: "desc" },
    });
  },

  /** Latest reading per zone — one query per zone, bounded by the zone count. */
  async latestPerZone(farmId: string) {
    const zones = await prisma.zone.findMany({
      where: { farmId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, valveState: true },
    });

    return Promise.all(
      zones.map(async (zone) => ({
        zone,
        reading: await prisma.telemetry.findFirst({
          where: { farmId, zoneId: zone.id },
          orderBy: { recordedAt: "desc" },
        }),
      })),
    );
  },

  deviceStatus(farmId: string) {
    return prisma.deviceStatus.findUnique({ where: { farmId } });
  },

  listComponents(farmId: string) {
    return prisma.systemComponent.findMany({ where: { farmId }, orderBy: { sortOrder: "asc" } });
  },

  updateComponent(
    farmId: string,
    key: string,
    data: { value?: string; status?: string; detailEn?: string | null; detailAr?: string | null },
  ) {
    return prisma.systemComponent.update({
      where: { farmId_key: { farmId, key } },
      data,
    });
  },

  listErrorLogs(farmId: string, limit: number) {
    return prisma.errorLog.findMany({
      where: { farmId },
      orderBy: { occurredAt: "desc" },
      take: limit,
    });
  },

  /** Raw ingest, used by the (future) device gateway and by tests. */
  createReading(data: {
    farmId: string;
    zoneId?: string | null;
    recordedAt: Date;
    rootMoisture?: number | null;
    surfaceMoisture?: number | null;
    soilTempC?: number | null;
    batteryPct?: number | null;
    flowRateLpm?: number | null;
    loraRssi?: number | null;
    valveState?: string | null;
  }) {
    return prisma.telemetry.create({ data });
  },

  countReadings(farmId: string, window: { from: Date; to: Date }) {
    return prisma.telemetry.count({
      where: { farmId, recordedAt: { gte: window.from, lte: window.to } },
    });
  },
};

export type { TelemetryQuery };
