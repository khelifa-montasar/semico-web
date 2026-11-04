import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/db/prisma.js";
import { auth, registerOwner, registerWorker, resetDatabase, testApp } from "./helpers/api.js";

beforeEach(resetDatabase);

describe("farm profile configuration", () => {
  it("saves and clears coordinates as a pair", async () => {
    const owner = await registerOwner();

    const saved = await request(testApp())
      .patch("/api/v1/farms/me")
      .set(auth(owner.accessToken))
      .send({ name: "North Farm", latitude: 36.7525, longitude: 3.04197, landAreaHa: 2.5 })
      .expect(200);

    expect(saved.body.data).toMatchObject({
      name: "North Farm",
      latitude: 36.7525,
      longitude: 3.04197,
      landAreaHa: 2.5,
    });

    const cleared = await request(testApp())
      .patch("/api/v1/farms/me")
      .set(auth(owner.accessToken))
      .send({ latitude: null, longitude: null })
      .expect(200);
    expect(cleared.body.data.latitude).toBeNull();
    expect(cleared.body.data.longitude).toBeNull();
  });

  it("rejects incomplete or out-of-range coordinate pairs", async () => {
    const owner = await registerOwner();

    await request(testApp())
      .patch("/api/v1/farms/me")
      .set(auth(owner.accessToken))
      .send({ latitude: 36.75 })
      .expect(400);

    await request(testApp())
      .patch("/api/v1/farms/me")
      .set(auth(owner.accessToken))
      .send({ latitude: 91, longitude: 3 })
      .expect(400);
  });

  it("stores irrigation preferences and a validated timezone per farm", async () => {
    const owner = await registerOwner();

    const defaults = await request(testApp())
      .get("/api/v1/farms/me/settings")
      .set(auth(owner.accessToken))
      .expect(200);
    expect(defaults.body.data).toMatchObject({ zoneCount: 3, sensorsPerZone: 2 });

    await request(testApp())
      .patch("/api/v1/farms/me/settings")
      .set(auth(owner.accessToken))
      .send({ autoIrrigation: false, pushNotifications: false, timezone: "Africa/Tunis", zoneCount: 5, sensorsPerZone: 4 })
      .expect(200);

    const response = await request(testApp())
      .get("/api/v1/farms/me/settings")
      .set(auth(owner.accessToken))
      .expect(200);
    expect(response.body.data).toMatchObject({
      autoIrrigation: false,
      pushNotifications: false,
      timezone: "Africa/Tunis",
      zoneCount: 5,
      sensorsPerZone: 4,
    });

    await request(testApp())
      .patch("/api/v1/farms/me/settings")
      .set(auth(owner.accessToken))
      .send({ timezone: "Not/A_Timezone" })
      .expect(400);

    await request(testApp())
      .patch("/api/v1/farms/me/settings")
      .set(auth(owner.accessToken))
      .send({ zoneCount: 0 })
      .expect(400);
  });
});

describe("farm zone configuration", () => {
  it("creates, updates, and audits zones within the selected farm", async () => {
    const owner = await registerOwner();

    const created = await request(testApp())
      .post("/api/v1/farms/me/zones")
      .set(auth(owner.accessToken))
      .send({ name: "Orchard", sortOrder: 3 })
      .expect(201);
    expect(created.body.data).toMatchObject({ name: "Orchard", sortOrder: 3 });

    const updated = await request(testApp())
      .patch(`/api/v1/farms/me/zones/${created.body.data.id}`)
      .set(auth(owner.accessToken))
      .send({ name: "North Orchard", sortOrder: 1 })
      .expect(200);
    expect(updated.body.data).toMatchObject({ name: "North Orchard", sortOrder: 1 });

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: created.body.data.id, entityType: "ZONE", action: "PROFILE_UPDATED" },
    });
    expect(audit.farmId).toBe(owner.farmId);
    expect(audit.actorId).toBe(owner.userId);
  });

  it("refuses zone configuration from workers and across farms", async () => {
    const owner = await registerOwner("Farm A");
    const worker = await registerWorker(owner.ownerCode, "ENGINEER");
    const zone = await prisma.zone.findFirstOrThrow({ where: { farmId: owner.farmId } });

    await request(testApp())
      .patch(`/api/v1/farms/me/zones/${zone.id}`)
      .set(auth(worker.accessToken))
      .send({ name: "Unauthorized" })
      .expect(403);

    const otherFarm = await request(testApp())
      .post("/api/v1/farms")
      .set(auth(owner.accessToken))
      .send({ name: "Farm B" })
      .expect(201);
    await request(testApp())
      .patch(`/api/v1/farms/me/zones/${zone.id}`)
      .set(auth(owner.accessToken))
      .set("X-Farm-Id", otherFarm.body.data.id)
      .send({ name: "Cross-farm edit" })
      .expect(404);

    const otherFarmSettings = await request(testApp())
      .get("/api/v1/farms/me/settings")
      .set(auth(owner.accessToken))
      .set("X-Farm-Id", otherFarm.body.data.id)
      .expect(200);
    expect(otherFarmSettings.body.data).toMatchObject({ zoneCount: 3, sensorsPerZone: 2 });
  });
});
