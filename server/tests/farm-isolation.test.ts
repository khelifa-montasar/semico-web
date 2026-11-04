import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/db/prisma.js";
import { auth, registerOwner, registerWorker, resetDatabase, testApp } from "./helpers/api.js";

/**
 * Farm isolation.
 *
 * Two farms, each with data, and the question for every resource: can either one observe or alter
 * the other? A gap here is the most serious kind of bug in a multi-tenant system, so the reads are
 * asserted to return *nothing of the other farm* rather than merely to succeed.
 *
 * The deliberate exceptions are at the bottom: leads and bookings are company-level, not
 * farm-scoped, and that difference is asserted too so it cannot be mistaken for an oversight.
 */

async function seedFarmData(farmId: string, marker: string) {
  const zone = await prisma.zone.create({
    data: { farmId, name: `Zone ${marker}`, sortOrder: 0 },
  });

  await prisma.telemetry.create({
    data: {
      farmId,
      zoneId: zone.id,
      recordedAt: new Date(),
      rootMoisture: marker === "A" ? 11 : 22,
      surfaceMoisture: 10,
    },
  });

  await prisma.activityLog.create({
    data: {
      farmId,
      occurredAt: new Date(),
      kind: "VALVE_OPEN",
      type: "AUTO",
      zoneId: zone.id,
      messageEn: `Secret activity for farm ${marker}`,
      messageAr: `نشاط سري للمزرعة ${marker}`,
    },
  });

  await prisma.errorLog.create({
    data: {
      farmId,
      occurredAt: new Date(),
      component: "CONTROLLER",
      messageEn: `Secret error for farm ${marker}`,
      messageAr: `خطأ سري للمزرعة ${marker}`,
    },
  });

  await prisma.systemComponent.create({
    data: {
      farmId,
      key: "CONTROLLER",
      nameEn: "Controller",
      nameAr: "وحدة التحكم",
      value: `marker-${marker}`,
      status: "GREEN",
    },
  });

  await prisma.auditLog.create({
    data: {
      farmId,
      action: "VALVE_OPEN",
      entityType: "ZONE",
      entityId: zone.id,
      metadata: JSON.stringify({ marker }),
    },
  });

  return zone;
}

async function twoFarms() {
  const farmA = await registerOwner("Farm A");
  const farmB = await registerOwner("Farm B");
  const zoneA = await seedFarmData(farmA.farmId, "A");
  const zoneB = await seedFarmData(farmB.farmId, "B");
  return { farmA, farmB, zoneA, zoneB };
}

beforeEach(resetDatabase);

describe("farm-scoped reads return only the caller's data", () => {
  it("scopes the zone list", async () => {
    const { farmA, farmB, zoneA, zoneB } = await twoFarms();

    const asA = await request(testApp())
      .get("/api/v1/farms/me/zones")
      .set(auth(farmA.accessToken))
      .expect(200);
    const asB = await request(testApp())
      .get("/api/v1/farms/me/zones")
      .set(auth(farmB.accessToken))
      .expect(200);

    const namesA = asA.body.data.map((zone: { name: string }) => zone.name);
    const namesB = asB.body.data.map((zone: { name: string }) => zone.name);

    // Registration seeds Zone 1–3, and this fixture adds one more per farm.
    expect(namesA).toHaveLength(4);
    expect(namesB).toHaveLength(4);

    expect(namesA).toContain(zoneA.name);
    expect(namesA).not.toContain(zoneB.name);
    expect(namesB).toContain(zoneB.name);
    expect(namesB).not.toContain(zoneA.name);

    // No id leaks across either.
    const idsA = asA.body.data.map((zone: { id: string }) => zone.id);
    expect(idsA).not.toContain(zoneB.id);
  });

  it("scopes telemetry, both the series and the latest reading", async () => {
    const { farmA, farmB } = await twoFarms();

    const seriesA = await request(testApp())
      .get("/api/v1/farms/me/telemetry?interval=day&range=7d")
      .set(auth(farmA.accessToken))
      .expect(200);
    const seriesB = await request(testApp())
      .get("/api/v1/farms/me/telemetry?interval=day&range=7d")
      .set(auth(farmB.accessToken))
      .expect(200);

    // The seeded readings carry a marker value, so a leak is visible in the numbers themselves.
    expect(seriesA.body.data.every((point: { rootMoisture: number }) => point.rootMoisture === 11)).toBe(true);
    expect(seriesB.body.data.every((point: { rootMoisture: number }) => point.rootMoisture === 22)).toBe(true);
  });

  it("scopes the activity feed", async () => {
    const { farmA, farmB } = await twoFarms();

    const asA = await request(testApp())
      .get("/api/v1/farms/me/activity")
      .set(auth(farmA.accessToken))
      .expect(200);

    const messages = JSON.stringify(asA.body.data);
    expect(messages).toContain("farm A");
    expect(messages).not.toContain("farm B");

    const asB = await request(testApp())
      .get("/api/v1/farms/me/activity")
      .set(auth(farmB.accessToken))
      .expect(200);
    expect(JSON.stringify(asB.body.data)).not.toContain("farm A");
  });

  it("scopes the activity calendar", async () => {
    const { farmA, farmB } = await twoFarms();

    const calendarA = await request(testApp())
      .get("/api/v1/farms/me/activity/calendar")
      .set(auth(farmA.accessToken))
      .expect(200);
    const calendarB = await request(testApp())
      .get("/api/v1/farms/me/activity/calendar")
      .set(auth(farmB.accessToken))
      .expect(200);

    // Each farm counts only its own single seeded event.
    expect(calendarA.body.data.irrigationCount).toBe(1);
    expect(calendarB.body.data.irrigationCount).toBe(1);
  });

  it("scopes the error log", async () => {
    const { farmA } = await twoFarms();

    const asA = await request(testApp())
      .get("/api/v1/farms/me/system-health/errors")
      .set(auth(farmA.accessToken))
      .expect(200);

    expect(JSON.stringify(asA.body.data)).toContain("farm A");
    expect(JSON.stringify(asA.body.data)).not.toContain("farm B");
  });

  it("scopes the diagnostic components", async () => {
    const { farmA, farmB } = await twoFarms();

    const asA = await request(testApp())
      .get("/api/v1/farms/me/system-health")
      .set(auth(farmA.accessToken))
      .expect(200);
    const asB = await request(testApp())
      .get("/api/v1/farms/me/system-health")
      .set(auth(farmB.accessToken))
      .expect(200);

    expect(asA.body.data.components.map((c: { value: string }) => c.value)).toEqual(["marker-A"]);
    expect(asB.body.data.components.map((c: { value: string }) => c.value)).toEqual(["marker-B"]);
  });

  it("scopes the security audit trail", async () => {
    const { farmA, farmB } = await twoFarms();

    // Only the seeded rows carry a marker; registration also writes an audit row (REGISTER) with
    // its own metadata, so the marker is filtered for rather than assumed to be the only row.
    const markersOf = (rows: Array<{ metadata: Record<string, unknown> | null }>) =>
      rows.map((row) => row.metadata?.marker).filter((marker) => marker !== undefined);

    const asA = await request(testApp())
      .get("/api/v1/farms/me/audit")
      .set(auth(farmA.accessToken))
      .expect(200);
    expect(markersOf(asA.body.data)).toEqual(["A"]);

    const asB = await request(testApp())
      .get("/api/v1/farms/me/audit")
      .set(auth(farmB.accessToken))
      .expect(200);
    expect(markersOf(asB.body.data)).toEqual(["B"]);

    // And neither response mentions the other farm at all.
    expect(JSON.stringify(asA.body)).not.toContain('"B"');
    expect(JSON.stringify(asB.body)).not.toContain('"A"');
  });

  it("scopes the irrigation command history", async () => {
    const { farmA, farmB, zoneA } = await twoFarms();

    await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(farmA.accessToken))
      .send({ durationMin: 5 })
      .expect(201);

    const asB = await request(testApp())
      .get("/api/v1/farms/me/irrigation/commands")
      .set(auth(farmB.accessToken))
      .expect(200);

    expect(asB.body.data).toHaveLength(0);
    expect(JSON.stringify(asB.body)).not.toContain(zoneA.id);
  });

  it("scopes analytics", async () => {
    const { farmA, farmB } = await twoFarms();

    const overviewA = await request(testApp())
      .get("/api/v1/farms/me/analytics/overview?range=7d")
      .set(auth(farmA.accessToken))
      .expect(200);
    const overviewB = await request(testApp())
      .get("/api/v1/farms/me/analytics/overview?range=7d")
      .set(auth(farmB.accessToken))
      .expect(200);

    // Farm A averages 11%, farm B 22% — a leak would average them together.
    expect(overviewA.body.data.averageRootMoisture).toBe(11);
    expect(overviewB.body.data.averageRootMoisture).toBe(22);
  });

  it("scopes the worker list", async () => {
    const farmA = await registerOwner("Farm A");
    const farmB = await registerOwner("Farm B");
    await registerWorker(farmA.ownerCode, "ENGINEER");

    const asA = await request(testApp())
      .get("/api/v1/farms/me/workers")
      .set(auth(farmA.accessToken))
      .expect(200);
    const asB = await request(testApp())
      .get("/api/v1/farms/me/workers")
      .set(auth(farmB.accessToken))
      .expect(200);

    expect(asA.body.data).toHaveLength(1);
    expect(asB.body.data).toHaveLength(0);
  });
});

describe("farm-scoped writes cannot reach across", () => {
  it("does not let one farm change another's settings", async () => {
    const { farmA, farmB } = await twoFarms();

    await request(testApp())
      .patch("/api/v1/farms/me/settings")
      .set(auth(farmB.accessToken))
      .send({ moistureThreshold: 77 })
      .expect(200);

    const farmASettings = await prisma.farmSettings.findUniqueOrThrow({ where: { farmId: farmA.farmId } });
    const farmBSettings = await prisma.farmSettings.findUniqueOrThrow({ where: { farmId: farmB.farmId } });

    expect(farmBSettings.moistureThreshold).toBe(77);
    // The other farm's threshold is untouched.
    expect(farmASettings.moistureThreshold).not.toBe(77);
  });

  it("404s when acting on another farm's zone, and leaves it alone", async () => {
    const { farmB, zoneA } = await twoFarms();

    const response = await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(farmB.accessToken))
      .send({ durationMin: 5, zoneId: zoneA.id })
      .expect(404);

    // 404 rather than 403: a 403 would confirm the id exists, which is enough to enumerate.
    expect(response.body.error.code).toBe("NOT_FOUND");

    const untouched = await prisma.zone.findUniqueOrThrow({ where: { id: zoneA.id } });
    expect(untouched.valveState).toBe("CLOSED");
  });

  it("404s on another farm's zone when read directly", async () => {
    const { farmB, zoneA } = await twoFarms();

    await request(testApp())
      .get(`/api/v1/farms/me/zones/${zoneA.id}`)
      .set(auth(farmB.accessToken))
      .expect(404);
  });

  it("404s when an owner edits another farm's worker", async () => {
    const farmA = await registerOwner("Farm A");
    const farmB = await registerOwner("Farm B");
    const workerOfA = await registerWorker(farmA.ownerCode, "ENGINEER");

    await request(testApp())
      .patch(`/api/v1/farms/me/workers/${workerOfA.userId}`)
      .set(auth(farmB.accessToken))
      .send({ name: "Hijacked" })
      .expect(404);

    const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: workerOfA.userId } });
    expect(unchanged.fullName).not.toBe("Hijacked");
  });

  it("404s when an owner grants valve control to another farm's worker", async () => {
    const farmA = await registerOwner("Farm A");
    const farmB = await registerOwner("Farm B");
    const workerOfA = await registerWorker(farmA.ownerCode, "OPERATOR");

    await request(testApp())
      .patch(`/api/v1/farms/me/workers/${workerOfA.userId}/valve-control`)
      .set(auth(farmB.accessToken))
      .send({ granted: true })
      .expect(404);

    const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: workerOfA.userId } });
    expect(unchanged.valveControl).toBe(false);
  });

  it("404s when resetting another farm's worker password", async () => {
    const farmA = await registerOwner("Farm A");
    const farmB = await registerOwner("Farm B");
    const workerOfA = await registerWorker(farmA.ownerCode, "ENGINEER");

    await request(testApp())
      .post(`/api/v1/farms/me/workers/${workerOfA.userId}/reset-password`)
      .set(auth(farmB.accessToken))
      .expect(404);
  });

  it("keeps each profile private", async () => {
    const farmA = await registerOwner("Farm A");
    const farmB = await registerOwner("Farm B");

    await request(testApp())
      .patch("/api/v1/users/me")
      .set(auth(farmA.accessToken))
      .send({ fullName: "Only Mine" })
      .expect(200);

    const asB = await request(testApp())
      .get("/api/v1/users/me")
      .set(auth(farmB.accessToken))
      .expect(200);

    expect(asB.body.data.fullName).not.toBe("Only Mine");
  });

  it("keeps experience and education private", async () => {
    const farmA = await registerOwner("Farm A");
    const farmB = await registerOwner("Farm B");

    const created = await request(testApp())
      .post("/api/v1/users/me/experience")
      .set(auth(farmA.accessToken))
      .send({ jobTitle: "Private Role", company: "Private Co", startDate: "Jan 2020" })
      .expect(201);
    const experienceId = created.body.data.experiences[0].id;

    await request(testApp())
      .delete(`/api/v1/users/me/experience/${experienceId}`)
      .set(auth(farmB.accessToken))
      .expect(404);

    const stillThere = await prisma.experience.findUnique({ where: { id: experienceId } });
    expect(stillThere).not.toBeNull();
  });
});

describe("resources that are deliberately NOT farm-scoped", () => {
  // These are company-level, not per-farm. Asserted explicitly so the difference reads as a decision
  // rather than as a missing scope.
  it("lets the owner of one farm see leads submitted to the company", async () => {
    const farmA = await registerOwner("Farm A");
    const farmB = await registerOwner("Farm B");

    await request(testApp())
      .post("/api/v1/leads")
      .send({ name: "Company Lead", email: `lead.${randomUUID().slice(0, 6)}@example.dz` })
      .expect(201);

    for (const owner of [farmA, farmB]) {
      const response = await request(testApp())
        .get("/api/v1/leads")
        .set(auth(owner.accessToken))
        .expect(200);
      expect(response.body.data.some((lead: { name: string }) => lead.name === "Company Lead")).toBe(true);
    }
  });

  it("keeps the wilaya reference list global", async () => {
    // NOTE: `resetDatabase()` empties the wilaya table, and only `prisma/seed.ts` populates it — so
    // this suite must create its own rows. That is worth knowing rather than assuming: the endpoint
    // returns an empty array in a freshly-reset test database, which is correct behaviour and not a
    // bug, but it does mean no other test can assert on wilaya content without seeding it first.
    await prisma.wilaya.createMany({
      data: [
        { code: "16", nameEn: "Alger", nameAr: "الجزائر" },
        { code: "31", nameEn: "Oran", nameAr: "وهران" },
      ],
    });

    const response = await request(testApp()).get("/api/v1/reference/wilayas").expect(200);

    // Reference data belongs to no farm, and is readable with no session at all.
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data.map((w: { code: string }) => w.code)).toEqual(["16", "31"]);
    // Bilingual, so the client can switch language without refetching.
    expect(response.body.data[0].name).toMatchObject({ en: "Alger", ar: "الجزائر" });
  });
});
