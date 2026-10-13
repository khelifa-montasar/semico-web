import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { ROLES, type Role } from "@semico/shared";
import { env } from "../config/env.js";

/**
 * Token strategy.
 *
 * ACCESS token — a short-lived JWT (15 min) held in memory by the client. It carries ONLY
 * `{ sub, role }`. It deliberately does not carry `farmId`, `workerType` or `valveControl`:
 * `requireAuth` re-reads those from the database on every request, which is what makes revoking
 * an operator's valve permission take effect immediately rather than whenever their token
 * happens to expire. Putting them in the JWT would be a small performance win and a real
 * security regression — do not "optimise" this later.
 *
 * REFRESH token — an opaque random string, not a JWT, delivered as an httpOnly cookie. Only its
 * hash is stored, so a database leak does not yield usable tokens.
 */

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export interface AccessTokenClaims {
  sub: string;
  role: Role;
}

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({ role: claims.role })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer("semico")
    .setAudience("semico-client")
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(accessSecret);
}

/** Returns null for any invalid, expired or tampered token — callers turn that into a 401. */
export async function verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, accessSecret, {
      algorithms: ["HS256"], // pin the algorithm; never let the token pick it
      issuer: "semico",
      audience: "semico-client",
    });
    return toClaims(payload);
  } catch {
    return null;
  }
}

function toClaims(payload: JWTPayload): AccessTokenClaims | null {
  const sub = payload.sub;
  const role = payload.role;
  if (typeof sub !== "string" || typeof role !== "string") return null;
  if (!(ROLES as readonly string[]).includes(role)) return null;
  return { sub, role: role as Role };
}

// ── refresh tokens ────────────────────────────────────────────────────────────

export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function generateTokenFamilyId(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Hashes a refresh token for storage, keyed with a server-side pepper so that a stolen database
 * alone is not enough to verify candidate tokens offline.
 */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(`${env.REFRESH_TOKEN_PEPPER}:${token}`).digest("hex");
}

/** Constant-time comparison for any secret compared in application code. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Seconds until access-token expiry — returned to the client so it can refresh proactively. */
export const accessTokenTtlSeconds = env.ACCESS_TOKEN_TTL_SECONDS;
