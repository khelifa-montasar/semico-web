import type { AuditAction, AuditEntityType, PaginationMeta } from "@semico/shared";
import { ApiError } from "../../lib/ApiError.js";
import { parsePage } from "../../lib/pagination.js";
import { auditRepository } from "./audit.repository.js";
import type { AuthContext } from "../../types/auth.js";

/**
 * Owner-facing read of the security audit.
 *
 * The DTO lives here rather than in `shared/` because nothing on the client consumes it yet; when
 * a security screen is built, it should move into the shared contracts like every other DTO.
 */

export interface AuditEntry {
  id: string;
  createdAt: string;
  action: AuditAction | string;
  entityType: AuditEntityType | string;
  entityId: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  /** Parsed from the stored JSON string; null when the row carried no metadata. */
  metadata: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
}

export interface AuditQuery {
  action?: string | undefined;
  actorId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  page?: unknown;
  pageSize?: unknown;
}

function requireFarmId(auth: AuthContext): string {
  if (!auth.farmId) throw ApiError.forbidden("You are not attached to a farm yet");
  return auth.farmId;
}

function safeParse(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    // A malformed metadata blob must not break the whole audit view.
    return null;
  }
}

export const auditService = {
  async list(
    auth: AuthContext,
    filters: AuditQuery,
  ): Promise<{ entries: AuditEntry[]; meta: PaginationMeta }> {
    const farmId = requireFarmId(auth);
    const window = parsePage(filters);

    const [rows, total] = await auditRepository.list(
      farmId,
      { action: filters.action, actorId: filters.actorId, from: filters.from, to: filters.to },
      window,
    );

    const entries: AuditEntry[] = rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      actorId: row.actorId,
      actorName: row.actor?.fullName ?? null,
      actorRole: row.actor?.role ?? null,
      metadata: safeParse(row.metadata),
      ip: row.ip,
      userAgent: row.userAgent,
    }));

    return {
      entries,
      meta: {
        page: window.page,
        pageSize: window.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / window.pageSize)),
      },
    };
  },
};
