import { prisma } from "../../db/prisma.js";

/**
 * Farm and farm-settings access.
 *
 * Every query is scoped by the caller's `farmId` — there is no "get any farm by id" method, which
 * makes cross-farm access a compile error rather than a code-review catch.
 */
export const farmRepository = {
  findById(farmId: string) {
    return prisma.farm.findUnique({
      where: { id: farmId },
      include: {
        wilaya: { select: { code: true, nameEn: true, nameAr: true } },
        owner: { select: { fullName: true, email: true } },
        _count: { select: { zones: true, workers: true } },
      },
    });
  },

  update(
    farmId: string,
    data: {
      name?: string;
      wilayaId?: string | null;
      commune?: string | null;
      landAreaHa?: number | null;
      ownerCode?: string;
    },
  ) {
    return prisma.farm.update({ where: { id: farmId }, data });
  },

  findSettings(farmId: string) {
    return prisma.farmSettings.findUnique({ where: { farmId } });
  },

  /** Upsert so a farm created outside the normal signup path still gets settings on first write. */
  upsertSettings(
    farmId: string,
    data: {
      moistureThreshold?: number;
      autoIrrigation?: boolean;
      pushNotifications?: boolean;
    },
  ) {
    return prisma.farmSettings.upsert({
      where: { farmId },
      create: { farmId, ...data },
      update: data,
    });
  },

  listZones(farmId: string) {
    return prisma.zone.findMany({ where: { farmId }, orderBy: { sortOrder: "asc" } });
  },

  findZone(farmId: string, zoneId: string) {
    return prisma.zone.findFirst({ where: { id: zoneId, farmId } });
  },
};
