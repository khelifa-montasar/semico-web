import { z } from "zod";
import { USER_STATUSES, WORKER_TYPES } from "../enums.js";

/**
 * Farm, zone and worker contracts.
 *
 * Note the distinction the UI blurs: `role` is OWNER or WORKER, while `type` here is the
 * *capability* modifier (OPERATOR can be granted valve control; ENGINEER can export data and read
 * technical diagnostics but never operates a valve). Only
 * role gates worker management; `valveControl` is what gates the valves.
 */

const latitudeSchema = z.number().min(-90, "Latitude out of range").max(90, "Latitude out of range");
const longitudeSchema = z.number().min(-180, "Longitude out of range").max(180, "Longitude out of range");

function requireCoordinatePair(
  value: { latitude?: number | null; longitude?: number | null },
  ctx: z.RefinementCtx,
) {
  if ((value.latitude === undefined) !== (value.longitude === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Latitude and longitude must be provided together" });
  }
}

function isIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const DEFAULT_ZONE_COUNT = 3;
export const DEFAULT_SENSORS_PER_ZONE = 2;
export const MAX_ZONE_COUNT = 24;
export const MAX_SENSORS_PER_ZONE = 16;

export const farmSettingsSchema = z.object({
  /** Matches the Settings slider range exactly. */
  moistureThreshold: z.coerce.number().int().min(10).max(80),
  autoIrrigation: z.boolean(),
  pushNotifications: z.boolean(),
  timezone: z.string().trim().min(1).refine(isIanaTimezone, "Enter a valid IANA timezone"),
  zoneCount: z.coerce.number().int().min(1).max(MAX_ZONE_COUNT),
  sensorsPerZone: z.coerce.number().int().min(1).max(MAX_SENSORS_PER_ZONE),
});

export const updateFarmSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  wilayaId: z.string().trim().max(10).optional().or(z.literal("")),
  commune: z.string().trim().max(120).optional().or(z.literal("")),
  landAreaHa: z.coerce.number().nonnegative().max(1_000_000).nullable().optional(),
  latitude: latitudeSchema.nullable().optional(),
  longitude: longitudeSchema.nullable().optional(),
}).superRefine(requireCoordinatePair);

/**
 * An owner may hold at most this many farms (V2).
 *
 * Enforced in the API rather than the schema: the limit is a business rule about a collection, not
 * a property of any single row, and a database constraint cannot express it portably.
 */
export const MAX_FARMS_PER_OWNER = 3;

/** Creating a farm. `name` is the only required field; the rest can be filled in later. */
export const createFarmSchema = z.object({
  name: z.string().trim().min(2, "Farm name is required").max(120),
  wilayaId: z.string().trim().max(10).optional().or(z.literal("")),
  commune: z.string().trim().max(120).optional().or(z.literal("")),
  landAreaHa: z.coerce.number().nonnegative().max(1_000_000).nullable().optional(),
  latitude: latitudeSchema.nullable().optional(),
  longitude: longitudeSchema.nullable().optional(),
}).superRefine(requireCoordinatePair);

export type CreateFarmInput = z.infer<typeof createFarmSchema>;

/** A farm in the owner's switcher: enough to name it, and no join code or settings. */
export interface FarmSummary {
  id: string;
  name: string;
  wilayaId: string | null;
  commune: string | null;
  landAreaHa: number | null;
  createdAt: string;
}

export const inviteWorkerSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  type: z.enum(WORKER_TYPES),
  /** Only offered in the UI for operators; ignored for engineers. */
  grantValve: z.boolean().default(false),
});

export const updateWorkerSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  type: z.enum(WORKER_TYPES).optional(),
  status: z.enum(USER_STATUSES).optional(),
});

export const setValveControlSchema = z.object({ granted: z.boolean() });

export const zoneInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const updateZoneSchema = zoneInputSchema.partial().refine(
  (input) => Object.keys(input).length > 0,
  "At least one zone field is required",
);

export type ZoneInput = z.infer<typeof zoneInputSchema>;
export type UpdateZoneInput = z.infer<typeof updateZoneSchema>;
export type FarmSettingsInput = z.infer<typeof farmSettingsSchema>;
export type UpdateFarmInput = z.infer<typeof updateFarmSchema>;
export type InviteWorkerInput = z.infer<typeof inviteWorkerSchema>;
export type UpdateWorkerInput = z.infer<typeof updateWorkerSchema>;
export type SetValveControlInput = z.infer<typeof setValveControlSchema>;

export interface Farm {
  id: string;
  name: string;
  /** The `XXXX-XXXX` join code. Owner-only field — never exposed to workers. */
  ownerCode: string;
  wilayaId: string | null;
  wilayaName: { en: string; ar: string } | null;
  commune: string | null;
  landAreaHa: number | null;
  /** Farm location used by coordinate-based services such as live weather. */
  latitude: number | null;
  longitude: number | null;
  /** The outline the owner drew, as `[lat, lng]` pairs, or null while it is still the default grid. */
  boundary: Array<[number, number]> | null;
  createdAt: string;
}

/**
 * The drawn farm outline.
 *
 * Validated here rather than in the page: a polygon from a map click handler is untrusted input
 * like any other, and a degenerate one (two points, or coordinates outside the globe) would break
 * every map that renders it.
 */
export const farmBoundarySchema = z.object({
  boundary: z
    .array(
      z.tuple([
        z.number().min(-90, "Latitude out of range").max(90, "Latitude out of range"),
        z.number().min(-180, "Longitude out of range").max(180, "Longitude out of range"),
      ]),
    )
    .min(3, "A boundary needs at least three points")
    .max(300, "That boundary has too many points"),
});

export type FarmBoundaryInput = z.infer<typeof farmBoundarySchema>;

export interface FarmSettings extends FarmSettingsInput {
  timezone: string;
}

export interface Zone {
  id: string;
  name: string;
  valveState: (typeof import("../enums.js").VALVE_STATES)[number];
  sortOrder: number;
  /** Latest reading per zone, resolved by the telemetry repository. */
  latestMoisture: number | null;
}

/** A row in the Settings worker table. Mirrors the page's local `WorkerEntry` shape. */
export interface Worker {
  id: string;
  initials: string;
  name: string;
  email: string;
  type: (typeof WORKER_TYPES)[number];
  valveControl: boolean;
  status: (typeof USER_STATUSES)[number];
  createdAt: string;
}
