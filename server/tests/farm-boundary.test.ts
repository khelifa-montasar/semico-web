import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/db/prisma.js";
import { auth, registerOwner, registerWorker, resetDatabase, testApp } from "./helpers/api.js";

/**
 * The owner-drawn farm outline.
 *
 * A polygon from a map click handler is untrusted input like any other, so the schema bounds it and
 * the service refuses to hand back anything it cannot parse. The property that matters most is
 * that the shape belongs to ONE farm: `/farms/me/boundary` is scoped by the `X-Farm-Id` header, and
 * an owner with two farms must not be able to write one farm's outline onto the other.
 */

const TRIANGLE: Array<[number, number]> = [
  [36.7162, 3.1849],
  [36.7164, 3.1849],
  [36.7164, 3.1852],
];

const SQUARE: Array<[number, number]> = [
  [36.717, 3.185],
  [36.7175, 3.185],
  [36.7175, 3.1855],
  [36.717, 3.1855],
];

function saveBoundary(token: string, boundary: Array<[number, number]>, farmId?: string) {
  const call = request(testApp()).patch("/api/v1/farms/me/boundary").set(auth(token));
  if (farmId) call.set("X-Farm-Id", farmId);
  return call.send({ boundary });
}

beforeEach(resetDatabase);

describe("saving the shape", () => {
  it("stores the points and returns them", async () => {
    const owner = await registerOwner();

    const response = await saveBoundary(owner.accessToken, TRIANGLE).expect(200);

    expect(response.body.data.boundary).toEqual(TRIANGLE);
  });

  it("reads back from the farm, not from the mutation response", async () => {
    const owner = await registerOwner();
    await saveBoundary(owner.accessToken, TRIANGLE).expect(200);

    const farm = await request(testApp())
      .get("/api/v1/farms/me")
      .set(auth(owner.accessToken))
      .expect(200);

    expect(farm.body.data.boundary).toEqual(TRIANGLE);
  });

  it("starts as null, so 'never drawn' is distinguishable from 'drawn'", async () => {
    const owner = await registerOwner();

    const farm = await request(testApp())
      .get("/api/v1/farms/me")
      .set(auth(owner.accessToken))
      .expect(200);

    expect(farm.body.data.boundary).toBeNull();
  });

  it("replaces the previous shape rather than appending to it", async () => {
    const owner = await registerOwner();

    await saveBoundary(owner.accessToken, TRIANGLE).expect(200);
    const response = await saveBoundary(owner.accessToken, SQUARE).expect(200);

    expect(response.body.data.boundary).toEqual(SQUARE);
    expect(response.body.data.boundary).toHaveLength(4);
  });

  it("records the change in the audit trail without copying the coordinates in", async () => {
    const owner = await registerOwner();
    await saveBoundary(owner.accessToken, TRIANGLE).expect(200);

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "PROFILE_UPDATED", entityType: "FARM", entityId: owner.farmId },
    });

    expect(JSON.parse(row.metadata ?? "{}")).toMatchObject({ fields: ["boundary"], points: 3 });
    // A shape is not a secret, but the trail records what changed, not the payload.
    expect(row.metadata).not.toContain("36.7162");
  });
});

describe("validation", () => {
  it("refuses fewer than three points", async () => {
    const owner = await registerOwner();

    const response = await saveBoundary(owner.accessToken, [
      [36.7162, 3.1849],
      [36.7164, 3.1849],
    ]).expect(400);

    expect(response.body.error.details).toHaveProperty("boundary");
  });

  it("refuses a latitude outside the globe", async () => {
    const owner = await registerOwner();

    await saveBoundary(owner.accessToken, [
      [120, 3.1849],
      [36.7164, 3.1849],
      [36.7164, 3.1852],
    ]).expect(400);
  });

  it("refuses a longitude outside the globe", async () => {
    const owner = await registerOwner();

    await saveBoundary(owner.accessToken, [
      [36.7162, 200],
      [36.7164, 3.1849],
      [36.7164, 3.1852],
    ]).expect(400);
  });

  it("refuses a point that is not a pair", async () => {
    const owner = await registerOwner();

    await request(testApp())
      .patch("/api/v1/farms/me/boundary")
      .set(auth(owner.accessToken))
      .send({ boundary: [[36.7162, 3.1849], [36.7164], [36.7164, 3.1852]] })
      .expect(400);
  });
});

describe("access", () => {
  it("refuses workers of either type", async () => {
    const owner = await registerOwner();

    for (const type of ["OPERATOR", "ENGINEER"] as const) {
      const worker = await registerWorker(owner.ownerCode, type);
      const response = await saveBoundary(worker.accessToken, TRIANGLE).expect(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    }
  });

  it("requires a session", async () => {
    await request(testApp()).patch("/api/v1/farms/me/boundary").send({ boundary: TRIANGLE }).expect(401);
  });
});

describe("the shape belongs to one farm", () => {
  it("keeps an owner's two farms' outlines apart", async () => {
    const owner = await registerOwner("Farm A");

    const second = await request(testApp())
      .post("/api/v1/farms")
      .set(auth(owner.accessToken))
      .send({ name: "Farm B" })
      .expect(201);
    const secondId = second.body.data.id as string;

    await saveBoundary(owner.accessToken, TRIANGLE).expect(200);
    await saveBoundary(owner.accessToken, SQUARE, secondId).expect(200);

    const firstFarm = await request(testApp())
      .get("/api/v1/farms/me")
      .set(auth(owner.accessToken))
      .expect(200);
    const otherFarm = await request(testApp())
      .get("/api/v1/farms/me")
      .set(auth(owner.accessToken))
      .set("X-Farm-Id", secondId)
      .expect(200);

    expect(firstFarm.body.data.boundary).toEqual(TRIANGLE);
    expect(otherFarm.body.data.boundary).toEqual(SQUARE);
  });
});
