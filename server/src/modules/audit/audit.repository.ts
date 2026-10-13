import { prisma } from "../../db/prisma.js";

/**
 * The security audit trail.
 *
 * Distinct from `ActivityLog`: this carries the actor, IP and user agent, is never bilingual, and
 * is readable only by the farm owner. Rows are append-only — nothing in the codebase updates or
 * deletes them.
 */
export const auditRepository = {
  list(
    farmId: string,
    filters: { action?: string | undefined; actorId?: string | undefined; from?: Date | undefined; to?: Date | undefined },
    window: { skip: number; take: number },
  ) {
    const where = {
      farmId,
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.actorId ? { actorId: filters.actorId } : {}),
      ...(filters.from || filters.to
        ? {
            createdAt: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
    };

    return prisma.$transaction([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: window.skip,
        take: window.take,
        include: { actor: { select: { id: true, fullName: true, role: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);
  },
};
