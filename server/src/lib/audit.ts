import type { Prisma } from "@prisma/client";
import type { AuditAction, AuditEntityType } from "@semico/shared";
import type { Request } from "express";

/**
 * Security audit trail.
 *
 * `writeAudit` takes a transaction client rather than using the global `prisma`, and that is the
 * whole point: every call site runs it inside the same `$transaction` as the state change it
 * describes. If the write fails, the change rolls back with it — so the audit trail can never
 * disagree with reality about who granted a permission or opened a valve.
 *
 * This is distinct from `ActivityLog`, which is the bilingual farmer-facing feed. Same events,
 * different audiences: this one carries actor, IP and user agent, and is owner-only.
 */

/** The subset of Prisma's transaction client we need — keeps this callable from services. */
export type TxClient = Prisma.TransactionClient;

export interface AuditInput {
  actorId: string | null;
  farmId?: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  metadata?: Record<string, unknown>;
}

/** Pulls request provenance for the audit row. Safe to call with `undefined` in tests/jobs. */
function requestContext(req?: Request): { ip: string | null; userAgent: string | null } {
  if (!req) return { ip: null, userAgent: null };
  const forwarded = req.headers["x-forwarded-for"];
  const ip =
    (typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : undefined) ??
    req.ip ??
    null;
  const userAgent = req.headers["user-agent"] ?? null;
  return { ip, userAgent };
}

export async function writeAudit(
  tx: TxClient,
  input: AuditInput,
  req?: Request,
): Promise<void> {
  const { ip, userAgent } = requestContext(req);

  await tx.auditLog.create({
    data: {
      actorId: input.actorId,
      farmId: input.farmId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      ip,
      userAgent,
    },
  });
}
