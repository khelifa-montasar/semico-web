import { randomUUID } from "node:crypto";
import request from "supertest";
import type { Express } from "express";
import { prisma } from "../../src/db/prisma.js";
import { createApp } from "../../src/app.js";
import { generateOwnerCode } from "../../src/lib/initials.js";

/**
 * Test helpers.
 *
 * Tests run against the real Express app and a real SQLite file — no mocked Prisma. That is
 * deliberate: the bugs worth catching here (a guard reading the wrong relation, a permission
 * resolved from the token instead of the database) only exist in the wiring between the layers,
 * which a mocked repository would hide.
 */

let app: Express | null = null;

export function testApp(): Express {
  app ??= createApp();
  return app;
}

/** Empties every table. Called between tests so suites cannot leak state into each other. */
export async function resetDatabase(): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.irrigationCommand.deleteMany();
  await prisma.telemetry.deleteMany();
  await prisma.errorLog.deleteMany();
  await prisma.systemComponent.deleteMany();
  await prisma.deviceStatus.deleteMany();
  await prisma.farmSettings.deleteMany();
  await prisma.zone.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.experience.deleteMany();
  await prisma.education.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.bookingBlock.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.user.deleteMany();
  await prisma.farm.deleteMany();
  await prisma.wilaya.deleteMany();
}

export const PASSWORD = "Semico2026!";

function uniqueEmail(prefix: string): string {
  return `${prefix}.${randomUUID().slice(0, 8)}@test.dz`;
}

export interface RegisteredUser {
  email: string;
  accessToken: string;
  userId: string;
  farmId: string;
  ownerCode: string;
  refreshCookie: string;
}

/** Registers a farm owner and returns everything a test needs to act as them. */
export async function registerOwner(farmName = "Test Farm"): Promise<RegisteredUser> {
  const email = uniqueEmail("owner");

  const response = await request(testApp())
    .post("/api/v1/auth/register")
    .send({ fullName: "Test Owner", email, password: PASSWORD, role: "OWNER", farmName })
    .expect(201);

  const farm = await prisma.farm.findFirstOrThrow({ where: { ownerId: response.body.data.user.id } });

  return {
    email,
    accessToken: response.body.data.accessToken,
    userId: response.body.data.user.id,
    farmId: farm.id,
    ownerCode: farm.ownerCode,
    refreshCookie: extractRefreshCookie(response.headers["set-cookie"]),
  };
}

/** Registers a worker against an existing farm's owner code. */
export async function registerWorker(
  ownerCode: string,
  workerType: "OPERATOR" | "OBSERVER" = "OBSERVER",
): Promise<RegisteredUser> {
  const email = uniqueEmail("worker");

  const response = await request(testApp())
    .post("/api/v1/auth/register")
    .send({
      fullName: "Test Worker",
      email,
      password: PASSWORD,
      role: "WORKER",
      workerType,
      ownerCode,
    })
    .expect(201);

  return {
    email,
    accessToken: response.body.data.accessToken,
    userId: response.body.data.user.id,
    farmId: response.body.data.user.farmId,
    ownerCode,
    refreshCookie: extractRefreshCookie(response.headers["set-cookie"]),
  };
}

export async function login(email: string): Promise<RegisteredUser> {
  const response = await request(testApp())
    .post("/api/v1/auth/login")
    .send({ email, password: PASSWORD })
    .expect(200);

  return {
    email,
    accessToken: response.body.data.accessToken,
    userId: response.body.data.user.id,
    farmId: response.body.data.user.farmId,
    ownerCode: "",
    refreshCookie: extractRefreshCookie(response.headers["set-cookie"]),
  };
}

export function auth(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Normalises a `set-cookie` header.
 *
 * Supertest types this header as `string` but returns an array at runtime, so both shapes have to
 * be handled or every call site needs a cast.
 */
export function setCookieList(headers: Record<string, unknown>): string[] {
  const raw = headers["set-cookie"];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") return [raw];
  return [];
}

/** Pulls the refresh cookie out of a `set-cookie` header, accepting either runtime shape. */
export function extractRefreshCookie(setCookie: unknown): string {
  const list = Array.isArray(setCookie)
    ? setCookie.map(String)
    : typeof setCookie === "string"
      ? [setCookie]
      : [];

  const raw = list.find((cookie) => cookie.startsWith("semico_refresh="));
  return raw ? (raw.split(";")[0] ?? "") : "";
}

/** Generates a valid-format owner code that is guaranteed not to exist. */
export function unusedOwnerCode(): string {
  return generateOwnerCode();
}
