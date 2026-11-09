import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";

interface HistoryScope {
  farmId: string;
  zoneId: string;
  sensorId?: string;
}

interface HourBucket {
  bucket: number | bigint;
  moisture: number | null;
  samples: number | bigint;
}

export const historyRepository = {
  zone(farmId: string, id: string) {
    return prisma.zone.findFirst({ where: { id, farmId } });
  },

  sensor(farmId: string, id: string) {
    return prisma.sensor.findFirst({
      where: { id, farmId, zone: { farmId } },
      include: { zone: true },
    });
  },

  sensors(farmId: string, zoneId: string) {
    return prisma.sensor.findMany({
      where: { farmId, zoneId },
      orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
    });
  },

  latest(scope: HistoryScope, to: Date) {
    return prisma.telemetry.findFirst({
      where: { ...scope, recordedAt: { lte: to }, rootMoisture: { not: null } },
      orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
    });
  },

  hourly(scope: HistoryScope, from: Date, to: Date) {
    return prisma.$queryRaw<HourBucket[]>(Prisma.sql`
      SELECT MIN(23, CAST(("recordedAt" - ${from.getTime()}) / 3600000 AS INTEGER)) AS bucket,
             AVG("rootMoisture") AS moisture, COUNT("rootMoisture") AS samples
      FROM "Telemetry"
      WHERE "farmId" = ${scope.farmId} AND "zoneId" = ${scope.zoneId}
        AND "recordedAt" >= ${from.getTime()} AND "recordedAt" <= ${to.getTime()}
        ${scope.sensorId ? Prisma.sql`AND "sensorId" = ${scope.sensorId}` : Prisma.empty}
      GROUP BY bucket ORDER BY bucket
    `);
  },

  lastWatering(farmId: string, zoneId: string, to: Date) {
    return prisma.irrigationCommand.findFirst({
      where: {
        farmId,
        zoneId,
        action: "OPEN",
        status: "EXECUTED",
        executedAt: { lte: to },
      },
      orderBy: [{ executedAt: "desc" }, { id: "desc" }],
      select: { id: true, executedAt: true, durationMin: true },
    });
  },

  async warnings(
    farmId: string,
    zoneId: string,
    sensorKeys: string[],
    from: Date,
    to: Date,
    sensorKey?: string,
  ) {
    const where: Prisma.ErrorLogWhereInput = {
      farmId,
      occurredAt: { gte: from, lte: to },
      OR: [
        {
          zoneId,
          ...(sensorKey ? { OR: [{ sensorKey }, { sensorKey: null }] } : {}),
        },
        { zoneId: null, sensorKey: null },
        {
          zoneId: null,
          sensorKey: { in: sensorKey ? [sensorKey] : sensorKeys },
        },
      ],
    };
    const [rows, count] = await Promise.all([
      prisma.errorLog.findMany({
        where,
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: 100,
        include: { zone: { select: { name: true } } },
      }),
      prisma.errorLog.count({ where }),
    ]);
    return { rows, count };
  },
};
