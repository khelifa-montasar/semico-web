import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/db/prisma.js";
import { auth, registerOwner, resetDatabase, testApp } from "./helpers/api.js";
import { buildCast } from "./helpers/roles.js";

/**
 * Valve control.
 *
 * The only endpoints in the system that cause a physical effect, so the boundaries get tested
 * properly: the duration limits, which zone was actually acted on, what the command record says, and
 * what the farmer-facing feed shows afterwards.
 */

/** The farm's default zone — the first by sort order, which is what an omitted zoneId resolves to. */
async function firstZone(farmId: string) {
  return prisma.zone.findFirstOrThrow({ where: { farmId }, orderBy: { sortOrder: "asc" } });
}

beforeEach(resetDatabase);

describe("duration boundaries", () => {
  const accepted = [1, 10, 120];
  const rejected = [0, -1, 121, 1000, 1.5, 10.5];

  for (const durationMin of accepted) {
    it(`accepts ${durationMin} minutes`, async () => {
      const owner = await registerOwner();

      const response = await request(testApp())
        .post("/api/v1/farms/me/irrigation/irrigate")
        .set(auth(owner.accessToken))
        .send({ durationMin })
        .expect(201);

      expect(response.body.data.durationMin).toBe(durationMin);
    });
  }

  for (const durationMin of rejected) {
    it(`rejects ${durationMin} minutes`, async () => {
      const owner = await registerOwner();

      const response = await request(testApp())
        .post("/api/v1/farms/me/irrigation/irrigate")
        .set(auth(owner.accessToken))
        .send({ durationMin })
        .expect(400);

      expect(response.body.error.code).toBe("VALIDATION_FAILED");
      expect(response.body.error.details).toHaveProperty("durationMin");
    });
  }

  it("rejects a missing duration", async () => {
    const owner = await registerOwner();

    const response = await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(owner.accessToken))
      .send({})
      .expect(400);

    expect(response.body.error.details).toHaveProperty("durationMin");
  });

  it("rejects a duration sent as a string", async () => {
    // The UI clamps to a number, but the API must not coerce arbitrary input.
    const owner = await registerOwner();

    await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(owner.accessToken))
      .send({ durationMin: "ten" })
      .expect(400);
  });
});

describe("which zone is acted on", () => {
  it("defaults to the farm's first zone when none is given", async () => {
    const owner = await registerOwner();
    const expected = await firstZone(owner.farmId);

    const response = await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(owner.accessToken))
      .send({ durationMin: 5 })
      .expect(201);

    expect(response.body.data.zoneId).toBe(expected.id);
    expect(response.body.data.zoneName).toBe(expected.name);
  });

  it("acts on an explicitly named zone", async () => {
    const owner = await registerOwner();
    const zones = await prisma.zone.findMany({ where: { farmId: owner.farmId }, orderBy: { sortOrder: "asc" } });
    const third = zones[2];

    const response = await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(owner.accessToken))
      .send({ durationMin: 5, zoneId: third?.id })
      .expect(201);

    expect(response.body.data.zoneId).toBe(third?.id);

    // And THAT zone's valve moved, not the default one.
    const moved = await prisma.zone.findUniqueOrThrow({ where: { id: third?.id ?? "" } });
    const untouched = await prisma.zone.findUniqueOrThrow({ where: { id: zones[0]?.id ?? "" } });
    expect(moved.valveState).toBe("OPEN");
    expect(untouched.valveState).toBe("CLOSED");
  });

  it("404s on a zone id that does not exist", async () => {
    const owner = await registerOwner();

    await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(owner.accessToken))
      .send({ durationMin: 5, zoneId: "no-such-zone" })
      .expect(404);
  });
});

describe("what the command records", () => {
  it("records the action, duration, zone, actor and an executed status", async () => {
    const cast = await buildCast();

    const response = await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(cast.owner.accessToken))
      .send({ durationMin: 15 })
      .expect(201);

    expect(response.body.data).toMatchObject({
      action: "OPEN",
      durationMin: 15,
      status: "EXECUTED",
      issuedById: cast.owner.userId,
      issuedByName: "Test Owner",
    });
    expect(response.body.data.executedAt).toBeTruthy();
    expect(response.body.data.requestedAt).toBeTruthy();
  });

  it("records a close with no duration", async () => {
    const owner = await registerOwner();

    const response = await request(testApp())
      .post("/api/v1/farms/me/irrigation/valve")
      .set(auth(owner.accessToken))
      .send({ action: "CLOSE" })
      .expect(201);

    expect(response.body.data).toMatchObject({ action: "CLOSE", durationMin: null });
  });

  it("moves the valve both ways", async () => {
    const owner = await registerOwner();
    const zone = await firstZone(owner.farmId);

    await request(testApp())
      .post("/api/v1/farms/me/irrigation/valve")
      .set(auth(owner.accessToken))
      .send({ action: "OPEN" })
      .expect(201);
    expect((await prisma.zone.findUniqueOrThrow({ where: { id: zone.id } })).valveState).toBe("OPEN");

    await request(testApp())
      .post("/api/v1/farms/me/irrigation/valve")
      .set(auth(owner.accessToken))
      .send({ action: "CLOSE" })
      .expect(201);
    expect((await prisma.zone.findUniqueOrThrow({ where: { id: zone.id } })).valveState).toBe("CLOSED");
  });

  it("rejects an unknown valve action", async () => {
    const owner = await registerOwner();

    const response = await request(testApp())
      .post("/api/v1/farms/me/irrigation/valve")
      .set(auth(owner.accessToken))
      .send({ action: "TOGGLE" })
      .expect(400);

    expect(response.body.error.details).toHaveProperty("action");
  });

  it("records one command per request, not one per zone", async () => {
    const owner = await registerOwner();

    for (let i = 0; i < 3; i += 1) {
      await request(testApp())
        .post("/api/v1/farms/me/irrigation/irrigate")
        .set(auth(owner.accessToken))
        .send({ durationMin: 5 })
        .expect(201);
    }

    expect(await prisma.irrigationCommand.count({ where: { farmId: owner.farmId } })).toBe(3);
  });

  it("shows the command in the history, newest first", async () => {
    const owner = await registerOwner();

    await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(owner.accessToken))
      .send({ durationMin: 3 })
      .expect(201);
    await request(testApp())
      .post("/api/v1/farms/me/irrigation/valve")
      .set(auth(owner.accessToken))
      .send({ action: "CLOSE" })
      .expect(201);

    const history = await request(testApp())
      .get("/api/v1/farms/me/irrigation/commands")
      .set(auth(owner.accessToken))
      .expect(200);

    expect(history.body.data).toHaveLength(2);
    expect(history.body.meta.total).toBe(2);
    expect(history.body.data[0].action).toBe("CLOSE");
  });

  it("filters the history by zone and by status", async () => {
    const owner = await registerOwner();
    const zones = await prisma.zone.findMany({ where: { farmId: owner.farmId }, orderBy: { sortOrder: "asc" } });

    await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(owner.accessToken))
      .send({ durationMin: 5, zoneId: zones[0]?.id })
      .expect(201);
    await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(owner.accessToken))
      .send({ durationMin: 5, zoneId: zones[1]?.id })
      .expect(201);

    const byZone = await request(testApp())
      .get(`/api/v1/farms/me/irrigation/commands?zoneId=${zones[0]?.id}`)
      .set(auth(owner.accessToken))
      .expect(200);
    expect(byZone.body.data).toHaveLength(1);
    expect(byZone.body.data[0].zoneId).toBe(zones[0]?.id);

    const byStatus = await request(testApp())
      .get("/api/v1/farms/me/irrigation/commands?status=EXECUTED")
      .set(auth(owner.accessToken))
      .expect(200);
    expect(byStatus.body.data).toHaveLength(2);

    const noMatches = await request(testApp())
      .get("/api/v1/farms/me/irrigation/commands?status=PENDING")
      .set(auth(owner.accessToken))
      .expect(200);
    expect(noMatches.body.data).toHaveLength(0);
  });

  it("caps the page size rather than dumping the table", async () => {
    const owner = await registerOwner();

    for (let i = 0; i < 3; i += 1) {
      await request(testApp())
        .post("/api/v1/farms/me/irrigation/irrigate")
        .set(auth(owner.accessToken))
        .send({ durationMin: 5 })
        .expect(201);
    }

    const paged = await request(testApp())
      .get("/api/v1/farms/me/irrigation/commands?pageSize=2")
      .set(auth(owner.accessToken))
      .expect(200);

    expect(paged.body.data).toHaveLength(2);
    expect(paged.body.meta).toMatchObject({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
  });
});

describe("the farmer-facing feed records the action", () => {
  it("writes a MANUAL feed row attributed to the actor", async () => {
    const cast = await buildCast();

    await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(cast.operatorValve.accessToken))
      .send({ durationMin: 12 })
      .expect(201);

    const feed = await prisma.activityLog.findFirstOrThrow({
      where: { farmId: cast.farmId, kind: "VALVE_OPEN" },
    });

    // A human pressed a button, so it is MANUAL — the automatic path is the scheduler.
    expect(feed.type).toBe("MANUAL");
    expect(feed.actorId).toBe(cast.operatorValve.userId);
    expect(feed.messageEn).toContain("Valve opened");
    expect(feed.messageAr).toBeTruthy();

    // And it reaches the API the Activity page reads.
    const api = await request(testApp())
      .get("/api/v1/farms/me/activity?type=MANUAL")
      .set(auth(cast.operatorValve.accessToken))
      .expect(200);

    expect(api.body.data.some((row: { kind: string }) => row.kind === "VALVE_OPEN")).toBe(true);
  });

  it("names the operator, not the owner, when an operator acts", async () => {
    const cast = await buildCast();

    await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(cast.operatorValve.accessToken))
      .send({ durationMin: 5 })
      .expect(201);

    const api = await request(testApp())
      .get("/api/v1/farms/me/activity?type=MANUAL")
      .set(auth(cast.owner.accessToken))
      .expect(200);

    const row = api.body.data.find((entry: { kind: string }) => entry.kind === "VALVE_OPEN");
    expect(row.actorName).toBe("Test Worker");
    expect(row.actorName).not.toBe("Test Owner");
  });
});

describe("capability is enforced on both actuating endpoints", () => {
  it("refuses every non-capable role on both routes", async () => {
    const cast = await buildCast();

    for (const user of [cast.operatorPlain, cast.engineer]) {
      await request(testApp())
        .post("/api/v1/farms/me/irrigation/irrigate")
        .set(auth(user.accessToken))
        .send({ durationMin: 5 })
        .expect(403);

      await request(testApp())
        .post("/api/v1/farms/me/irrigation/valve")
        .set(auth(user.accessToken))
        .send({ action: "CLOSE" })
        .expect(403);
    }
  });

  it("leaves the valve untouched when a request is refused", async () => {
    const cast = await buildCast();
    const zone = await firstZone(cast.farmId);

    await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(cast.engineer.accessToken))
      .send({ durationMin: 5 })
      .expect(403);

    // A refused command must have no physical effect and leave no record.
    const untouched = await prisma.zone.findUniqueOrThrow({ where: { id: zone.id } });
    expect(untouched.valveState).toBe("CLOSED");
    expect(await prisma.irrigationCommand.count({ where: { farmId: cast.farmId } })).toBe(0);
  });
});
