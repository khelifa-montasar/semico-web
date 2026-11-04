import { prisma } from "../../db/prisma.js";
import type { Prisma } from "@prisma/client";

/**
 * Irrigation commands and zone valve state.
 *
 * Every write here happens inside a caller-supplied transaction, because a valve action must
 * atomically do four things: record the command, move the valve, write the farmer-facing feed row
 * and write the security audit row. A partial write would leave the audit trail lying about what
 * happened to a physical valve.
 */
export const irrigationRepository = {
  findZone(farmId: string, zoneId: string) {
    return prisma.zone.findFirst({ where: { id: zoneId, farmId } });
  },

  /** First zone by sort order — the fallback when a request omits `zoneId`. */
  findDefaultZone(farmId: string) {
    return prisma.zone.findFirst({ where: { farmId }, orderBy: { sortOrder: "asc" } });
  },

  listZones(farmId: string) {
    return prisma.zone.findMany({ where: { farmId }, orderBy: { sortOrder: "asc" } });
  },

  createCommand(
    tx: Prisma.TransactionClient,
    data: {
      farmId: string;
      zoneId: string;
      issuedById: string;
      action: string;
      durationMin: number | null;
      status: string;
      executedAt: Date | null;
    },
  ) {
    return tx.irrigationCommand.create({ data });
  },

  setValveState(tx: Prisma.TransactionClient, zoneId: string, valveState: string) {
    return tx.zone.update({ where: { id: zoneId }, data: { valveState } });
  },

  findCommand(commandId: string) {
    return prisma.irrigationCommand.findUnique({ where: { id: commandId } });
  },

  async markCommandReceived(commandId: string, farmId: string, zoneId: string, receivedAt: Date): Promise<boolean> {
    const result = await prisma.irrigationCommand.updateMany({
      where: { id: commandId, farmId, zoneId, status: "PENDING", acknowledgedAt: null },
      data: { acknowledgedAt: receivedAt },
    });
    return result.count === 1;
  },

  async completeCommand(input: {
    commandId: string;
    farmId: string;
    zoneId: string;
    action: string;
    status: "EXECUTED" | "FAILED";
    executedAt?: Date;
    valveState?: string;
  }): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const command = await tx.irrigationCommand.findFirst({
        where: {
          id: input.commandId,
          farmId: input.farmId,
          zoneId: input.zoneId,
          status: "PENDING",
        },
        select: { id: true, action: true },
      });
      if (!command || command.action !== input.action) return false;

      const updated = await tx.irrigationCommand.updateMany({
        where: { id: command.id, status: "PENDING" },
        data: { status: input.status, executedAt: input.executedAt ?? null },
      });
      if (updated.count !== 1) return false;
      if (input.status === "EXECUTED" && input.valveState) {
        await tx.zone.update({ where: { id: input.zoneId }, data: { valveState: input.valveState } });
      }
      return true;
    });
  },

  async failUnacknowledgedCommand(commandId: string): Promise<boolean> {
    const result = await prisma.irrigationCommand.updateMany({
      where: { id: commandId, status: "PENDING", acknowledgedAt: null },
      data: { status: "FAILED" },
    });
    return result.count === 1;
  },

  async listCommands(
    farmId: string,
    filters: { status?: string | undefined; zoneId?: string | undefined },
    window: { skip: number; take: number },
  ) {
    const where = {
      farmId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.zoneId ? { zoneId: filters.zoneId } : {}),
    };

    const [rows, total] = await prisma.$transaction([
      prisma.irrigationCommand.findMany({
        where,
        orderBy: { requestedAt: "desc" },
        skip: window.skip,
        take: window.take,
        include: {
          zone: { select: { id: true, name: true } },
          issuedBy: { select: { id: true, fullName: true } },
        },
      }),
      prisma.irrigationCommand.count({ where }),
    ]);

    return { rows, total };
  },
};
