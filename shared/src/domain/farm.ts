import { z } from "zod";
import { USER_STATUSES, WORKER_TYPES } from "../enums.js";

/**
 * Farm, zone and worker contracts.
 *
 * Note the distinction the UI blurs: `role` is OWNER or WORKER, while `type` here is the
 * *capability* modifier (OPERATOR can be granted valve control, OBSERVER is read-only). Only
 * role gates worker management; `valveControl` is what gates the valves.
 */

export const farmSettingsSchema = z.object({
  /** Matches the Settings slider range exactly. */
  moistureThreshold: z.coerce.number().int().min(10).max(80),
  autoIrrigation: z.boolean(),
  pushNotifications: z.boolean(),
});

export const updateFarmSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  wilayaId: z.string().trim().max(10).optional().or(z.literal("")),
  commune: z.string().trim().max(120).optional().or(z.literal("")),
  landAreaHa: z.coerce.number().nonnegative().max(1_000_000).optional(),
});

export const inviteWorkerSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  type: z.enum(WORKER_TYPES),
  /** Only offered in the UI for operators; ignored for observers. */
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
  createdAt: string;
}

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
