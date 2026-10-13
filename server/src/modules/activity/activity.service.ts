import type {
  ActivityCalendar,
  ActivityKind,
  ActivityLogEntry,
  ActivityQuery,
  ActivityType,
} from "@semico/shared";
import { ApiError } from "../../lib/ApiError.js";
import { loc } from "../../lib/localized.js";
import { parsePage } from "../../lib/pagination.js";
import { endOfFarmMonth, farmDayKey, startOfFarmMonth } from "../../lib/time.js";
import { activityRepository } from "./activity.repository.js";
import type { AuthContext } from "../../types/auth.js";
import type { PaginationMeta } from "@semico/shared";

/**
 * The farmer-facing activity feed.
 *
 * Distinct from the security audit: this is bilingual, farm-scoped and readable by every member
 * including observers. The audit trail (actor + ip + user agent) is owner-only and lives in the
 * audit module.
 */

function requireFarmId(auth: AuthContext): string {
  if (!auth.farmId) throw ApiError.forbidden("You are not attached to a farm yet");
  return auth.farmId;
}

type ActivityRow = Awaited<ReturnType<typeof activityRepository.list>>["rows"][number];

export const activityService = {
  async feed(
    auth: AuthContext,
    query: ActivityQuery,
  ): Promise<{ entries: ActivityLogEntry[]; meta: PaginationMeta }> {
    const farmId = requireFarmId(auth);
    const window = parsePage(query);

    const { rows, total } = await activityRepository.list(farmId, query, window);
    const actors = await activityRepository.actorsFor(rows.map((row) => row.actorId));

    const entries = rows.map((row) => toEntry(row, actors));

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

  /**
   * Which days of a month had irrigation — the dots on the calendar grid.
   *
   * Computed in farm-local time so the dots line up with the dates the calendar prints.
   */
  async calendar(auth: AuthContext, month?: string): Promise<ActivityCalendar> {
    const farmId = requireFarmId(auth);
    const anchor = month ? new Date(`${month}-01T00:00:00Z`) : new Date();

    if (Number.isNaN(anchor.getTime())) {
      throw ApiError.badRequest("Month must look like 2026-04", {
        month: ["Expected YYYY-MM"],
      });
    }

    const window = { from: startOfFarmMonth(anchor), to: endOfFarmMonth(anchor) };
    const rows = await activityRepository.irrigationDays(farmId, window);

    // `farmDayKey` gives YYYY-MM-DD in the farm zone; the day number is its last segment.
    const days = new Set(
      rows.map((row) => Number(farmDayKey(row.occurredAt).slice(8, 10))).filter(Number.isFinite),
    );

    const monthKey = farmDayKey(anchor).slice(0, 7);

    return {
      month: monthKey,
      daysInMonth: new Date(
        Date.UTC(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0),
      ).getUTCDate(),
      irrigationDays: [...days].sort((a, b) => a - b),
      irrigationCount: rows.length,
    };
  },
};

function toEntry(row: ActivityRow, actors: Map<string, string>): ActivityLogEntry {
  return {
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    kind: row.kind as ActivityKind,
    type: row.type as ActivityType,
    zoneId: row.zoneId,
    zoneName: row.zone?.name ?? null,
    actorId: row.actorId,
    actorName: row.actorId ? (actors.get(row.actorId) ?? null) : null,
    message: loc(row.messageEn, row.messageAr),
    params: safeParseParams(row.params),
    lat: row.lat,
    lng: row.lng,
  };
}

/** `params` is a JSON-encoded string; a malformed one must not take down the whole feed. */
function safeParseParams(raw: string | null): Record<string, string | number> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string | number>;
    }
    return null;
  } catch {
    return null;
  }
}
