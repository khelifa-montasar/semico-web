import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/db/prisma.js";
import { auth, registerOwner, registerWorker, resetDatabase, testApp } from "./helpers/api.js";

/**
 * Multi-farm accounts (V2).
 *
 * An owner signs up with one farm and may add up to three. The property that matters is not the
 * count but the SCORE: every `/farms/me/*` route acts on exactly one farm, chosen by `X-Farm-Id` or
 * defaulting to the oldest — and an owner's two farms must not see each other's data. An owner's own
 * data leaking between their own farms is the same defect class as leaking between two owners, and
 * it is easier to introduce precisely because a single owner legitimately holds both.
 */

/** Returns the supertest request, not a promise — the caller chains `.expect(...)` on it. */
function createFarm(token: string, name: string) {
  return request(testApp()).post("/api/v1/farms").set(auth(token)).send({ name });
}

beforeEach(resetDatabase);

describe("creating farms", () => {
  it("gives a new owner exactly one farm at signup", async () => {
    const owner = await registerOwner("First Farm");

    const response = await request(testApp())
      .get("/api/v1/farms")
      .set(auth(owner.accessToken))
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].name).toBe("First Farm");
  });

  it("creates a second farm with its own join code, settings and zones", async () => {
    const owner = await registerOwner("First Farm");

    const created = await createFarm(owner.accessToken, "Second Farm").expect(201);

    expect(created.body.data).toMatchObject({ name: "Second Farm" });
    // The join code is per farm: a worker joining the second must not land on the first.
    expect(created.body.data.ownerCode).toBeTruthy();
    expect(created.body.data.ownerCode).not.toBe(owner.ownerCode);

    // A farm with no settings row or zones renders an empty dashboard and fails the first
    // telemetry query, so both are created with it.
    const settings = await prisma.farmSettings.findUnique({ where: { farmId: created.body.data.id } });
    expect(settings).not.toBeNull();

    const zones = await prisma.zone.findMany({ where: { farmId: created.body.data.id } });
    expect(zones).toHaveLength(3);
  });

  it("allows up to three farms", async () => {
    const owner = await registerOwner("Farm 1");

    await createFarm(owner.accessToken, "Farm 2").expect(201);
    await createFarm(owner.accessToken, "Farm 3").expect(201);

    const response = await request(testApp())
      .get("/api/v1/farms")
      .set(auth(owner.accessToken))
      .expect(200);

    expect(response.body.data.map((farm: { name: string }) => farm.name)).toEqual([
      "Farm 1",
      "Farm 2",
      "Farm 3",
    ]);
  });

  it("refuses a fourth with a code the client can branch on", async () => {
    const owner = await registerOwner("Farm 1");
    await createFarm(owner.accessToken, "Farm 2").expect(201);
    await createFarm(owner.accessToken, "Farm 3").expect(201);

    const response = await createFarm(owner.accessToken, "Farm 4").expect(409);

    expect(response.body.error.code).toBe("FARM_LIMIT_REACHED");
    // And nothing was created by the refusal.
    expect(await prisma.farm.count({ where: { ownerId: owner.userId } })).toBe(3);
  });

  it("records every farm creation in the audit trail", async () => {
    const owner = await registerOwner("Farm 1");
    const created = await createFarm(owner.accessToken, "Farm 2").expect(201);

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "FARM_CREATED", entityId: created.body.data.id },
    });
    expect(row.actorId).toBe(owner.userId);
    expect(row.farmId).toBe(created.body.data.id);
  });

  it("validates the farm name", async () => {
    const owner = await registerOwner();

    const response = await createFarm(owner.accessToken, "x").expect(400);
    expect(response.body.error.details).toHaveProperty("name");
  });
});

describe("choosing the active farm", () => {
  it("defaults to the oldest farm when no farm is named", async () => {
    const owner = await registerOwner("Oldest");
    await createFarm(owner.accessToken, "Newest").expect(201);

    const response = await request(testApp())
      .get("/api/v1/farms/me")
      .set(auth(owner.accessToken))
      .expect(200);

    expect(response.body.data.name).toBe("Oldest");
  });

  it("selects the named farm with X-Farm-Id", async () => {
    const owner = await registerOwner("Oldest");
    const second = await createFarm(owner.accessToken, "Second").expect(201);

    const response = await request(testApp())
      .get("/api/v1/farms/me")
      .set(auth(owner.accessToken))
      .set("X-Farm-Id", second.body.data.id)
      .expect(200);

    expect(response.body.data.name).toBe("Second");
  });

  it("refuses a farm the caller does not own", async () => {
    const ownerA = await registerOwner("Farm A");
    const ownerB = await registerOwner("Farm B");

    const response = await request(testApp())
      .get("/api/v1/farms/me")
      .set(auth(ownerA.accessToken))
      .set("X-Farm-Id", ownerB.farmId)
      .expect(403);

    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("keeps an owner's own farms' data apart", async () => {
    // The defect this guards against: `/farms/me/zones` resolving to "any farm I own" rather than
    // "the farm I selected". It is easy to introduce because one owner holding both makes a
    // cross-farm read look like a legitimate read.
    const owner = await registerOwner("Oldest");
    const second = await createFarm(owner.accessToken, "Second").expect(201);
    const secondId = second.body.data.id as string;

    await prisma.zone.create({ data: { farmId: secondId, name: "Only On Second", sortOrder: 9 } });

    const onFirst = await request(testApp())
      .get("/api/v1/farms/me/zones")
      .set(auth(owner.accessToken))
      .expect(200);
    expect(onFirst.body.data.map((zone: { name: string }) => zone.name)).not.toContain("Only On Second");

    const onSecond = await request(testApp())
      .get("/api/v1/farms/me/zones")
      .set(auth(owner.accessToken))
      .set("X-Farm-Id", secondId)
      .expect(200);
    expect(onSecond.body.data.map((zone: { name: string }) => zone.name)).toContain("Only On Second");
  });

  it("refuses to let a worker move to another farm", async () => {
    const owner = await registerOwner("Farm A");
    const otherOwner = await registerOwner("Farm B");
    const engineer = await registerWorker(owner.ownerCode, "ENGINEER");

    await request(testApp())
      .get("/api/v1/farms/me")
      .set(auth(engineer.accessToken))
      .set("X-Farm-Id", otherOwner.farmId)
      .expect(403);
  });
});

describe("only an owner may manage farms", () => {
  it("refuses to list farms to anyone but an owner", async () => {
    const owner = await registerOwner();

    for (const type of ["OPERATOR", "ENGINEER"] as const) {
      const worker = await registerWorker(owner.ownerCode, type);
      const response = await request(testApp())
        .get("/api/v1/farms")
        .set(auth(worker.accessToken))
        .expect(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    }
  });

  it("refuses to create a farm for anyone but an owner", async () => {
    const owner = await registerOwner();

    for (const type of ["OPERATOR", "ENGINEER"] as const) {
      const worker = await registerWorker(owner.ownerCode, type);
      await createFarm(worker.accessToken, "Not Mine").expect(403);
    }
  });

  it("requires a session", async () => {
    await request(testApp()).get("/api/v1/farms").expect(401);
    await request(testApp()).post("/api/v1/farms").send({ name: "Anonymous" }).expect(401);
  });
});
