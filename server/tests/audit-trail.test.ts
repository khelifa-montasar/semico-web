import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/db/prisma.js";
import { auth, PASSWORD, registerOwner, resetDatabase, testApp } from "./helpers/api.js";
import { buildCast } from "./helpers/roles.js";

/**
 * The security audit trail.
 *
 * Distinct from the farmer-facing activity feed: this carries the actor, the IP and the user agent,
 * is never bilingual, and is readable only by the owner. The properties tested here are the ones
 * that make it worth having — that it records WHO did WHAT, that it cannot be edited, and that it
 * survives the removal of the people it names.
 */

const OWNER_SCOPED_ACTIONS = [
  "REGISTER",
  "LOGIN",
  "LOGOUT",
  "PROFILE_UPDATED",
  "PERMISSION_GRANT",
  "PERMISSION_REVOKE",
  "WORKER_INVITED",
  "WORKER_REMOVED",
  "PASSWORD_RESET",
  "VALVE_OPEN",
  "VALVE_CLOSE",
  "OWNER_CODE_ROTATED",
  "REFRESH_REUSE_DETECTED",
  "FARM_CREATED",
];

beforeEach(resetDatabase);

describe("access", () => {
  it("is readable by the owner", async () => {
    const owner = await registerOwner();
    await request(testApp()).get("/api/v1/farms/me/audit").set(auth(owner.accessToken)).expect(200);
  });

  it("is refused to workers and engineers", async () => {
    const cast = await buildCast();

    for (const user of [cast.operatorValve, cast.operatorPlain, cast.engineer]) {
      const response = await request(testApp())
        .get("/api/v1/farms/me/audit")
        .set(auth(user.accessToken))
        .expect(403);

      expect(response.body.error.code).toBe("FORBIDDEN");
    }
  });

  it("is refused to anonymous callers", async () => {
    await request(testApp()).get("/api/v1/farms/me/audit").expect(401);
  });
});

describe("what gets recorded", () => {
  it("records a registration", async () => {
    await registerOwner();

    const row = await prisma.auditLog.findFirstOrThrow({ where: { action: "REGISTER" } });
    expect(row.actorId).toBeTruthy();
    expect(row.entityType).toBe("USER");
    expect(row.farmId).toBeTruthy();
  });

  it("records a login with its provenance", async () => {
    const owner = await registerOwner();

    await request(testApp())
      .post("/api/v1/auth/login")
      .set("User-Agent", "AuditTrailTest/1.0")
      .send({ email: owner.email, password: PASSWORD })
      .expect(200);

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "LOGIN", actorId: owner.userId },
    });

    // Who and from where: without these two the log cannot answer "was that really them?".
    expect(row.ip).toBeTruthy();
    expect(row.userAgent).toBe("AuditTrailTest/1.0");
    expect(row.entityType).toBe("SESSION");
  });

  it("records a logout", async () => {
    const owner = await registerOwner();

    await request(testApp())
      .post("/api/v1/auth/logout")
      .set(auth(owner.accessToken))
      .expect(204);

    expect(await prisma.auditLog.count({ where: { action: "LOGOUT", actorId: owner.userId } })).toBe(1);
  });

  it("records a profile update by field NAME, never by value", async () => {
    const owner = await registerOwner();

    await request(testApp())
      .patch("/api/v1/users/me")
      .set(auth(owner.accessToken))
      .send({ phone: "+213 555 000 111", bio: "A private note." })
      .expect(200);

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "PROFILE_UPDATED", actorId: owner.userId },
    });

    expect(row.metadata).toContain("phone");
    // A phone number and a personal bio do not belong in a security log.
    expect(row.metadata).not.toContain("+213 555 000 111");
    expect(row.metadata).not.toContain("A private note.");
  });

  it("records a valve command against the zone", async () => {
    const owner = await registerOwner();

    const command = await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(owner.accessToken))
      .send({ durationMin: 9 })
      .expect(201);

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "VALVE_OPEN", actorId: owner.userId },
    });

    expect(row.entityType).toBe("ZONE");
    expect(row.entityId).toBe(command.body.data.zoneId);
    expect(JSON.parse(row.metadata ?? "{}")).toMatchObject({ durationMin: 9 });
  });

  it("records a permission grant, with the permission that was granted", async () => {
    const cast = await buildCast();

    await request(testApp())
      .patch(`/api/v1/farms/me/workers/${cast.operatorPlain.userId}/valve-control`)
      .set(auth(cast.owner.accessToken))
      .send({ granted: true })
      .expect(200);

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "PERMISSION_GRANT", entityId: cast.operatorPlain.userId },
    });

    expect(row.actorId).toBe(cast.owner.userId);
    expect(JSON.parse(row.metadata ?? "{}")).toMatchObject({ granted: true });
  });

  it("records a permission revocation", async () => {
    const cast = await buildCast();

    await request(testApp())
      .patch(`/api/v1/farms/me/workers/${cast.operatorValve.userId}/valve-control`)
      .set(auth(cast.owner.accessToken))
      .send({ granted: false })
      .expect(200);

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "PERMISSION_REVOKE", entityId: cast.operatorValve.userId },
    });
    expect(row.actorId).toBe(cast.owner.userId);
  });

  it("records an invitation and a removal", async () => {
    const cast = await buildCast();

    const invited = await request(testApp())
      .post("/api/v1/farms/me/workers/invite")
      .set(auth(cast.owner.accessToken))
      .send({ name: "Audit Invite", email: "audit.invite@test.dz", type: "ENGINEER", grantValve: false })
      .expect(201);

    const inviteRow = await prisma.auditLog.findFirstOrThrow({
      where: { action: "WORKER_INVITED", entityId: invited.body.data.worker.id },
    });
    expect(inviteRow.actorId).toBe(cast.owner.userId);

    await request(testApp())
      .delete(`/api/v1/farms/me/workers/${invited.body.data.worker.id}`)
      .set(auth(cast.owner.accessToken))
      .expect(204);

    expect(
      await prisma.auditLog.count({
        where: { action: "WORKER_REMOVED", entityId: invited.body.data.worker.id },
      }),
    ).toBe(1);
  });

  it("records a password reset", async () => {
    const cast = await buildCast();

    await request(testApp())
      .post(`/api/v1/farms/me/workers/${cast.engineer.userId}/reset-password`)
      .set(auth(cast.owner.accessToken))
      .expect(200);

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "PASSWORD_RESET", entityId: cast.engineer.userId },
    });
    expect(JSON.parse(row.metadata ?? "{}")).toMatchObject({ sessionsRevoked: true });
  });

  it("records a detected refresh-token replay", async () => {
    const owner = await registerOwner();

    await request(testApp()).post("/api/v1/auth/refresh").set("Cookie", owner.refreshCookie).expect(200);
    await request(testApp()).post("/api/v1/auth/refresh").set("Cookie", owner.refreshCookie).expect(401);

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "REFRESH_REUSE_DETECTED" },
    });
    expect(row.actorId).toBe(owner.userId);
    // The entity is the token family, not a user — this is a session-level event.
    expect(row.entityType).toBe("SESSION");
  });

  it("always uses an action from the known set", async () => {
    // Guards against a typo'd action string creating a row nothing can filter or understand.
    const cast = await buildCast();

    await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(cast.owner.accessToken))
      .send({ durationMin: 5 })
      .expect(201);
    await request(testApp())
      .post("/api/v1/farms/me/owner-code/rotate")
      .set(auth(cast.owner.accessToken))
      .expect(200);

    const rows = await prisma.auditLog.findMany();
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      expect(OWNER_SCOPED_ACTIONS, `unknown audit action: ${row.action}`).toContain(row.action);
    }
  });
});

describe("reading the trail", () => {
  it("returns entries newest first", async () => {
    const owner = await registerOwner();

    await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(owner.accessToken))
      .send({ durationMin: 5 })
      .expect(201);

    const response = await request(testApp())
      .get("/api/v1/farms/me/audit")
      .set(auth(owner.accessToken))
      .expect(200);

    const times = response.body.data.map((row: { createdAt: string }) => Date.parse(row.createdAt));
    const sorted = [...times].sort((a, b) => b - a);
    expect(times).toEqual(sorted);
  });

  it("filters by action", async () => {
    const owner = await registerOwner();
    await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(owner.accessToken))
      .send({ durationMin: 5 })
      .expect(201);

    const only = await request(testApp())
      .get("/api/v1/farms/me/audit?action=VALVE_OPEN")
      .set(auth(owner.accessToken))
      .expect(200);

    expect(only.body.data.length).toBeGreaterThan(0);
    expect(only.body.data.every((row: { action: string }) => row.action === "VALVE_OPEN")).toBe(true);
  });

  it("returns an empty list for an action that never happened, not an error", async () => {
    const owner = await registerOwner();

    const response = await request(testApp())
      .get("/api/v1/farms/me/audit?action=OWNER_CODE_ROTATED")
      .set(auth(owner.accessToken))
      .expect(200);

    expect(response.body.data).toEqual([]);
    expect(response.body.meta.total).toBe(0);
  });

  it("paginates", async () => {
    const owner = await registerOwner();
    for (let i = 0; i < 3; i += 1) {
      await request(testApp())
        .post("/api/v1/farms/me/irrigation/irrigate")
        .set(auth(owner.accessToken))
        .send({ durationMin: 5 })
        .expect(201);
    }

    const page = await request(testApp())
      .get("/api/v1/farms/me/audit?pageSize=2&page=1")
      .set(auth(owner.accessToken))
      .expect(200);

    expect(page.body.data).toHaveLength(2);
    expect(page.body.meta.pageSize).toBe(2);
    expect(page.body.meta.total).toBeGreaterThanOrEqual(3);
  });

  it("names the actor, so a row is attributable without a second lookup", async () => {
    const cast = await buildCast();

    await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(cast.operatorValve.accessToken))
      .send({ durationMin: 5 })
      .expect(201);

    const response = await request(testApp())
      .get("/api/v1/farms/me/audit?action=VALVE_OPEN")
      .set(auth(cast.owner.accessToken))
      .expect(200);

    expect(response.body.data[0]).toMatchObject({
      actorId: cast.operatorValve.userId,
      actorName: "Test Worker",
      actorRole: "WORKER",
    });
  });

  it("is a security log, so it is never bilingual", async () => {
    // The activity feed carries messageEn/messageAr; this deliberately does not.
    const owner = await registerOwner();
    const response = await request(testApp())
      .get("/api/v1/farms/me/audit")
      .set(auth(owner.accessToken))
      .expect(200);

    expect(JSON.stringify(response.body)).not.toContain("messageEn");
    expect(JSON.stringify(response.body)).not.toContain("messageAr");
  });
});

describe("the trail is append-only", () => {
  it("offers no route to edit or delete an entry", async () => {
    const owner = await registerOwner();
    const existing = await prisma.auditLog.findFirstOrThrow();

    // Nothing in the router can mutate the trail — the only way to change it would be the database.
    await request(testApp())
      .delete(`/api/v1/farms/me/audit/${existing.id}`)
      .set(auth(owner.accessToken))
      .expect(404);

    await request(testApp())
      .patch(`/api/v1/farms/me/audit/${existing.id}`)
      .set(auth(owner.accessToken))
      .send({ action: "LOGIN" })
      .expect(404);

    // And it is still there, unmodified.
    const after = await prisma.auditLog.findUnique({ where: { id: existing.id } });
    expect(after?.action).toBe(existing.action);
  });

  it("keeps the rows of a worker who is later removed", async () => {
    const cast = await buildCast();

    // The operator acts, creating history that must outlive them.
    await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(cast.operatorValve.accessToken))
      .send({ durationMin: 5 })
      .expect(201);

    await request(testApp())
      .delete(`/api/v1/farms/me/workers/${cast.operatorValve.userId}`)
      .set(auth(cast.owner.accessToken))
      .expect(204);

    // Removing a worker is a soft delete precisely so this still resolves to a real person.
    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "VALVE_OPEN", actorId: cast.operatorValve.userId },
    });
    const actor = await prisma.user.findUnique({ where: { id: cast.operatorValve.userId } });
    expect(actor).not.toBeNull();

    const response = await request(testApp())
      .get("/api/v1/farms/me/audit?action=VALVE_OPEN")
      .set(auth(cast.owner.accessToken))
      .expect(200);
    expect(response.body.data[0].actorName).toBe("Test Worker");
    expect(row.farmId).toBe(cast.farmId);
  });
});

describe("the trail never leaks a secret", () => {
  it("stores no password and no token", async () => {
    const owner = await registerOwner();

    await request(testApp())
      .post("/api/v1/auth/login")
      .send({ email: owner.email, password: PASSWORD })
      .expect(200);

    await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(owner.accessToken))
      .send({ durationMin: 5 })
      .expect(201);

    const rows = await prisma.auditLog.findMany();
    const dump = JSON.stringify(rows);

    expect(dump).not.toContain(PASSWORD);
    expect(dump).not.toContain("$argon2");
    // Not the access token either — the log records that a session happened, not the credential.
    expect(dump).not.toContain(owner.accessToken);
    expect(dump).not.toContain("semico_refresh");
  });
});
