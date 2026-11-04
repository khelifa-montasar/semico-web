import type { Request } from "express";
import type {
  AdminFarm,
  AdminUser,
  PaginationQuery,
  SetFarmStatusInput,
  SetUserStatusInput,
} from "@semico/shared";
import { prisma } from "../../db/prisma.js";
import { ApiError } from "../../lib/ApiError.js";
import { writeAudit } from "../../lib/audit.js";
import { realtimeRepository } from "../realtime/realtime.repository.js";
import {
  adminFarmSelect,
  adminUserSelect,
  oversightRepository,
  type AdminFarmRow,
  type AdminUserRow,
} from "./oversight.repository.js";

function toAdminFarm(row: AdminFarmRow): AdminFarm {
  return {
    id: row.id,
    name: row.name,
    status: row.status as AdminFarm["status"],
    createdAt: row.createdAt.toISOString(),
    owner: row.owner,
    workerCount: row._count.workers,
  };
}

function toAdminUser(row: AdminUserRow): AdminUser {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    role: row.role as AdminUser["role"],
    workerType: row.workerType as AdminUser["workerType"],
    status: row.platformDisabled
      ? "DISABLED"
      : (row.status as AdminUser["status"]),
    platformDisabled: row.platformDisabled,
    createdAt: row.createdAt.toISOString(),
    farm: row.farm,
    ownedFarms: row.ownedFarms,
  };
}

export const oversightService = {
  async farms(query: PaginationQuery) {
    const [rows, total] = await oversightRepository.farms(query);
    return { data: rows.map(toAdminFarm), total };
  },
  async users(query: PaginationQuery) {
    const [rows, total] = await oversightRepository.users(query);
    return { data: rows.map(toAdminUser), total };
  },
  async setFarmStatus(
    actorId: string,
    id: string,
    input: SetFarmStatusInput,
    req?: Request,
  ) {
    const farm = await prisma.$transaction(async (transaction) => {
      const previous = await transaction.farm.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!previous) throw ApiError.notFound("That farm does not exist");
      const updated = await transaction.farm.update({
        where: { id },
        data: input,
        select: adminFarmSelect,
      });
      if (previous.status !== input.status)
        await writeAudit(
          transaction,
          {
            actorId,
            farmId: id,
            action: "ADMIN_FARM_STATUS_CHANGED",
            entityType: "FARM",
            entityId: id,
            metadata: { previousStatus: previous.status, status: input.status },
          },
          req,
        );
      return toAdminFarm(updated);
    });
    if (farm.status === "SUSPENDED")
      realtimeRepository.revokeAccess({ farmId: id });
    return farm;
  },
  async setUserStatus(
    actorId: string,
    id: string,
    input: SetUserStatusInput,
    req?: Request,
  ) {
    if (actorId === id && input.status === "DISABLED")
      throw ApiError.conflict(
        "You cannot disable your own administrator account",
      );
    const user = await prisma.$transaction(async (transaction) => {
      const previous = await transaction.user.findUnique({
        where: { id },
        select: adminUserSelect,
      });
      if (!previous) throw ApiError.notFound("That account does not exist");
      const platformDisabled = input.status === "DISABLED";
      if (
        platformDisabled &&
        previous.role === "SUPER_ADMIN" &&
        previous.status === "ACTIVE" &&
        !previous.platformDisabled
      ) {
        const activeAdmins = await transaction.user.count({
          where: {
            role: "SUPER_ADMIN",
            status: "ACTIVE",
            platformDisabled: false,
          },
        });
        if (activeAdmins <= 1)
          throw ApiError.conflict(
            "At least one active super admin must remain",
          );
      }
      const updated = await transaction.user.update({
        where: { id },
        data: { status: input.status, platformDisabled },
        select: adminUserSelect,
      });
      if (platformDisabled)
        await transaction.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      if (
        previous.status !== input.status ||
        previous.platformDisabled !== platformDisabled
      )
        await writeAudit(
          transaction,
          {
            actorId,
            action: "ADMIN_USER_STATUS_CHANGED",
            entityType: "USER",
            entityId: id,
            metadata: {
              previousStatus: previous.status,
              status: input.status,
              platformDisabled,
              sessionsRevoked: platformDisabled,
            },
          },
          req,
        );
      return toAdminUser(updated);
    });
    if (user.platformDisabled) realtimeRepository.revokeAccess({ userId: id });
    return user;
  },
};
