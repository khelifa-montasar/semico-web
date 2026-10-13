/**
 * Domain enums for Semico.
 *
 * IMPORTANT: Prisma's SQLite connector has no native `enum` support, so every one of these is
 * persisted as a plain `String` column and validated at the edges with the zod schema built
 * from the same tuple. Keeping the tuple as the single source means the DB values, the API
 * validation and the TypeScript union can never drift apart.
 *
 * These are `as const` tuples rather than TS `enum`s on purpose: tuples are tree-shakeable,
 * work with `z.enum(...)` directly, and survive `isolatedModules`/bundler transpilation.
 */

export const ROLES = ["OWNER", "WORKER"] as const;
export const WORKER_TYPES = ["OPERATOR", "OBSERVER"] as const;
export const USER_STATUSES = ["ACTIVE", "INVITED", "DISABLED"] as const;
export const VALVE_STATES = ["OPEN", "CLOSED"] as const;
export const COMPONENT_STATUSES = ["GREEN", "ORANGE", "RED"] as const;
export const ACTIVITY_TYPES = ["AUTO", "MANUAL"] as const;
export const IRRIGATION_ACTIONS = ["OPEN", "CLOSE"] as const;
export const COMMAND_STATUSES = ["PENDING", "EXECUTED", "FAILED", "CANCELLED"] as const;
export const BOOKING_STATUSES = ["PENDING", "CONFIRMED", "CANCELLED"] as const;

/**
 * What an activity feed row represents. Drives the icon/copy the client renders, and is what
 * lets the server emit a bilingual message without hardcoding prose in two columns for every
 * possible event.
 */
export const ACTIVITY_KINDS = [
  "VALVE_OPEN",
  "VALVE_CLOSE",
  "SCHEDULED_IRRIGATION",
  "THRESHOLD_REACHED",
  "MANUAL_OVERRIDE",
  "SYSTEM_CHECK",
  "PERMISSION_GRANT",
  "PERMISSION_REVOKE",
  "WORKER_INVITED",
  "WORKER_REMOVED",
] as const;

/** Security-audit actions. A superset of ACTIVITY_KINDS plus account-level events. */
export const AUDIT_ACTIONS = [
  ...ACTIVITY_KINDS,
  "LOGIN",
  "LOGOUT",
  "REGISTER",
  "REFRESH_REUSE_DETECTED",
  "OWNER_CODE_ROTATED",
  "PROFILE_UPDATED",
  "PASSWORD_RESET",
] as const;

export const AUDIT_ENTITY_TYPES = ["USER", "ZONE", "FARM", "SESSION"] as const;

/** Blog categories, kept as keys so both locales come from one row. */
export const BLOG_CATEGORIES = ["TECHNOLOGY", "GUIDES"] as const;

export const LOCALES = ["en", "ar"] as const;

export type Role = (typeof ROLES)[number];
export type WorkerType = (typeof WORKER_TYPES)[number];
export type UserStatus = (typeof USER_STATUSES)[number];
export type ValveState = (typeof VALVE_STATES)[number];
export type ComponentStatus = (typeof COMPONENT_STATUSES)[number];
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export type IrrigationAction = (typeof IRRIGATION_ACTIONS)[number];
export type CommandStatus = (typeof COMMAND_STATUSES)[number];
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];
export type BlogCategory = (typeof BLOG_CATEGORIES)[number];
export type Locale = (typeof LOCALES)[number];

/** The single timezone this product operates in — booking slots and analytics bucket by it. */
export const FARM_TIMEZONE = "Africa/Algiers" as const;

/**
 * A pair of translations for one field. Content rows store `*En`/`*Ar` columns; the API returns
 * both, and the client resolves with `pickLocalized` so switching language never refetches.
 */
export interface Localized {
  en: string;
  ar: string;
}
