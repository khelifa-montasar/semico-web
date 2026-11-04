import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/db/prisma.js";
import { auth, registerOwner, registerWorker, resetDatabase, testApp } from "./helpers/api.js";

/**
 * Analytics: the moisture series and the export window.
 *
 * V2 added a From/To picker to the export, which means the endpoints now have to honour an explicit
 * window rather than snapping to the nearest preset. These tests pin that, plus the two things that
 * are easy to get wrong with an export: the content type, and who is allowed to ask for it.
 */

const ZONE_ID_CACHE = new Map<string, string>();

async function seedReadings(farmId: string) {
  let zoneId = ZONE_ID_CACHE.get(farmId);
  if (!zoneId) {
    const zone = await prisma.zone.findFirstOrThrow({ where: { farmId }, orderBy: { sortOrder: "asc" } });
    zoneId = zone.id;
    ZONE_ID_CACHE.set(farmId, zoneId);
  }

  await prisma.telemetry.createMany({
    data: [
      { farmId, zoneId, recordedAt: new Date("2026-09-01T10:00:00.000Z"), rootMoisture: 11, surfaceMoisture: 9 },
      { farmId, zoneId, recordedAt: new Date("2026-09-02T10:00:00.000Z"), rootMoisture: 22, surfaceMoisture: 20 },
      { farmId, zoneId, recordedAt: new Date("2026-09-03T10:00:00.000Z"), rootMoisture: 33, surfaceMoisture: 31 },
    ],
  });
}

beforeEach(async () => {
  ZONE_ID_CACHE.clear();
  await resetDatabase();
});

describe("an explicit window", () => {
  it("narrows the moisture series to the requested days", async () => {
    const owner = await registerOwner();
    await seedReadings(owner.farmId);

    const response = await request(testApp())
      .get("/api/v1/farms/me/analytics/moisture")
      .query({ from: "2026-09-02T00:00:00.000Z", to: "2026-09-02T23:59:59.999Z" })
      .set(auth(owner.accessToken))
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].rootMoisture).toBe(22);
  });

  it("returns the whole window when it spans several days", async () => {
    const owner = await registerOwner();
    await seedReadings(owner.farmId);

    const response = await request(testApp())
      .get("/api/v1/farms/me/analytics/moisture")
      .query({ from: "2026-09-01T00:00:00.000Z", to: "2026-09-03T23:59:59.999Z" })
      .set(auth(owner.accessToken))
      .expect(200);

    expect(response.body.data.map((point: { rootMoisture: number }) => point.rootMoisture)).toEqual([
      11, 22, 33,
    ]);
  });

  it("rejects a window whose start is after its end", async () => {
    const owner = await registerOwner();

    const response = await request(testApp())
      .get("/api/v1/farms/me/analytics/moisture")
      .query({ from: "2026-09-03T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" })
      .set(auth(owner.accessToken))
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("rejects a date that is not a full ISO instant", async () => {
    // A bare `YYYY-MM-DD` is what a date picker produces; sending it unchanged would be an
    // off-by-timezone bug, so the API asks for an instant and says so.
    const owner = await registerOwner();

    const response = await request(testApp())
      .get("/api/v1/farms/me/analytics/moisture")
      .query({ from: "2026-09-02", to: "2026-09-03" })
      .set(auth(owner.accessToken))
      .expect(400);

    expect(response.body.error.details).toHaveProperty("from");
  });
});

describe("the CSV export", () => {
  it("exports only the requested window", async () => {
    const owner = await registerOwner();
    await seedReadings(owner.farmId);

    const response = await request(testApp())
      .get("/api/v1/farms/me/analytics/export")
      .query({ from: "2026-09-02T00:00:00.000Z", to: "2026-09-02T23:59:59.999Z" })
      .set(auth(owner.accessToken))
      .expect(200);

    const rows = String(response.text).trim().split("\n");
    expect(rows[0]).toBe("at,label,root_moisture,surface_moisture");
    // Header plus exactly the one reading inside the window.
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain(",22,20");
  });

  it("sends it as a downloadable file, not as JSON", async () => {
    const owner = await registerOwner();
    await seedReadings(owner.farmId);

    const response = await request(testApp())
      .get("/api/v1/farms/me/analytics/export")
      .set(auth(owner.accessToken))
      .expect(200);

    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toContain("attachment");
    expect(response.headers["content-disposition"]).toContain(".csv");
  });

  it("refuses an operator", async () => {
    // Reading a chart and taking the dataset away are different permissions.
    const owner = await registerOwner();
    const operator = await registerWorker(owner.ownerCode, "OPERATOR");

    const response = await request(testApp())
      .get("/api/v1/farms/me/analytics/export")
      .set(auth(operator.accessToken))
      .expect(403);

    expect(response.body.error.code).toBe("EXPORT_NOT_PERMITTED");
  });

  it("allows an engineer", async () => {
    const owner = await registerOwner();
    const engineer = await registerWorker(owner.ownerCode, "ENGINEER");

    await request(testApp())
      .get("/api/v1/farms/me/analytics/export")
      .set(auth(engineer.accessToken))
      .expect(200);
  });
});

describe("format=json", () => {
  it("returns the series as JSON instead of honouring the parameter in name only", async () => {
    // The schema has always advertised `format=json`; the controller used to ignore it and send CSV
    // whatever was asked for. Accepting a parameter and then not honouring it is worse than not
    // accepting it, so this asserts the option now does something.
    const owner = await registerOwner();
    await seedReadings(owner.farmId);

    const response = await request(testApp())
      .get("/api/v1/farms/me/analytics/export")
      .query({ format: "json" })
      .set(auth(owner.accessToken))
      .expect(200);

    expect(response.headers["content-type"]).toContain("application/json");
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it("still defaults to CSV", async () => {
    const owner = await registerOwner();

    const response = await request(testApp())
      .get("/api/v1/farms/me/analytics/export")
      .set(auth(owner.accessToken))
      .expect(200);

    expect(response.headers["content-type"]).toContain("text/csv");
  });

  it("rejects an unknown format", async () => {
    const owner = await registerOwner();

    await request(testApp())
      .get("/api/v1/farms/me/analytics/export")
      .query({ format: "xlsx" })
      .set(auth(owner.accessToken))
      .expect(400);
  });
});
