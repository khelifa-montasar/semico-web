import { prisma } from "../../db/prisma.js";
import type { TelemetryQuery } from "@semico/shared";

/**
 * Telemetry, device status and diagnostics.
 *
 * All reads are farm-scoped and time-bounded. `Telemetry` carries a composite `(farmId,
 * recordedAt)` index precisely because every query here is a range scan over one farm's readings.
 */
type TelemetryReadingInput = {
  farmId: string;
  zoneId?: string | null;
  recordedAt: Date;
  sourceMessageId?: string | null;
  rootMoisture?: number | null;
  surfaceMoisture?: number | null;
  soilTempC?: number | null;
  batteryPct?: number | null;
  flowRateLpm?: number | null;
  loraRssi?: number | null;
  valveState?: string | null;
};

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
      // The location is shown in the table, so it is fetched with the row rather than left to a
      // second query per entry.
      include: { zone: { select: { id: true, name: true } } },
    });
  },

  /** Every sensor on the farm, with its zone, ordered so grouping is a single pass. */
  listSensors(farmId: string) {
    return prisma.sensor.findMany({
      where: { farmId },
      orderBy: [{ zone: { sortOrder: "asc" } }, { sortOrder: "asc" }, { key: "asc" }],
      include: { zone: { select: { id: true, name: true, sortOrder: true } } },
    });
  },

  /** Raw ingest, used by the MQTT gateway and tests. */
  createReading(data: TelemetryReadingInput) {
    return prisma.telemetry.create({ data });
  },

  /** Persist a validated device reading and its compatible health state atomically. */
  async persistDeviceReading(input: {
    reading: TelemetryReadingInput;
    kind: "CONTROLLER" | "GATEWAY" | "SENSOR";
    sensorKey?: string;
  }) {
    try {
      return await prisma.$transaction(async (tx) => {
        const { reading, kind, sensorKey } = input;
        const prior = await tx.telemetry.findUnique({
          where: {
            farmId_sourceMessageId: {
              farmId: reading.farmId,
              sourceMessageId: reading.sourceMessageId ?? "",
            },
          },
        });
        if (prior) return { reading: prior, duplicate: true };

        const persisted = await tx.telemetry.create({ data: reading });
        await tx.deviceStatus.upsert({
          where: { farmId: reading.farmId },
          create: {
            farmId: reading.farmId,
            controllerOnline: kind === "CONTROLLER",
            loraGatewayOnline: kind === "GATEWAY",
            loraRssi: reading.loraRssi ?? null,
            batteryPct: reading.batteryPct ?? null,
            flowRateLpm: reading.flowRateLpm ?? null,
          },
          update: {
            ...(kind === "CONTROLLER" ? { controllerOnline: true } : {}),
            ...(kind === "GATEWAY" ? { loraGatewayOnline: true } : {}),
            ...(reading.loraRssi !== undefined ? { loraRssi: reading.loraRssi } : {}),
            ...(reading.batteryPct !== undefined ? { batteryPct: reading.batteryPct } : {}),
            ...(reading.flowRateLpm !== undefined ? { flowRateLpm: reading.flowRateLpm } : {}),
          },
        });

        if (sensorKey) {
          const updated = await tx.sensor.updateMany({
            where: { farmId: reading.farmId, zoneId: reading.zoneId ?? undefined, key: sensorKey },
            data: {
              connection: "ONLINE",
              lastSeenAt: new Date(),
              ...(reading.batteryPct !== undefined ? { batteryPct: reading.batteryPct } : {}),
            },
          });
          if (updated.count !== 1) throw new Error("Configured sensor no longer exists on its farm");
        }

        const status = await tx.deviceStatus.findUnique({ where: { farmId: reading.farmId } });
        return { reading: persisted, status, duplicate: false };
      });
    } catch (error) {
      if (
        input.reading.sourceMessageId &&
        typeof error === "object" && error !== null &&
        "code" in error && error.code === "P2002"
      ) {
        const prior = await prisma.telemetry.findUnique({
          where: {
            farmId_sourceMessageId: {
              farmId: input.reading.farmId,
              sourceMessageId: input.reading.sourceMessageId,
            },
          },
        });
        if (prior) return { reading: prior, duplicate: true as const };
      }
      throw error;
    }
  },

  countReadings(farmId: string, window: { from: Date; to: Date }) {
    return prisma.telemetry.count({
      where: { farmId, recordedAt: { gte: window.from, lte: window.to } },
    });
  },
};

export type { TelemetryQuery };
