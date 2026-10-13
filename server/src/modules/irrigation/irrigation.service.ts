import type {
  CommandStatus,
  IrrigationAction,
  IrrigationCommand,
  IrrigateInput,
  ValveCommandInput,
  PaginationMeta,
} from "@semico/shared";
import type { Request } from "express";
import { prisma } from "../../db/prisma.js";
import { ApiError } from "../../lib/ApiError.js";
import { writeAudit } from "../../lib/audit.js";
import { parsePage } from "../../lib/pagination.js";
import { irrigationRepository } from "./irrigation.repository.js";
import type { AuthContext } from "../../types/auth.js";

/**
 * Valve control.
 *
 * This is where the audit rule earns its keep. A valve is a physical thing; the record of who
 * opened it and why must not be able to disagree with reality. So the command row, the zone's
 * valve state, the farmer-facing feed entry and the security audit entry are written in ONE
 * transaction — if any part fails, none of it happened.
 *
 * Capability is enforced by `requireValveControl` on the route, and re-checked here so the service
 * is safe to call from anywhere (a scheduled job, a test, a future device gateway).
 */

function requireFarmId(auth: AuthContext): string {
  if (!auth.farmId) throw ApiError.forbidden("You are not attached to a farm yet");
  return auth.farmId;
}

/** Bilingual feed copy, kept next to the action that produces it. */
const FEED_COPY = {
  OPEN: {
    kind: "VALVE_OPEN",
    en: (zone: string, minutes: number) => `Valve opened for ${zone} — ${minutes} min.`,
    ar: (zone: string, minutes: number) => `تم فتح الصمام لـ ${zone} — ${minutes} دقيقة.`,
  },
  CLOSE: {
    kind: "VALVE_CLOSE",
    en: (zone: string) => `Valve closed for ${zone}.`,
    ar: (zone: string) => `تم إغلاق الصمام لـ ${zone}.`,
  },
} as const;

type CommandRow = Awaited<ReturnType<typeof irrigationRepository.listCommands>>["rows"][number];

function toCommand(row: CommandRow): IrrigationCommand {
  return {
    id: row.id,
    zoneId: row.zoneId,
    zoneName: row.zone.name,
    issuedById: row.issuedById,
    issuedByName: row.issuedBy.fullName,
    action: row.action as IrrigationAction,
    durationMin: row.durationMin,
    status: row.status as CommandStatus,
    requestedAt: row.requestedAt.toISOString(),
    executedAt: row.executedAt?.toISOString() ?? null,
  };
}

export const irrigationService = {
  /**
   * Opens a valve for a duration, or closes it.
   *
   * `durationMin` is null for a close. The device layer is not implemented, so the command is
   * marked EXECUTED immediately — when a real gateway exists, it becomes PENDING and the device
   * confirms asynchronously. The shape of the record does not change.
   */
  async issue(
    auth: AuthContext,
    input: { action: IrrigationAction; durationMin?: number | undefined; zoneId?: string | undefined },
    req?: Request,
  ): Promise<IrrigationCommand> {
    const farmId = requireFarmId(auth);

    const zone = input.zoneId
      ? await irrigationRepository.findZone(farmId, input.zoneId)
      : await irrigationRepository.findDefaultZone(farmId);

    // 404 rather than 403 for another farm's zone: a 403 would confirm the id exists.
    if (!zone) throw ApiError.notFound("That zone does not exist");

    const opening = input.action === "OPEN";
    const durationMin = opening ? (input.durationMin ?? 10) : null;
    const now = new Date();

    if (opening && (durationMin === null || durationMin < 1 || durationMin > 120)) {
      throw ApiError.badRequest("Duration must be between 1 and 120 minutes", {
        durationMin: ["Must be between 1 and 120"],
      });
    }

    const copy = opening
      ? { kind: FEED_COPY.OPEN.kind, en: FEED_COPY.OPEN.en(zone.name, durationMin as number), ar: FEED_COPY.OPEN.ar(zone.name, durationMin as number) }
      : { kind: FEED_COPY.CLOSE.kind, en: FEED_COPY.CLOSE.en(zone.name), ar: FEED_COPY.CLOSE.ar(zone.name) };

    const commandId = await prisma.$transaction(async (tx) => {
      const command = await irrigationRepository.createCommand(tx, {
        farmId,
        zoneId: zone.id,
        issuedById: auth.userId,
        action: input.action,
        durationMin,
        status: "EXECUTED",
        executedAt: now,
      });

      await irrigationRepository.setValveState(tx, zone.id, opening ? "OPEN" : "CLOSED");

      // The farmer's feed.
      await tx.activityLog.create({
        data: {
          farmId,
          occurredAt: now,
          kind: copy.kind,
          // A human pressed a button, so this is always MANUAL — the automatic path is the
          // scheduler, which writes its own rows.
          type: "MANUAL",
          zoneId: zone.id,
          actorId: auth.userId,
          messageEn: copy.en,
          messageAr: copy.ar,
          params: JSON.stringify({ durationMin, commandId: command.id }),
        },
      });

      // The security audit, in the same transaction.
      await writeAudit(
        tx,
        {
          actorId: auth.userId,
          farmId,
          action: opening ? "VALVE_OPEN" : "VALVE_CLOSE",
          entityType: "ZONE",
          entityId: zone.id,
          metadata: {
            commandId: command.id,
            durationMin,
            actorRole: auth.role,
            actorWorkerType: auth.workerType,
          },
        },
        req,
      );

      return command.id;
    });

    const { rows } = await irrigationRepository.listCommands(
      farmId,
      { zoneId: zone.id },
      { skip: 0, take: 1 },
    );
    const created = rows.find((row) => row.id === commandId);
    if (!created) throw ApiError.internal("Command was written but could not be read back");

    return toCommand(created);
  },

  /** "Irrigate now" on the dashboard — always an OPEN with a duration. */
  irrigate(auth: AuthContext, input: IrrigateInput, req?: Request): Promise<IrrigationCommand> {
    return this.issue(auth, { action: "OPEN", durationMin: input.durationMin, zoneId: input.zoneId }, req);
  },

  /** Open/Close Valve in Settings. */
  valve(auth: AuthContext, input: ValveCommandInput, req?: Request): Promise<IrrigationCommand> {
    return this.issue(auth, { action: input.action, zoneId: input.zoneId }, req);
  },

  async history(
    auth: AuthContext,
    filters: { status?: string | undefined; zoneId?: string | undefined },
    page: { page?: unknown; pageSize?: unknown },
  ): Promise<{ commands: IrrigationCommand[]; meta: PaginationMeta }> {
    const farmId = requireFarmId(auth);
    const window = parsePage(page);

    const { rows, total } = await irrigationRepository.listCommands(farmId, filters, window);

    return {
      commands: rows.map(toCommand),
      meta: {
        page: window.page,
        pageSize: window.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / window.pageSize)),
      },
    };
  },
};
