import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/db/prisma.js";
import {
  auth,
  registerOwner,
  registerWorker,
  resetDatabase,
  testApp,
  type RegisteredUser,
} from "./helpers/api.js";

/**
 * Authorization and the audit trail.
 *
 * The bug these exist to prevent: `requireAuth` originally resolved a farm id from the `farm`
 * relation, which is the WORKER side of the join. Owners are linked by `Farm.ownerId`, so every
 * owner had a null farmId and got a 403 on every /farms/me/* route — a total outage of the
 * authenticated app that only shows up once someone actually signs in.
 *
 * The second theme is that a permission revoked must be revoked on the NEXT request, not when the
 * token expires. That only holds because the guard re-reads the database instead of trusting the
 * JWT; these tests fail if anyone moves that data into the token.
 */

beforeEach(resetDatabase);

const FARM_READ_ROUTES = [
  "/api/v1/farms/me",
  "/api/v1/farms/me/settings",
  "/api/v1/farms/me/zones",
  "/api/v1/farms/me/telemetry",
  "/api/v1/farms/me/telemetry/latest",
  "/api/v1/farms/me/telemetry/latest-per-zone",
  "/api/v1/farms/me/device-status",
  "/api/v1/farms/me/system-health",
  "/api/v1/farms/me/system-health/errors",
  "/api/v1/farms/me/activity",
  "/api/v1/farms/me/activity/calendar",
  "/api/v1/farms/me/irrigation/commands",
];

describe("owner farm access", () => {
  it.each(FARM_READ_ROUTES)("responds 200 (not 403) on %s", async (route) => {
    const owner = await registerOwner();

    const response = await request(testApp()).get(route).set(auth(owner.accessToken));

    expect(response.status).toBe(200);
  });

  it("resolves the owner's farmId so the guard can pass", async () => {
    const owner = await registerOwner("Mitidja Olives");

    const response = await request(testApp())
      .get("/api/v1/farms/me")
      .set(auth(owner.accessToken))
      .expect(200);

    expect(response.body.data.id).toBe(owner.farmId);
    expect(response.body.data.name).toBe("Mitidja Olives");
  });

  it("shows the owner code to the owner but never to a worker", async () => {
    const owner = await registerOwner();

    const asOwner = await request(testApp())
      .get("/api/v1/farms/me")
      .set(auth(owner.accessToken))
      .expect(200);
    expect(asOwner.body.data.ownerCode).toBe(owner.ownerCode);

    const worker = await registerWorker(owner.ownerCode, "OBSERVER");
    const asWorker = await request(testApp())
      .get("/api/v1/farms/me")
      .set(auth(worker.accessToken))
      .expect(200);

    // The code is a credential: a worker holding it could invite anyone.
    expect(asWorker.body.data.ownerCode).toBe("");
  });

  it("keeps the owner code out of the login response", async () => {
    const owner = await registerOwner();

    const response = await request(testApp())
      .post("/api/v1/auth/login")
      .send({ email: owner.email, password: "Semico2026!" })
      .expect(200);

    expect(JSON.stringify(response.body)).not.toContain(owner.ownerCode);
  });
});

describe("valve control capability", () => {
  it("lets the owner operate a valve", async () => {
    const owner = await registerOwner();

    const response = await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(owner.accessToken))
      .send({ durationMin: 15 })
      .expect(201);

    expect(response.body.data).toMatchObject({ action: "OPEN", durationMin: 15, status: "EXECUTED" });
  });

  it("refuses an OBSERVER", async () => {
    const owner = await registerOwner();
    const observer = await registerWorker(owner.ownerCode, "OBSERVER");

    const response = await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(observer.accessToken))
      .send({ durationMin: 10 })
      .expect(403);

    expect(response.body.error.code).toBe("VALVE_CONTROL_REQUIRED");
  });

  it("refuses an OPERATOR whose permission has not been granted", async () => {
    const owner = await registerOwner();
    const operator = await registerWorker(owner.ownerCode, "OPERATOR");

    await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(operator.accessToken))
      .send({ durationMin: 10 })
      .expect(403);
  });

  it("allows an OPERATOR once the owner grants the permission", async () => {
    const owner = await registerOwner();
    const operator = await registerWorker(owner.ownerCode, "OPERATOR");

    await prisma.user.update({ where: { id: operator.userId }, data: { valveControl: true } });

    // Same token as the rejected request above — no re-login. The permission is read from the
    // database per request, which is the entire point.
    await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(operator.accessToken))
      .send({ durationMin: 10 })
      .expect(201);
  });

  it("REVOKES mid-session, without a new token", async () => {
    const owner = await registerOwner();
    const operator = await registerWorker(owner.ownerCode, "OPERATOR");
    await prisma.user.update({ where: { id: operator.userId }, data: { valveControl: true } });

    await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(operator.accessToken))
      .send({ durationMin: 10 })
      .expect(201);

    await prisma.user.update({ where: { id: operator.userId }, data: { valveControl: false } });

    // The SAME access token, still unexpired, must now be refused. If this starts failing, someone
    // has moved valveControl into the JWT.
    const afterRevoke = await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(operator.accessToken))
      .send({ durationMin: 10 })
      .expect(403);

    expect(afterRevoke.body.error.code).toBe("VALVE_CONTROL_REQUIRED");
  });

  it("refuses a disabled account's still-valid token", async () => {
    const owner = await registerOwner();
    const operator = await registerWorker(owner.ownerCode, "OPERATOR");
    await prisma.user.update({ where: { id: operator.userId }, data: { valveControl: true } });

    await prisma.user.update({ where: { id: operator.userId }, data: { status: "DISABLED" } });

    await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(operator.accessToken))
      .send({ durationMin: 10 })
      .expect(403);
  });
});

describe("irrigation writes the audit trail atomically", () => {
  it("records the command, the valve state, the feed row and the audit row", async () => {
    const owner = await registerOwner();
    const zone = await prisma.zone.findFirstOrThrow({
      where: { farmId: owner.farmId },
      orderBy: { sortOrder: "asc" },
    });

    const response = await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(owner.accessToken))
      .send({ durationMin: 20 })
      .expect(201);

    const commandId = response.body.data.id;

    const command = await prisma.irrigationCommand.findUniqueOrThrow({ where: { id: commandId } });
    expect(command).toMatchObject({
      zoneId: zone.id,
      issuedById: owner.userId,
      action: "OPEN",
      durationMin: 20,
      status: "EXECUTED",
    });

    // The valve actually moved.
    const movedZone = await prisma.zone.findUniqueOrThrow({ where: { id: zone.id } });
    expect(movedZone.valveState).toBe("OPEN");

    // The farmer-facing feed.
    const feed = await prisma.activityLog.findFirstOrThrow({
      where: { farmId: owner.farmId, zoneId: zone.id, kind: "VALVE_OPEN" },
    });
    expect(feed.type).toBe("MANUAL");
    expect(feed.actorId).toBe(owner.userId);
    expect(feed.messageEn).toContain("Valve opened");
    expect(feed.messageAr).toBeTruthy();

    // The security audit, with the actor recorded.
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "VALVE_OPEN", entityId: zone.id },
    });
    expect(audit.actorId).toBe(owner.userId);
    expect(audit.farmId).toBe(owner.farmId);
    expect(audit.entityType).toBe("ZONE");
    // Written in the same transaction, so it cannot describe an event that did not happen.
    expect(JSON.parse(audit.metadata ?? "{}")).toMatchObject({ commandId, durationMin: 20 });
  });

  it("closes a valve and records it as a close", async () => {
    const owner = await registerOwner();

    const response = await request(testApp())
      .post("/api/v1/farms/me/irrigation/valve")
      .set(auth(owner.accessToken))
      .send({ action: "CLOSE" })
      .expect(201);

    expect(response.body.data).toMatchObject({ action: "CLOSE", durationMin: null });

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "VALVE_CLOSE" } });
    expect(audit.actorId).toBe(owner.userId);
  });

  it("rejects an out-of-range duration", async () => {
    const owner = await registerOwner();

    const response = await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(owner.accessToken))
      .send({ durationMin: 500 })
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    expect(response.body.error.details).toHaveProperty("durationMin");
  });
});

describe("cross-farm isolation", () => {
  it("does not let one farm act on another farm's zone", async () => {
    const farmA = await registerOwner("Farm A");
    const farmB = await registerOwner("Farm B");

    const zoneA = await prisma.zone.findFirstOrThrow({ where: { farmId: farmA.farmId } });

    // 404, not 403: a 403 would confirm the zone exists, which is enough to enumerate ids.
    const response = await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(farmB.accessToken))
      .send({ durationMin: 10, zoneId: zoneA.id })
      .expect(404);

    expect(response.body.error.code).toBe("NOT_FOUND");

    // And nothing happened to farm A.
    const untouched = await prisma.zone.findUniqueOrThrow({ where: { id: zoneA.id } });
    expect(untouched.valveState).toBe("CLOSED");
  });

  it("scopes the activity feed to the caller's own farm", async () => {
    const farmA = await registerOwner("Farm A");
    const farmB = await registerOwner("Farm B");

    await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(farmA.accessToken))
      .send({ durationMin: 10 })
      .expect(201);

    const response = await request(testApp())
      .get("/api/v1/farms/me/activity")
      .set(auth(farmB.accessToken))
      .expect(200);

    // Farm B has its own "farm created" row, so an absolute count would be brittle. Assert the
    // thing that actually matters: none of farm A's event leaked across.
    const kinds = response.body.data.map((entry: { kind: string }) => entry.kind);
    expect(kinds).not.toContain("VALVE_OPEN");
    expect(response.body.data.every((entry: { zoneId: string | null }) => entry.zoneId === null)).toBe(
      true,
    );

    // And farm A still sees its own event.
    const asFarmA = await request(testApp())
      .get("/api/v1/farms/me/activity")
      .set(auth(farmA.accessToken))
      .expect(200);
    expect(asFarmA.body.data.map((entry: { kind: string }) => entry.kind)).toContain("VALVE_OPEN");
  });
});

describe("telemetry series", () => {
  it("buckets farm readings and stays scoped to the caller", async () => {
    const owner: RegisteredUser = await registerOwner();
    const zone = await prisma.zone.findFirstOrThrow({ where: { farmId: owner.farmId } });

    await prisma.telemetry.createMany({
      data: [70, 60, 50].map((moisture, index) => ({
        farmId: owner.farmId,
        zoneId: zone.id,
        recordedAt: new Date(Date.now() - (2 - index) * 24 * 60 * 60 * 1000),
        rootMoisture: moisture,
        surfaceMoisture: moisture - 5,
      })),
    });

    const response = await request(testApp())
      .get("/api/v1/farms/me/telemetry?interval=day&range=7d")
      .set(auth(owner.accessToken))
      .expect(200);

    expect(response.body.data).toHaveLength(3);
    expect(response.body.data.map((point: { rootMoisture: number }) => point.rootMoisture)).toEqual([
      70, 60, 50,
    ]);
    // Axis labels are computed server-side, in the farm timezone.
    expect(response.body.data[0].label).toMatch(/^[A-Z][a-z]{2}$/);
  });
});
