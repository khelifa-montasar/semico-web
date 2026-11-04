import { z } from "zod";
import { REGISTRATION_ROLES, ROLES, USER_STATUSES, WORKER_TYPES } from "../enums.js";

/**
 * Auth contracts.
 *
 * The signup payload is the interesting one: it covers both halves of the flow the Login page
 * already models — a farm owner creating a farm, and a worker joining an existing farm with the
 * owner's `XXXX-XXXX` code. The rules below encode what the UI only hinted at.
 */

const email = z.string().trim().toLowerCase().email("Enter a valid email address");
const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(200, "Password is too long");

/** Printed on the owner's screen and typed by workers: `XXXX-XXXX`, uppercase alphanumeric. */
export const ownerCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/, "Codes look like XXXX-XXXX");

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name").max(120),
    email,
    password,
    role: z.enum(REGISTRATION_ROLES),
    /** Only meaningful for workers; ignored for owners. */
    workerType: z.enum(WORKER_TYPES).optional(),
    /** Required for workers — this is how a worker is attached to a farm. */
    ownerCode: ownerCodeSchema.optional(),
    /** Owners name their farm at signup; falls back to "<name>'s Farm". */
    farmName: z.string().trim().min(2).max(120).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.role === "WORKER" && !value.ownerCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ownerCode"],
        message: "A farm owner code is required to join as a worker",
      });
    }
    if (value.role === "OWNER" && value.ownerCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ownerCode"],
        message: "Farm owners do not join with a code — leave it blank",
      });
    }
  });

export const loginSchema = z.object({ email, password });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

/** The authenticated user as the client sees it. Never contains a password hash. */
export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: (typeof ROLES)[number];
  workerType: (typeof WORKER_TYPES)[number] | null;
  /** Revocable, operator-only. Resolved from the DB on every request, never from the JWT. */
  valveControl: boolean;
  status: (typeof USER_STATUSES)[number];
  farmId: string | null;
  farmName: string | null;
  avatarUrl: string | null;
  phone: string | null;
  wilayaId: string | null;
  commune: string | null;
  bio: string | null;
  /** Derived server-side so the UI never has to compute avatar initials itself. */
  initials: string;
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  /** Seconds until `accessToken` expires — lets the client refresh proactively. */
  expiresIn: number;
}
