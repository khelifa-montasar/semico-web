import { z } from "zod";
import type { ActivityKind, ActivityType, Localized } from "../enums.js";

/**
 * Activity feed + calendar contracts.
 *
 * Two audiences read these rows. The feed is what a farmer sees on the Activity page (bilingual,
 * friendly, farm-scoped). The security audit (`AuditLog`, server-only) records the same events
 * with actor/ip/user-agent for an owner. Both are written inside the same transaction as the
 * state change, so they can never disagree.
 */

export const activityQuerySchema = z.object({
  type: z.enum(["AUTO", "MANUAL"]).optional(),
  kind: z.string().trim().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  zoneId: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const calendarQuerySchema = z.object({
  /** `YYYY-MM` in the farm timezone. Defaults to the current month. */
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Month must look like 2026-04")
    .optional(),
});

export type ActivityQuery = z.infer<typeof activityQuerySchema>;
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;

export interface ActivityLogEntry {
  id: string;
  occurredAt: string;
  kind: ActivityKind;
  type: ActivityType;
  zoneId: string | null;
  zoneName: string | null;
  actorId: string | null;
  actorName: string | null;
  /**
   * System-generated copy in both languages. `kind` plus `params` is the structured alternative
   * if the client would rather render its own i18n string.
   */
  message: Localized;
  params: Record<string, string | number> | null;
  /** Manual overrides carry a geotag; the UI shows it in a tooltip. */
  lat: number | null;
  lng: number | null;
}

/** `days` is the list of day-of-month numbers that had irrigation — drives the calendar dots. */
export interface ActivityCalendar {
  month: string;
  daysInMonth: number;
  irrigationDays: number[];
  irrigationCount: number;
}
