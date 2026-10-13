import { z } from "zod";
import { IRRIGATION_ACTIONS } from "../enums.js";
import type { CommandStatus, IrrigationAction } from "../enums.js";

/**
 * Irrigation command contracts.
 *
 * These are the endpoints that finally make "Irrigate now" and Open/Close Valve real. Both are
 * gated by the valve-control capability (owner, or an operator who has been granted it) and both
 * write an ActivityLog + AuditLog row in the same transaction as the state change.
 */

export const irrigateSchema = z.object({
  /** Clamped to 1–120 by the UI; enforced again here. */
  durationMin: z.coerce.number().int().min(1, "Minimum is 1 minute").max(120, "Maximum is 120 minutes"),
  zoneId: z.string().trim().min(1).optional(),
});

export const valveCommandSchema = z.object({
  action: z.enum(IRRIGATION_ACTIONS),
  zoneId: z.string().trim().min(1).optional(),
});

export const commandQuerySchema = z.object({
  status: z.string().trim().optional(),
  zoneId: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type IrrigateInput = z.infer<typeof irrigateSchema>;
export type ValveCommandInput = z.infer<typeof valveCommandSchema>;

export interface IrrigationCommand {
  id: string;
  zoneId: string;
  zoneName: string;
  issuedById: string;
  issuedByName: string;
  action: IrrigationAction;
  durationMin: number | null;
  status: CommandStatus;
  requestedAt: string;
  /** Simulated execution time — the device layer is not implemented yet. */
  executedAt: string | null;
}
