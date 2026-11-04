import { prisma } from "../../db/prisma.js";
import { generateOwnerCode } from "../../lib/initials.js";
import { env } from "../../config/env.js";
import { DEFAULT_SENSORS_PER_ZONE, DEFAULT_ZONE_COUNT, type WorkerType } from "@semico/shared";
import { userMappingSelect } from "./auth.mapper.js";

/**
 * Data access for authentication.
 *
 * This is the only layer that touches Prisma for auth. Services above it deal in domain terms
 * (`account`, `session`) and never see a query builder.
 */

export const authRepository = {
  /** Login needs the hash, which every other read deliberately excludes. */
  findByEmailWithSecret(email: string) {
    return prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true, status: true, platformDisabled: true, role: true },
    });
  },

  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email }, select: userMappingSelect });
  },

  findById(id: string) {
    return prisma.user.findUnique({ where: { id }, select: userMappingSelect });
  },

  findFarmByOwnerCode(ownerCode: string) {
    return prisma.farm.findUnique({
      where: { ownerCode },
      select: { id: true, name: true, ownerId: true, status: true },
    });
  },

  /**
   * Creates an owner together with everything that must exist for the dashboard to render:
   * the farm, its settings row, a device-status row and a few zones.
   *
   * One transaction, because a farm without settings or zones is a half-built account that the
   * dashboard would choke on.
   */
  async createOwnerWithFarm(input: {
    email: string;
    passwordHash: string;
    fullName: string;
    farmName: string;
    wilayaId?: string | undefined;
    commune?: string | undefined;
  }) {
    // Retry on the (astronomically unlikely) ownerCode collision rather than failing the signup.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const ownerCode = generateOwnerCode();
      const clash = await prisma.farm.findUnique({
        where: { ownerCode },
        select: { id: true },
      });
      if (clash) continue;

      return prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: input.email,
            passwordHash: input.passwordHash,
            fullName: input.fullName,
            role: "OWNER",
            status: "ACTIVE",
            wilayaId: input.wilayaId ?? null,
            commune: input.commune ?? null,
          },
        });

        const farm = await tx.farm.create({
          data: {
            name: input.farmName,
            ownerCode,
            ownerId: user.id,
            wilayaId: input.wilayaId ?? null,
            commune: input.commune ?? null,
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

        return { userId: user.id, farmId: farm.id, ownerCode };
      });
    }

    throw new Error("Could not allocate a unique farm owner code");
  },

  /** Attaches a self-registering worker to an existing farm. */
  createWorker(input: {
    email: string;
    passwordHash: string;
    fullName: string;
    farmId: string;
    workerType: WorkerType;
  }) {
    return prisma.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        fullName: input.fullName,
        role: "WORKER",
        // Signing up with a valid owner code is proof enough of membership.
        status: "ACTIVE",
        workerType: input.workerType,
        // Never granted at signup — an owner has to hand this over explicitly.
        valveControl: false,
        farmId: input.farmId,
      },
      select: userMappingSelect,
    });
  },

  // ── refresh tokens ──────────────────────────────────────────────────────────

  createRefreshToken(input: {
    userId: string;
    tokenHash: string;
    familyId: string;
  }) {
    return prisma.refreshToken.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        familyId: input.familyId,
        expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_SECONDS * 1000),
      },
      select: { id: true, familyId: true, expiresAt: true },
    });
  },

  findRefreshTokenByHash(tokenHash: string) {
    return prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        familyId: true,
        expiresAt: true,
        revokedAt: true,
        user: { select: { id: true, status: true, platformDisabled: true } },
      },
    });
  },

  revokeRefreshToken(id: string) {
    return prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  },

  /** Used when a revoked token is presented: assume the family leaked and kill all of it. */
  revokeFamily(familyId: string) {
    return prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  revokeAllForUser(userId: string) {
    return prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },
};
