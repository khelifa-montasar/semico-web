// Loaded here rather than in index.ts so that EVERY entry point — the server, the Prisma seed,
// and the test setup — gets a populated process.env before validation runs. Relying on import
// order in the entry files is a footgun with ESM hoisting.
import "dotenv/config";
import { z } from "zod";

/**
 * Environment validation.
 *
 * Parsed once at boot and frozen. A missing or malformed variable fails the process immediately
 * with a readable message, rather than surfacing as a confusing `undefined` deep inside a
 * request — which is the usual failure mode when config is read ad hoc from `process.env`.
 */

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  CORS_ORIGIN: z.string().default("http://localhost:5173"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  REFRESH_TOKEN_PEPPER: z.string().min(32, "REFRESH_TOKEN_PEPPER must be at least 32 characters"),

  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().min(3600).default(2_592_000),

  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  COOKIE_DOMAIN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  • ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    // Fail loudly and immediately — a half-configured server is worse than one that won't boot.
    throw new Error(`Invalid environment configuration:\n${problems}\n\nSee server/.env.example.`);
  }

  return Object.freeze(parsed.data);
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

/** Name of the cookie carrying the refresh token. */
export const REFRESH_COOKIE_NAME = "semico_refresh";
