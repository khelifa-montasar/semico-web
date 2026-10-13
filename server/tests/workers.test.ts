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
 * Worker management.
 *
 * The theme throughout: role (OWNER vs WORKER) gates administration, while the valve capability is
 * a separate, revocable thing. An operator with valve control still cannot invite people; a
 * demoted observer cannot keep a capability their new role does not have.
 */

beforeEach(resetDatabase);

async function invite(
  owner: RegisteredUser,
  overrides: Partial<{ name: string; email: string; type: string; grantValve: boolean }> = {},
) {
  const response = await request(testApp())
    .post("/api/v1/farms/me/workers/invite")
    .set(auth(owner.accessToken))
    .send({
      name: "New Worker",
      email: `invited.${Math.random().toString(36).slice(2, 10)}@test.dz`,
      type: "OPERATOR",
      grantValve: false,
      ...overrides,
    })
    .expect(201);

  return response.body.data as {
    worker: { id: string; name: string; email: string; type: string; valveControl: boolean; status: string; initials: string };
    temporaryPassword: string;
  };
}

describe("worker list", () => {
  it("starts empty and shows invited workers", async () => {
    const owner = await registerOwner();

    const empty = await request(testApp())
      .get("/api/v1/farms/me/workers")
      .set(auth(owner.accessToken))
      .expect(200);
    expect(empty.body.data).toHaveLength(0);

    await invite(owner);

    const populated = await request(testApp())
      .get("/api/v1/farms/me/workers")
      .set(auth(owner.accessToken))
      .expect(200);

    expect(populated.body.data).toHaveLength(1);
    expect(populated.body.data[0]).toMatchObject({ type: "OPERATOR", status: "INVITED" });
  });

  it("never exposes a password hash", async () => {
    const owner = await registerOwner();
    await invite(owner);

    const response = await request(testApp())
      .get("/api/v1/farms/me/workers")
      .set(auth(owner.accessToken))
      .expect(200);

    expect(JSON.stringify(response.body)).not.toContain("argon2");
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
  });
});

describe("invite", () => {
  it("creates an INVITED operator holding no valve control by default", async () => {
    const owner = await registerOwner();
    const { worker, temporaryPassword } = await invite(owner, { name: "Yacine H." });

    expect(worker).toMatchObject({
      type: "OPERATOR",
      status: "INVITED",
      valveControl: false,
      initials: "YH",
    });
    expect(temporaryPassword).toHaveLength(14);
  });

  it("lets the invited worker sign in, which accepts the invite and activates them", async () => {
    const owner = await registerOwner();
    const { worker, temporaryPassword } = await invite(owner);

    const session = await request(testApp())
      .post("/api/v1/auth/login")
      .send({ email: worker.email, password: temporaryPassword })
      .expect(200);

    // Signing in with the invite password IS the acceptance, so INVITED must resolve to ACTIVE.
    // Otherwise the worker authenticates successfully and is then refused by every guarded route —
    // able to log in, able to see nothing.
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: worker.id } });
    expect(stored.status).toBe("ACTIVE");

    await request(testApp())
      .get("/api/v1/farms/me")
      .set(auth(session.body.data.accessToken))
      .expect(200);
  });

  it("honours grantValve for an operator but ignores it for an observer", async () => {
    const owner = await registerOwner();

    const operator = await invite(owner, { type: "OPERATOR", grantValve: true });
    expect(operator.worker.valveControl).toBe(true);

    // An observer can never hold the capability, so the flag is dropped rather than stored.
    const observer = await invite(owner, { type: "OBSERVER", grantValve: true });
    expect(observer.worker.valveControl).toBe(false);
  });

  it("rejects an email that is already registered", async () => {
    const owner = await registerOwner();
    const existing = await registerWorker(owner.ownerCode, "OBSERVER");

    const response = await request(testApp())
      .post("/api/v1/farms/me/workers/invite")
      .set(auth(owner.accessToken))
      .send({ name: "Duplicate", email: existing.email, type: "OPERATOR", grantValve: false })
      .expect(409);

    expect(response.body.error.code).toBe("EMAIL_IN_USE");
  });
});

describe("valve control grant and revoke", () => {
  it("grants, records both logs, and lets the operator irrigate", async () => {
    const owner = await registerOwner();
    const { worker } = await invite(owner, { type: "OPERATOR" });

    // The invite's password is only returned once, so reset to get a known value.
    const reset = await request(testApp())
      .post(`/api/v1/farms/me/workers/${worker.id}/reset-password`)
      .set(auth(owner.accessToken))
      .expect(200);

    const workerToken = await request(testApp())
      .post("/api/v1/auth/login")
      .send({ email: worker.email, password: reset.body.data.temporaryPassword })
      .expect(200);

    // Before the grant: refused.
    await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(workerToken.body.data.accessToken))
      .send({ durationMin: 10 })
      .expect(403);

    const granted = await request(testApp())
      .patch(`/api/v1/farms/me/workers/${worker.id}/valve-control`)
      .set(auth(owner.accessToken))
      .send({ granted: true })
      .expect(200);

    expect(granted.body.data.valveControl).toBe(true);

    // Both audiences recorded it.
    const feed = await prisma.activityLog.findFirstOrThrow({
      where: { farmId: owner.farmId, kind: "PERMISSION_GRANT" },
    });
    expect(feed.actorId).toBe(owner.userId);
    expect(feed.messageEn).toContain("Valve control granted");

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "PERMISSION_GRANT", entityId: worker.id },
    });
    expect(audit.actorId).toBe(owner.userId);
    expect(JSON.parse(audit.metadata ?? "{}")).toMatchObject({ granted: true });

    // And it is genuinely in force on the worker's next request.
    await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(workerToken.body.data.accessToken))
      .send({ durationMin: 10 })
      .expect(201);
  });

  it("revokes and immediately blocks the operator", async () => {
    const owner = await registerOwner();
    const operator = await registerWorker(owner.ownerCode, "OPERATOR");
    await prisma.user.update({ where: { id: operator.userId }, data: { valveControl: true } });

    await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(operator.accessToken))
      .send({ durationMin: 10 })
      .expect(201);

    await request(testApp())
      .patch(`/api/v1/farms/me/workers/${operator.userId}/valve-control`)
      .set(auth(owner.accessToken))
      .send({ granted: false })
      .expect(200);

    await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(operator.accessToken))
      .send({ durationMin: 10 })
      .expect(403);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "PERMISSION_REVOKE", entityId: operator.userId },
    });
    expect(audit.actorId).toBe(owner.userId);
  });

  it("refuses to grant valve control to an observer", async () => {
    const owner = await registerOwner();
    const observer = await registerWorker(owner.ownerCode, "OBSERVER");

    const response = await request(testApp())
      .patch(`/api/v1/farms/me/workers/${observer.userId}/valve-control`)
      .set(auth(owner.accessToken))
      .send({ granted: true })
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("writes no audit row for a no-op grant", async () => {
    const owner = await registerOwner();
    const { worker } = await invite(owner, { type: "OPERATOR", grantValve: true });

    const before = await prisma.auditLog.count({ where: { action: "PERMISSION_GRANT" } });

    // Already granted — repeating it changes nothing, so it must not pollute the trail.
    await request(testApp())
      .patch(`/api/v1/farms/me/workers/${worker.id}/valve-control`)
      .set(auth(owner.accessToken))
      .send({ granted: true })
      .expect(200);

    const after = await prisma.auditLog.count({ where: { action: "PERMISSION_GRANT" } });
    expect(after).toBe(before);
  });
});

describe("demotion drops the capability", () => {
  it("clears valve control when an operator becomes an observer", async () => {
    const owner = await registerOwner();
    const operator = await registerWorker(owner.ownerCode, "OPERATOR");
    await prisma.user.update({ where: { id: operator.userId }, data: { valveControl: true } });

    const response = await request(testApp())
      .patch(`/api/v1/farms/me/workers/${operator.userId}`)
      .set(auth(owner.accessToken))
      .send({ type: "OBSERVER" })
      .expect(200);

    expect(response.body.data).toMatchObject({ type: "OBSERVER", valveControl: false });

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "PERMISSION_REVOKE", entityId: operator.userId },
    });
    expect(JSON.parse(audit.metadata ?? "{}")).toMatchObject({ reason: "demoted to observer" });
  });
});

describe("reset password", () => {
  it("issues a working password and ends existing sessions", async () => {
    const owner = await registerOwner();
    const worker = await registerWorker(owner.ownerCode, "OBSERVER");

    // The worker has a live session.
    await request(testApp())
      .get("/api/v1/farms/me")
      .set(auth(worker.accessToken))
      .expect(200);

    // Capture the sessions that exist BEFORE the reset, so the assertion below is about the reset
    // rather than about the new login it makes possible.
    const preReset = await prisma.refreshToken.findMany({
      where: { userId: worker.userId },
      select: { id: true },
    });
    expect(preReset.length).toBeGreaterThan(0);

    const reset = await request(testApp())
      .post(`/api/v1/farms/me/workers/${worker.userId}/reset-password`)
      .set(auth(owner.accessToken))
      .expect(200);

    const newPassword = reset.body.data.temporaryPassword as string;
    expect(newPassword).toBeTruthy();

    // The new password works.
    await request(testApp())
      .post("/api/v1/auth/login")
      .send({ email: worker.email, password: newPassword })
      .expect(200);

    // Every session that existed before the reset was killed. Signing in afterwards legitimately
    // creates a new one, which is why this is scoped rather than a blanket "all tokens revoked".
    const after = await prisma.refreshToken.findMany({
      where: { id: { in: preReset.map((token) => token.id) } },
      select: { revokedAt: true },
    });
    expect(after).toHaveLength(preReset.length);
    expect(after.every((token) => token.revokedAt !== null)).toBe(true);
  });
});

describe("remove", () => {
  it("disables and detaches the worker while keeping their audit history", async () => {
    const owner = await registerOwner();
    const operator = await registerWorker(owner.ownerCode, "OPERATOR");
    await prisma.user.update({ where: { id: operator.userId }, data: { valveControl: true } });

    // They act, creating history that must survive.
    await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(operator.accessToken))
      .send({ durationMin: 10 })
      .expect(201);

    await request(testApp())
      .delete(`/api/v1/farms/me/workers/${operator.userId}`)
      .set(auth(owner.accessToken))
      .expect(204);

    // Gone from the list.
    const list = await request(testApp())
      .get("/api/v1/farms/me/workers")
      .set(auth(owner.accessToken))
      .expect(200);
    expect(list.body.data).toHaveLength(0);

    // The record survives so the audit trail still resolves to a real person.
    const stored = await prisma.user.findUnique({ where: { id: operator.userId } });
    expect(stored).not.toBeNull();
    expect(stored?.farmId).toBeNull();
    expect(stored?.status).toBe("DISABLED");

    const audit = await prisma.auditLog.findFirst({
      where: { action: "WORKER_REMOVED", entityId: operator.userId },
    });
    expect(audit).not.toBeNull();

    // Their command history is intact — that is the point of not deleting.
    const commands = await prisma.irrigationCommand.count({ where: { issuedById: operator.userId } });
    expect(commands).toBe(1);

    // And they can no longer reach the farm.
    await request(testApp())
      .get("/api/v1/farms/me")
      .set(auth(operator.accessToken))
      .expect(403);
  });
});

describe("only the owner may manage workers", () => {
  it("refuses an operator with valve control", async () => {
    const owner = await registerOwner();
    const operator = await registerWorker(owner.ownerCode, "OPERATOR");
    await prisma.user.update({ where: { id: operator.userId }, data: { valveControl: true } });

    // Holding the valve capability is not the same as being an administrator.
    await request(testApp())
      .get("/api/v1/farms/me/workers")
      .set(auth(operator.accessToken))
      .expect(403);

    await request(testApp())
      .post("/api/v1/farms/me/workers/invite")
      .set(auth(operator.accessToken))
      .send({ name: "Sneaky", email: "sneaky@test.dz", type: "OPERATOR", grantValve: true })
      .expect(403);
  });

  it("refuses an observer", async () => {
    const owner = await registerOwner();
    const observer = await registerWorker(owner.ownerCode, "OBSERVER");

    await request(testApp())
      .get("/api/v1/farms/me/workers")
      .set(auth(observer.accessToken))
      .expect(403);
  });
});
