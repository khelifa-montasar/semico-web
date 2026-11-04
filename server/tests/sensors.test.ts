import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/db/prisma.js";
import { auth, registerOwner, resetDatabase, testApp } from "./helpers/api.js";

/**
 * Zone-scoped sensors, and the location on each error log.
 *
 * The System Health page has to render 50+ sensors grouped by zone, so the API groups them rather
 * than shipping a flat list the client reduces on every render. These tests pin that grouping, the
 * per-zone online/offline counts it carries, and the ordering — which comes from the farm's own
 * zone order, not insertion order.
 */

async function zonesOf(farmId: string) {
  return prisma.zone.findMany({ where: { farmId }, orderBy: { sortOrder: "asc" } });
}

function addSensors(
  farmId: string,
  zoneId: string,
  count: number,
  options: { prefix: string; offline?: number[] },
) {
  const now = Date.now();
  return prisma.sensor.createMany({
    data: Array.from({ length: count }, (_, index) => ({
      farmId,
      zoneId,
      key: `${options.prefix}-S${index + 1}`,
      connection: options.offline?.includes(index) ? "OFFLINE" : "ONLINE",
      lastSeenAt: new Date(now - (index + 1) * 60_000),
      batteryPct: 90 - index,
      sortOrder: index,
    })),
  });
}

beforeEach(resetDatabase);

describe("sensors grouped by zone", () => {
  it("groups each sensor under its zone", async () => {
    const owner = await registerOwner();
    const [zone1, zone2] = await zonesOf(owner.farmId);

    await addSensors(owner.farmId, zone1!.id, 3, { prefix: "Z1" });
    await addSensors(owner.farmId, zone2!.id, 2, { prefix: "Z2" });

    const response = await request(testApp())
      .get("/api/v1/farms/me/sensors")
      .set(auth(owner.accessToken))
      .expect(200);

    expect(response.body.data).toHaveLength(2);
    expect(response.body.data[0]).toMatchObject({
      zoneId: zone1!.id,
      zoneName: zone1!.name,
      onlineCount: 3,
      offlineCount: 0,
    });
    expect(response.body.data[0].sensors).toHaveLength(3);
    expect(response.body.data[1].sensors).toHaveLength(2);
  });

  it("counts offline sensors per zone", async () => {
    const owner = await registerOwner();
    const [zone1] = await zonesOf(owner.farmId);

    await addSensors(owner.farmId, zone1!.id, 5, { prefix: "Z1", offline: [1, 3] });

    const response = await request(testApp())
      .get("/api/v1/farms/me/sensors")
      .set(auth(owner.accessToken))
      .expect(200);

    expect(response.body.data[0]).toMatchObject({ onlineCount: 3, offlineCount: 2 });
    expect(
      response.body.data[0].sensors.filter((sensor: { connection: string }) => sensor.connection === "OFFLINE"),
    ).toHaveLength(2);
  });

  it("returns the sensor fields the table renders, including a timestamp", async () => {
    const owner = await registerOwner();
    const [zone1] = await zonesOf(owner.farmId);
    await addSensors(owner.farmId, zone1!.id, 1, { prefix: "Z1" });

    const response = await request(testApp())
      .get("/api/v1/farms/me/sensors")
      .set(auth(owner.accessToken))
      .expect(200);

    const sensor = response.body.data[0].sensors[0];
    expect(sensor).toMatchObject({
      key: "Z1-S1",
      zoneId: zone1!.id,
      zoneName: zone1!.name,
      connection: "ONLINE",
    });
    expect(Number.isNaN(Date.parse(sensor.lastSeenAt)), "lastSeenAt is not a date").toBe(false);
    expect(sensor).not.toHaveProperty("batteryPct", undefined);
  });

  it("orders zones by their own sortOrder, not by insertion", async () => {
    // The zone order is the farm's, and the client must not have to sort. Create the sensors for
    // the LAST zone first, so insertion order and sortOrder disagree.
    const owner = await registerOwner();
    const zones = await zonesOf(owner.farmId);

    await addSensors(owner.farmId, zones[2]!.id, 1, { prefix: "Z3" });
    await addSensors(owner.farmId, zones[0]!.id, 1, { prefix: "Z1" });
    await addSensors(owner.farmId, zones[1]!.id, 1, { prefix: "Z2" });

    const response = await request(testApp())
      .get("/api/v1/farms/me/sensors")
      .set(auth(owner.accessToken))
      .expect(200);

    expect(response.body.data.map((group: { zoneName: string }) => group.zoneName)).toEqual(
      zones.map((zone) => zone.name),
    );
  });

  it("handles more than 50 sensors without dropping any", async () => {
    // The requirement that motivates grouping. A paginated or capped response would silently lose
    // sensors, and the 51st is exactly where that would first show.
    const owner = await registerOwner();
    const [zone1, zone2, zone3] = await zonesOf(owner.farmId);

    await addSensors(owner.farmId, zone1!.id, 20, { prefix: "Z1" });
    await addSensors(owner.farmId, zone2!.id, 20, { prefix: "Z2" });
    await addSensors(owner.farmId, zone3!.id, 16, { prefix: "Z3" });

    const response = await request(testApp())
      .get("/api/v1/farms/me/sensors")
      .set(auth(owner.accessToken))
      .expect(200);

    const total = response.body.data.reduce(
      (sum: number, group: { sensors: unknown[] }) => sum + group.sensors.length,
      0,
    );
    expect(total).toBe(56);
  });

  it("omits a zone that has no sensors", async () => {
    // An empty group would render an empty card and invite the reader to think something is wrong
    // with the zone rather than with the absence of hardware.
    const owner = await registerOwner();
    const [zone1] = await zonesOf(owner.farmId);
    await addSensors(owner.farmId, zone1!.id, 2, { prefix: "Z1" });

    const response = await request(testApp())
      .get("/api/v1/farms/me/sensors")
      .set(auth(owner.accessToken))
      .expect(200);

    expect(response.body.data).toHaveLength(1);
  });

  it("never shows another farm's sensors", async () => {
    const farmA = await registerOwner("Farm A");
    const farmB = await registerOwner("Farm B");
    const [zoneA] = await zonesOf(farmA.farmId);
    const [zoneB] = await zonesOf(farmB.farmId);

    await addSensors(farmA.farmId, zoneA!.id, 3, { prefix: "A" });
    await addSensors(farmB.farmId, zoneB!.id, 2, { prefix: "B" });

    const asA = await request(testApp())
      .get("/api/v1/farms/me/sensors")
      .set(auth(farmA.accessToken))
      .expect(200);

    expect(asA.body.data[0].sensors.map((sensor: { key: string }) => sensor.key)).toEqual([
      "A-S1",
      "A-S2",
      "A-S3",
    ]);
  });

  it("requires authentication", async () => {
    await request(testApp()).get("/api/v1/farms/me/sensors").expect(401);
  });
});

describe("error log location", () => {
  async function seedErrors(farmId: string, zoneId: string) {
    await prisma.errorLog.createMany({
      data: [
        {
          farmId,
          occurredAt: new Date("2026-10-20T10:00:00.000Z"),
          component: "MOISTURE_SENSOR_B",
          messageEn: "Sensor fault",
          messageAr: "خلل في المستشعر",
          zoneId,
          sensorKey: "Z1-S4",
        },
        {
          farmId,
          occurredAt: new Date("2026-10-20T09:00:00.000Z"),
          component: "FLOW_METER",
          messageEn: "Low flow",
          messageAr: "تدفق منخفض",
          zoneId,
          sensorKey: null,
        },
        {
          farmId,
          occurredAt: new Date("2026-10-20T08:00:00.000Z"),
          component: "CONTROLLER",
          messageEn: "Firmware update",
          messageAr: "تحديث البرنامج الثابت",
          zoneId: null,
          sensorKey: null,
        },
      ],
    });
  }

  it("names the zone and the sensor for a sensor-scoped error", async () => {
    const owner = await registerOwner();
    const [zone1] = await zonesOf(owner.farmId);
    await seedErrors(owner.farmId, zone1!.id);

    const response = await request(testApp())
      .get("/api/v1/farms/me/system-health/errors")
      .set(auth(owner.accessToken))
      .expect(200);

    expect(response.body.data[0].location).toEqual({
      zoneId: zone1!.id,
      zoneName: zone1!.name,
      sensorKey: "Z1-S4",
    });
  });

  it("names the zone with no sensor for a zone-scoped error", async () => {
    const owner = await registerOwner();
    const [zone1] = await zonesOf(owner.farmId);
    await seedErrors(owner.farmId, zone1!.id);

    const response = await request(testApp())
      .get("/api/v1/farms/me/system-health/errors")
      .set(auth(owner.accessToken))
      .expect(200);

    expect(response.body.data[1].location).toEqual({
      zoneId: zone1!.id,
      zoneName: zone1!.name,
      sensorKey: null,
    });
  });

  it("reports a null location for a farm-wide error", async () => {
    // Rather than omitting the field, so the client renders a consistent dash instead of having to
    // distinguish "missing" from "empty".
    const owner = await registerOwner();
    const [zone1] = await zonesOf(owner.farmId);
    await seedErrors(owner.farmId, zone1!.id);

    const response = await request(testApp())
      .get("/api/v1/farms/me/system-health/errors")
      .set(auth(owner.accessToken))
      .expect(200);

    expect(response.body.data[2].location).toEqual({
      zoneId: null,
      zoneName: null,
      sensorKey: null,
    });
  });

  it("keeps another farm's error locations private", async () => {
    const farmA = await registerOwner("Farm A");
    const farmB = await registerOwner("Farm B");
    const [zoneA] = await zonesOf(farmA.farmId);

    await seedErrors(farmA.farmId, zoneA!.id);

    const asB = await request(testApp())
      .get("/api/v1/farms/me/system-health/errors")
      .set(auth(farmB.accessToken))
      .expect(200);

    expect(asB.body.data).toEqual([]);
  });
});
