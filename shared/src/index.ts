/**
 * @semico/shared — the single source of truth for the Semico domain.
 *
 * Both sides depend on this workspace:
 *   • `server/` imports the zod schemas for runtime request validation and derives its DTO types.
 *   • `client/` imports the inferred types (erased at build) and reuses the schemas for form
 *     validation.
 *
 * Because the schemas *are* the types, a validation rule and its TypeScript shape cannot drift.
 * The client must never import from `server/` — this package is the only shared surface.
 */

export * from "./enums.js";
export * from "./api.js";

export * from "./domain/auth.js";
export * from "./domain/admin.js";
export * from "./domain/cms.js";
export * from "./domain/user.js";
export * from "./domain/farm.js";
export * from "./domain/telemetry.js";
export * from "./domain/realtime.js";
export * from "./domain/activity.js";
export * from "./domain/irrigation.js";
export * from "./domain/valveMqtt.js";
export * from "./domain/analytics.js";
export * from "./domain/booking.js";
export * from "./domain/lead.js";
export * from "./domain/content.js";
