import type { Farm, FarmSettings, UpdateFarmInput, FarmSettingsInput, Zone } from "@semico/shared";
import { ApiError } from "../../lib/ApiError.js";
import { loc } from "../../lib/localized.js";
import { generateOwnerCode } from "../../lib/initials.js";
import { prisma } from "../../db/prisma.js";
import { writeAudit } from "../../lib/audit.js";
import { farmRepository } from "./farm.repository.js";
import type { AuthContext } from "../../types/auth.js";
import type { Request } from "express";

/**
 * Farm profile, settings, zones and the owner code.
 *
 * Reads are available to any active member (observers included). Writes are owner-only and are
 * enforced by `requireOwner` on the routes, then re-asserted here for the code paths that are
 * reachable from more than one place.
 */

function requireFarmId(auth: AuthContext): string {
  if (!auth.farmId) throw ApiError.forbidden("You are not attached to a farm yet");
  return auth.farmId;
}

type FarmRow = NonNullable<Awaited<ReturnType<typeof farmRepository.findById>>>;

function toFarm(row: FarmRow, auth: AuthContext): Farm {
  return {
    id: row.id,
    name: row.name,
    // The join code is a credential: a worker could hand it to anyone. Only the owner sees it.
    ownerCode: auth.role === "OWNER" ? row.ownerCode : "",
    wilayaId: row.wilayaId,
    wilayaName: row.wilaya ? loc(row.wilaya.nameEn, row.wilaya.nameAr) : null,
    commune: row.commune,
    landAreaHa: row.landAreaHa,
    createdAt: row.createdAt.toISOString(),
  };
}

function toSettings(row: NonNullable<Awaited<ReturnType<typeof farmRepository.findSettings>>>): FarmSettings {
  return {
    moistureThreshold: row.moistureThreshold,
    autoIrrigation: row.autoIrrigation,
    pushNotifications: row.pushNotifications,
    timezone: row.timezone,
  };
}

export const farmService = {
  async get(auth: AuthContext): Promise<Farm> {
    const row = await farmRepository.findById(requireFarmId(auth));
    if (!row) throw ApiError.notFound("Farm not found");
    return toFarm(row, auth);
  },

  async update(auth: AuthContext, input: UpdateFarmInput, req?: Request): Promise<Farm> {
    const farmId = requireFarmId(auth);

    const updated = await farmRepository.update(farmId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.wilayaId !== undefined ? { wilayaId: input.wilayaId || null } : {}),
      ...(input.commune !== undefined ? { commune: input.commune || null } : {}),
      ...(input.landAreaHa !== undefined ? { landAreaHa: input.landAreaHa } : {}),
    });

    await prisma.$transaction(async (tx) => {
      await writeAudit(
        tx,
        {
          actorId: auth.userId,
          farmId,
          action: "PROFILE_UPDATED",
          entityType: "FARM",
          entityId: farmId,
          metadata: { fields: Object.keys(input) },
        },
        req,
      );
    });

    const row = await farmRepository.findById(updated.id);
    if (!row) throw ApiError.notFound("Farm not found");
    return toFarm(row, auth);
  },

  async getSettings(auth: AuthContext): Promise<FarmSettings> {
    const farmId = requireFarmId(auth);
    // Reading before the first write should not 404 — behave as if defaults exist.
    const row =
      (await farmRepository.findSettings(farmId)) ?? (await farmRepository.upsertSettings(farmId, {}));
    return toSettings(row);
  },

  async updateSettings(
    auth: AuthContext,
    input: Partial<FarmSettingsInput>,
    req?: Request,
  ): Promise<FarmSettings> {
    const farmId = requireFarmId(auth);
    const row = await farmRepository.upsertSettings(farmId, input);

    await prisma.$transaction(async (tx) => {
      await writeAudit(
        tx,
        {
          actorId: auth.userId,
          farmId,
          action: "PROFILE_UPDATED",
          entityType: "FARM",
          entityId: farmId,
          metadata: { settings: input },
        },
        req,
      );
    });

    return toSettings(row);
  },

  /**
   * Issues a new join code, invalidating the old one.
   *
   * For when a code has leaked — it is the only thing standing between a stranger and farm access,
   * so rotation needs to be a first-class action rather than a database edit.
   */
  async rotateOwnerCode(auth: AuthContext, req?: Request): Promise<{ ownerCode: string }> {
    const farmId = requireFarmId(auth);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const ownerCode = generateOwnerCode();
      const clash = await prisma.farm.findUnique({ where: { ownerCode }, select: { id: true } });
      if (clash) continue;

      await prisma.$transaction(async (tx) => {
        await tx.farm.update({ where: { id: farmId }, data: { ownerCode } });
        await writeAudit(
          tx,
          {
            actorId: auth.userId,
            farmId,
            action: "OWNER_CODE_ROTATED",
            entityType: "FARM",
            entityId: farmId,
          },
          req,
        );
      });

      return { ownerCode };
    }

    throw ApiError.internal("Could not allocate a unique farm code");
  },

  async listZones(auth: AuthContext): Promise<Zone[]> {
    const farmId = requireFarmId(auth);
    const [zones, latest] = await Promise.all([
      farmRepository.listZones(farmId),
      // Most recent reading per zone, for the moisture shown on the zone list.
      prisma.telemetry.groupBy({
        by: ["zoneId"],
        where: { farmId, zoneId: { not: null } },
        _max: { recordedAt: true },
      }),
    ]);

    const latestByZone = new Map(latest.map((row) => [row.zoneId, row._max.recordedAt]));

    const readings = await Promise.all(
      [...latestByZone.entries()].map(async ([zoneId, recordedAt]) => {
        if (!zoneId || !recordedAt) return null;
        const reading = await prisma.telemetry.findFirst({
          where: { farmId, zoneId, recordedAt },
          select: { zoneId: true, rootMoisture: true },
        });
        return reading;
      }),
    );

    const moistureByZone = new Map(
      readings.filter((r): r is NonNullable<typeof r> => r !== null).map((r) => [r.zoneId, r.rootMoisture]),
    );

    return zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      valveState: zone.valveState as Zone["valveState"],
      sortOrder: zone.sortOrder,
      latestMoisture: moistureByZone.get(zone.id) ?? null,
    }));
  },
};
