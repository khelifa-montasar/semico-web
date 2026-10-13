import { z } from "zod";
import { LOCALES } from "../enums.js";

/**
 * Sales leads from the public site.
 *
 * Collected by the three-step form on the Services page, which is filled in by anonymous visitors —
 * so this is company-level data, not farm-scoped, and the create endpoint is public and
 * rate-limited.
 */

export const LEAD_STATUSES = ["NEW", "CONTACTED", "CLOSED"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const createLeadSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[+0-9 ()-]*$/, "Enter a valid phone number")
    .optional()
    .or(z.literal("")),
  /** Free text: the form's placeholder reads "m² or ha" and leaves the unit to the visitor. */
  landArea: z.string().trim().max(60).optional().or(z.literal("")),
  /** Which language the visitor was reading, so follow-up can match it. */
  locale: z.enum(LOCALES).optional(),
});

export const updateLeadSchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  landArea: string | null;
  locale: (typeof LOCALES)[number] | null;
  status: LeadStatus;
  notes: string | null;
  createdAt: string;
}
