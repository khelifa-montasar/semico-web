import { DEFAULT_SENSORS_PER_ZONE, DEFAULT_ZONE_COUNT } from "@semico/shared";
import { prisma } from "../../db/prisma.js";
import { generateOwnerCode } from "../../lib/initials.js";

/** The subset of the Prisma client a create needs — satisfied by both the client and a transaction. */
type Db = Pick<typeof prisma, "farm" | "zone">;

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
      latitude?: number | null;
      longitude?: number | null;
      ownerCode?: string;
      boundaryJson?: string | null;
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
      timezone?: string;
      zoneCount?: number;
      sensorsPerZone?: number;
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

  findZone(farmId: string, zoneId: string, client: Db = prisma) {
    return client.zone.findFirst({ where: { id: zoneId, farmId } });
  },

  createZone(farmId: string, input: { name: string; sortOrder: number }, client: Db = prisma) {
    return client.zone.create({ data: { farmId, ...input } });
  },

  updateZone(
    farmId: string,
    zoneId: string,
    input: { name?: string; sortOrder?: number },
    client: Db = prisma,
  ) {
    return client.zone.updateMany({ where: { id: zoneId, farmId }, data: input });
  },

  /** Every farm an owner holds, oldest first. This is the farm switcher's source. */
  listByOwner(ownerId: string) {
    return prisma.farm.findMany({
      where: { ownerId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        wilayaId: true,
        commune: true,
        landAreaHa: true,
        createdAt: true,
      },
    });
  },

  countByOwner(ownerId: string) {
    return prisma.farm.count({ where: { ownerId } });
  },

  /**
   * Creates a farm with the same defaults signup gives the first one — settings, a device-status
   * row and three named zones. A farm created without them would render an empty dashboard and
   * fail on the first telemetry query that expects a zone.
   *
   * Takes a client so the owner's farm-count check and the insert can share one transaction.
   */
  async createWithDefaults(
    input: {
      name: string;
      ownerId: string;
      wilayaId?: string | null;
      commune?: string | null;
      landAreaHa?: number | null;
      latitude?: number | null;
      longitude?: number | null;
    },
    client: Db = prisma,
  ) {
    // Retry on the (astronomically unlikely) ownerCode collision rather than failing the request.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const ownerCode = generateOwnerCode();
      const clash = await client.farm.findUnique({ where: { ownerCode }, select: { id: true } });
      if (clash) continue;

      return client.farm.create({
        data: {
          name: input.name,
          ownerCode,
          ownerId: input.ownerId,
          wilayaId: input.wilayaId ?? null,
          commune: input.commune ?? null,
          landAreaHa: input.landAreaHa ?? null,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          settings: {
            create: {
              zoneCount: DEFAULT_ZONE_COUNT,
              sensorsPerZone: DEFAULT_SENSORS_PER_ZONE,
            },
          },
          deviceStatus: { create: { controllerOnline: false } },
          zones: {
            create: Array.from({ length: DEFAULT_ZONE_COUNT }, (_, sortOrder) => ({
              name: `Zone ${sortOrder + 1}`,
              sortOrder,
            })),
          },
        },
      });
    }

    throw new Error("Could not allocate a unique farm owner code");
  },
};
