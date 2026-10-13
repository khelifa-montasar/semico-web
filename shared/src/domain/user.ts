import { z } from "zod";
import type { AuthUser } from "./auth.js";

/**
 * Profile contracts. These mirror the local types the Settings page already declares
 * (`ExperienceEntry`, `EducationEntry`) so the UI needs no reshaping when it switches to the API.
 */

export const experienceInputSchema = z.object({
  jobTitle: z.string().trim().min(2, "Job title is required").max(120),
  company: z.string().trim().min(2, "Company is required").max(120),
  /** Freeform on purpose — the UI collects values like "Jan 2019", not ISO dates. */
  startDate: z.string().trim().min(1, "Start date is required").max(40),
  endDate: z.string().trim().max(40).optional(),
  isPresent: z.boolean().default(false),
  description: z.string().trim().max(1000).optional(),
});

export const educationInputSchema = z.object({
  degree: z.string().trim().min(2, "Degree is required").max(160),
  institution: z.string().trim().min(2, "Institution is required").max(160),
  year: z.string().trim().max(20).optional(),
});

/** `bio` is capped at 500 — the Settings textarea shows a live `{n}/500` counter. */
export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[+0-9 ()-]*$/, "Enter a valid phone number")
    .optional()
    .or(z.literal("")),
  wilayaId: z.string().trim().max(10).optional().or(z.literal("")),
  commune: z.string().trim().max(120).optional().or(z.literal("")),
  bio: z.string().trim().max(500, "Bio must be 500 characters or fewer").optional(),
  avatarUrl: z.string().trim().max(500).optional().or(z.literal("")),
});

export type ExperienceInput = z.infer<typeof experienceInputSchema>;
export type EducationInput = z.infer<typeof educationInputSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export interface ExperienceEntry extends ExperienceInput {
  id: string;
}

export interface EducationEntry extends EducationInput {
  id: string;
}

export interface UserProfile extends AuthUser {
  createdAt: string;
  experiences: ExperienceEntry[];
  educations: EducationEntry[];
}
