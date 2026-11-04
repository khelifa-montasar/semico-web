import type {
  Farm,
  FarmSettings,
  UpdateFarmInput,
  FarmSettingsInput,
  Zone,
  CreateFarmInput,
  FarmSummary,
  FarmBoundaryInput,
  ZoneInput,
  UpdateZoneInput,
} from "@semico/shared";
import { ERROR_CODES, MAX_FARMS_PER_OWNER } from "@semico/shared";
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
 * Reads are available to any active member (engineers included). Writes are owner-only and are
 * enforced by `requireOwner` on the routes, then re-asserted here for the code paths that are
 * reachable from more than one place.
 */

function requireFarmId(auth: AuthContext): string {
  if (!auth.farmId) throw ApiError.forbidden("You are not attached to a farm yet");
  return auth.farmId;
}

type FarmRow = NonNullable<Awaited<ReturnType<typeof farmRepository.findById>>>;

/**
 * Reads the stored outline, refusing anything that is not a usable polygon.
 *
 * A malformed value must not take the whole page down: the maps fall back to the generated grid, so
 * an unparseable outline degrades to "not drawn" rather than to a 500.
 */
function parseBoundary(raw: string | null): Array<[number, number]> | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;

    const points = parsed.filter(
      (point): point is [number, number] =>
        Array.isArray(point) &&
        point.length === 2 &&
        typeof point[0] === "number" &&
        typeof point[1] === "number" &&
        Number.isFinite(point[0]) &&
        Number.isFinite(point[1]),
    );

    return points.length >= 3 ? points : null;
  } catch {
    return null;
  }
}

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
    latitude: row.latitude,
    longitude: row.longitude,
    boundary: parseBoundary(row.boundaryJson),
    createdAt: row.createdAt.toISOString(),
  };
}

function toSettings(row: NonNullable<Awaited<ReturnType<typeof farmRepository.findSettings>>>): FarmSettings {
  return {
    moistureThreshold: row.moistureThreshold,
    autoIrrigation: row.autoIrrigation,
    pushNotifications: row.pushNotifications,
    timezone: row.timezone,
    zoneCount: row.zoneCount,
    sensorsPerZone: row.sensorsPerZone,
  };
}

export const farmService = {
  async get(auth: AuthContext): Promise<Farm> {
    const row = await farmRepository.findById(requireFarmId(auth));
    if (!row) throw ApiError.notFound("Farm not found");
    return toFarm(row, auth);
  },

  /**
   * Every farm the caller owns, oldest first.
   *
   * Owner-only: a worker is attached to exactly one farm and holds none, so this is "the farms I
   * hold", not "the farms I can see".
   */
  async listMine(auth: AuthContext): Promise<FarmSummary[]> {
    if (auth.role !== "OWNER") throw ApiError.forbidden("Only a farm owner can list farms");

    const rows = await farmRepository.listByOwner(auth.userId);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      wilayaId: row.wilayaId,
      commune: row.commune,
      landAreaHa: row.landAreaHa,
      createdAt: row.createdAt.toISOString(),
    }));
  },

  /**
   * Adds a farm to the owner's account, up to MAX_FARMS_PER_OWNER.
   *
   * The limit check and the insert share one transaction. Checking outside it would let two
   * concurrent requests both observe two farms and both create a third.
   */
  async create(auth: AuthContext, input: CreateFarmInput, req?: Request): Promise<Farm> {
    if (auth.role !== "OWNER") throw ApiError.forbidden("Only a farm owner can create farms");

    const created = await prisma.$transaction(async (tx) => {
      const owned = await tx.farm.count({ where: { ownerId: auth.userId } });
      if (owned >= MAX_FARMS_PER_OWNER) {
        throw new ApiError(
          409,
          ERROR_CODES.FARM_LIMIT_REACHED,
          `An owner may hold at most ${MAX_FARMS_PER_OWNER} farms`,
        );
      }

      const farm = await farmRepository.createWithDefaults(
        {
          name: input.name,
          ownerId: auth.userId,
          // `""` from the form means "not set" for both of these.
          wilayaId: input.wilayaId || null,
          commune: input.commune || null,
          landAreaHa: input.landAreaHa ?? null,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
        },
        tx,
      );

      // Same transaction as the insert, as everywhere else: a farm that exists without a matching
      // audit row is exactly the case the trail is meant to rule out.
      await writeAudit(
        tx,
        {
          actorId: auth.userId,
          farmId: farm.id,
          action: "FARM_CREATED",
          entityType: "FARM",
          entityId: farm.id,
          metadata: { name: farm.name },
        },
        req,
      );

      return farm;
    });

    const row = await farmRepository.findById(created.id);
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
      ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
      ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
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

  /**
   * Saves the outline the owner drew on the map.
   *
   * Owner-only at the route, and re-asserted here because the farm is addressed as `me`: the shape
   * belongs to the active farm, so "which farm" is settled by `requireAuth`, not by the payload.
   */
  async updateBoundary(
    auth: AuthContext,
    input: FarmBoundaryInput,
    req?: Request,
  ): Promise<Farm> {
    if (auth.role !== "OWNER") throw ApiError.forbidden("Only a farm owner can set its shape");
    const farmId = requireFarmId(auth);

    const updated = await farmRepository.update(farmId, {
      boundaryJson: JSON.stringify(input.boundary),
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
          metadata: { fields: ["boundary"], points: input.boundary.length },
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

  async createZone(auth: AuthContext, input: ZoneInput, req?: Request): Promise<Zone> {
    if (auth.role !== "OWNER") throw ApiError.forbidden("Only a farm owner can configure zones");
    const farmId = requireFarmId(auth);

    const zone = await prisma.$transaction(async (tx) => {
      const created = await farmRepository.createZone(farmId, input, tx);
      await writeAudit(
        tx,
        {
          actorId: auth.userId,
          farmId,
          action: "PROFILE_UPDATED",
          entityType: "ZONE",
          entityId: created.id,
          metadata: { operation: "created", name: created.name, sortOrder: created.sortOrder },
        },
        req,
      );
      return created;
    });

    return {
      id: zone.id,
      name: zone.name,
      valveState: zone.valveState as Zone["valveState"],
      sortOrder: zone.sortOrder,
      latestMoisture: null,
    };
  },

  async updateZone(
    auth: AuthContext,
    zoneId: string,
    input: UpdateZoneInput,
    req?: Request,
  ): Promise<Zone> {
    if (auth.role !== "OWNER") throw ApiError.forbidden("Only a farm owner can configure zones");
    const farmId = requireFarmId(auth);

    const zone = await prisma.$transaction(async (tx) => {
      const result = await farmRepository.updateZone(farmId, zoneId, input, tx);
      if (result.count === 0) throw ApiError.notFound("That zone does not exist");
      const updated = await farmRepository.findZone(farmId, zoneId, tx);
      if (!updated) throw ApiError.notFound("That zone does not exist");

      await writeAudit(
        tx,
        {
          actorId: auth.userId,
          farmId,
          action: "PROFILE_UPDATED",
          entityType: "ZONE",
          entityId: updated.id,
          metadata: { operation: "updated", fields: Object.keys(input) },
        },
        req,
      );
      return updated;
    });

    return {
      id: zone.id,
      name: zone.name,
      valveState: zone.valveState as Zone["valveState"],
      sortOrder: zone.sortOrder,
      latestMoisture: null,
    };
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
