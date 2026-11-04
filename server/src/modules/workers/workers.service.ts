import type { InviteWorkerInput, UpdateWorkerInput, Worker } from "@semico/shared";
import type { Request } from "express";
import { prisma } from "../../db/prisma.js";
import { ApiError } from "../../lib/ApiError.js";
import { writeAudit } from "../../lib/audit.js";
import { initialsFrom } from "../../lib/initials.js";
import { generateTemporaryPassword, hashPassword } from "../../lib/password.js";
import { workersRepository } from "./workers.repository.js";
import type { AuthContext } from "../../types/auth.js";

/**
 * Worker management. Owner-only, enforced by `requireOwner` on the routes.
 *
 * The permission events here are the ones `settings-page-extension.md` explicitly requires be
 * recorded: who granted or revoked valve control, and when. Both the activity feed row and the
 * security audit row are written in the SAME transaction as the permission change, so the trail
 * cannot claim a grant that was rolled back.
 */

function requireFarmId(auth: AuthContext): string {
  if (!auth.farmId) throw ApiError.forbidden("You are not attached to a farm yet");
  return auth.farmId;
}

/** Bilingual feed copy, kept beside the action that produces it. */
const FEED = {
  INVITED: {
    kind: "WORKER_INVITED",
    en: (name: string) => `${name} was invited to the farm.`,
    ar: (name: string) => `تمت دعوة ${name} إلى المزرعة.`,
  },
  REMOVED: {
    kind: "WORKER_REMOVED",
    en: (name: string) => `${name} was removed from the farm.`,
    ar: (name: string) => `تمت إزالة ${name} من المزرعة.`,
  },
  GRANT: {
    kind: "PERMISSION_GRANT",
    en: (name: string) => `Valve control granted to ${name}.`,
    ar: (name: string) => `تم منح التحكم في الصمام لـ ${name}.`,
  },
  REVOKE: {
    kind: "PERMISSION_REVOKE",
    en: (name: string) => `Valve control revoked from ${name}.`,
    ar: (name: string) => `تم سحب التحكم في الصمام من ${name}.`,
  },
} as const;

type WorkerRow = Awaited<ReturnType<typeof workersRepository.list>>[number];

function toWorker(row: WorkerRow): Worker {
  return {
    id: row.id,
    initials: initialsFrom(row.fullName, row.email),
    name: row.fullName,
    email: row.email,
    type: row.workerType as Worker["type"],
    valveControl: row.valveControl,
    status: row.status as Worker["status"],
    createdAt: row.createdAt.toISOString(),
  };
}

export const workersService = {
  async list(auth: AuthContext): Promise<Worker[]> {
    const rows = await workersRepository.list(requireFarmId(auth));
    return rows.map(toWorker);
  },

  /**
   * Invites a worker by creating their account directly.
   *
   * There is no mail delivery in this project, so the generated one-time password is returned to
   * the owner once, to pass on out of band. The worker is created INVITED; the owner can mark them
   * active afterwards. They can sign in immediately with the temporary password.
   */
  async invite(
    auth: AuthContext,
    input: InviteWorkerInput,
    req?: Request,
  ): Promise<{ worker: Worker; temporaryPassword: string }> {
    const farmId = requireFarmId(auth);

    const existing = await workersRepository.findByEmail(input.email);
    if (existing) {
      throw ApiError.conflict("That email address is already registered", "EMAIL_IN_USE");
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    // Valve control is only meaningful for an operator; for an engineer it is always false.
    const valveControl = input.type === "OPERATOR" ? input.grantValve : false;

    const row = await workersRepository.createWorker({
      email: input.email,
      passwordHash,
      fullName: input.name,
      farmId,
      workerType: input.type,
      valveControl,
      status: "INVITED",
    });

    await prisma.$transaction(async (tx) => {
      const copy = FEED.INVITED;
      await tx.activityLog.create({
        data: {
          farmId,
          occurredAt: new Date(),
          kind: copy.kind,
          type: "MANUAL",
          actorId: auth.userId,
          messageEn: copy.en(row.fullName),
          messageAr: copy.ar(row.fullName),
          params: JSON.stringify({ workerId: row.id, workerType: input.type }),
        },
      });

      await writeAudit(
        tx,
        {
          actorId: auth.userId,
          farmId,
          action: "WORKER_INVITED",
          entityType: "USER",
          entityId: row.id,
          metadata: { workerType: input.type, valveControl },
        },
        req,
      );

      // A grant at invite time is still a grant, and the spec wants every one of them recorded.
      if (valveControl) {
        await writeAudit(
          tx,
          {
            actorId: auth.userId,
            farmId,
            action: "PERMISSION_GRANT",
            entityType: "USER",
            entityId: row.id,
            metadata: { atInvite: true },
          },
          req,
        );
      }
    });

    return { worker: toWorker(row), temporaryPassword };
  },

  async update(
    auth: AuthContext,
    workerId: string,
    input: UpdateWorkerInput,
    req?: Request,
  ): Promise<Worker> {
    const farmId = requireFarmId(auth);

    const current = await workersRepository.findInFarm(farmId, workerId);
    if (!current) throw ApiError.notFound("That worker does not exist on this farm");

    if (current.platformDisabled && input.status !== undefined && input.status !== "DISABLED") {
      throw ApiError.conflict("Only a super admin can re-enable a platform-disabled account");
    }

    const data: { fullName?: string; workerType?: string; status?: string } = {};
    if (input.name !== undefined) data.fullName = input.name;
    if (input.type !== undefined) data.workerType = input.type;
    if (input.status !== undefined) data.status = input.status;

    // Downgrading an operator to engineer must drop the capability with it — otherwise a demoted
    // worker keeps a permission their new role explicitly does not have.
    const losingOperatorRole = input.type === "ENGINEER" && current.workerType === "OPERATOR";
    if (losingOperatorRole) data.workerType = "ENGINEER";

    await prisma.$transaction(async (tx) => {
      const result = await tx.user.updateMany({ where: {
        id: workerId, farmId, role: "WORKER",
        ...(input.status !== undefined && input.status !== "DISABLED" ? { platformDisabled: false } : {}),
      }, data });
      if (result.count === 0) throw ApiError.conflict("The worker's account status or farm membership changed; reload before editing");

      if (losingOperatorRole && current.valveControl) {
        await tx.user.update({ where: { id: workerId }, data: { valveControl: false } });

        const copy = FEED.REVOKE;
        await tx.activityLog.create({
          data: {
            farmId,
            occurredAt: new Date(),
            kind: copy.kind,
            type: "MANUAL",
            actorId: auth.userId,
            messageEn: copy.en(current.fullName),
            messageAr: copy.ar(current.fullName),
            params: JSON.stringify({ workerId, reason: "demoted to engineer" }),
          },
        });

        await writeAudit(
          tx,
          {
            actorId: auth.userId,
            farmId,
            action: "PERMISSION_REVOKE",
            entityType: "USER",
            entityId: workerId,
            metadata: { reason: "demoted to engineer" },
          },
          req,
        );
      }
    });

    const updated = await workersRepository.findInFarm(farmId, workerId);
    if (!updated) throw ApiError.notFound("That worker does not exist on this farm");
    return toWorker(updated);
  },

  /**
   * Grants or revokes valve control.
   *
   * The change, the farmer-facing feed entry and the security audit entry all commit together. If
   * the audit write fails, the permission change is rolled back with it — the trail and the
   * permission can never disagree.
   */
  async setValveControl(
    auth: AuthContext,
    workerId: string,
    granted: boolean,
    req?: Request,
  ): Promise<Worker> {
    const farmId = requireFarmId(auth);

    const current = await workersRepository.findInFarm(farmId, workerId);
    if (!current) throw ApiError.notFound("That worker does not exist on this farm");

    // An engineer can never hold valve control; granting it would create a state the guard does
    // not honour, which would look like a bug from the owner's side.
    if (granted && current.workerType !== "OPERATOR") {
      throw ApiError.badRequest("Only operators can be granted valve control", {
        type: ["Change the worker to an operator first"],
      });
    }

    if (current.valveControl === granted) {
      // Idempotent, and deliberately silent: no audit row for a no-op, or the trail fills with
      // events that did not change anything.
      return toWorker(current);
    }

    const copy = granted ? FEED.GRANT : FEED.REVOKE;

    await prisma.$transaction(async (tx) => {
      await tx.user.updateMany({
        where: { id: workerId, farmId, role: "WORKER" },
        data: { valveControl: granted },
      });

      await tx.activityLog.create({
        data: {
          farmId,
          occurredAt: new Date(),
          kind: copy.kind,
          type: "MANUAL",
          actorId: auth.userId,
          messageEn: copy.en(current.fullName),
          messageAr: copy.ar(current.fullName),
          params: JSON.stringify({ workerId, granted }),
        },
      });

      await writeAudit(
        tx,
        {
          actorId: auth.userId,
          farmId,
          action: granted ? "PERMISSION_GRANT" : "PERMISSION_REVOKE",
          entityType: "USER",
          entityId: workerId,
          metadata: { granted, byRole: auth.role },
        },
        req,
      );
    });

    const updated = await workersRepository.findInFarm(farmId, workerId);
    if (!updated) throw ApiError.notFound("That worker does not exist on this farm");
    return toWorker(updated);
  },

  /**
   * Issues a new one-time password and ends the worker's existing sessions.
   *
   * Revoking sessions matters as much as the new password: a reset that left old refresh tokens
   * alive would not actually remove anyone who already had access.
   */
  async resetPassword(
    auth: AuthContext,
    workerId: string,
    req?: Request,
  ): Promise<{ temporaryPassword: string }> {
    const farmId = requireFarmId(auth);

    const current = await workersRepository.findInFarm(farmId, workerId);
    if (!current) throw ApiError.notFound("That worker does not exist on this farm");

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: workerId }, data: { passwordHash } });
      await tx.refreshToken.updateMany({
        where: { userId: workerId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await writeAudit(
        tx,
        {
          actorId: auth.userId,
          farmId,
          action: "PASSWORD_RESET",
          entityType: "USER",
          entityId: workerId,
          metadata: { sessionsRevoked: true },
        },
        req,
      );
    });

    return { temporaryPassword };
  },

  /**
   * Offboards a worker: disables the account and detaches them from the farm.
   *
   * Not a delete — see the note on `workersRepository.detach`. Their historical audit and command
   * rows stay intact and still resolve to a real person.
   */
  async remove(auth: AuthContext, workerId: string, req?: Request): Promise<void> {
    const farmId = requireFarmId(auth);

    const current = await workersRepository.findInFarm(farmId, workerId);
    if (!current) throw ApiError.notFound("That worker does not exist on this farm");

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: workerId },
        data: { farmId: null, status: "DISABLED", valveControl: false },
      });

      await tx.refreshToken.updateMany({
        where: { userId: workerId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      const copy = FEED.REMOVED;
      await tx.activityLog.create({
        data: {
          farmId,
          occurredAt: new Date(),
          kind: copy.kind,
          type: "MANUAL",
          actorId: auth.userId,
          messageEn: copy.en(current.fullName),
          messageAr: copy.ar(current.fullName),
          params: JSON.stringify({ workerId }),
        },
      });

      await writeAudit(
        tx,
        {
          actorId: auth.userId,
          farmId,
          action: "WORKER_REMOVED",
          entityType: "USER",
          entityId: workerId,
          metadata: { hadValveControl: current.valveControl, softDelete: true },
        },
        req,
      );
    });
  },
};
