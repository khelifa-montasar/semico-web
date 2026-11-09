import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { prisma } from "../src/db/prisma.js";
import { MqttGateway } from "../src/modules/telemetry/mqttGateway.js";
import {
  auth,
  createSuperAdmin,
  registerOwner,
  registerWorker,
  resetDatabase,
  testApp,
} from "./helpers/api.js";

const NOW = new Date("2026-11-05T12:30:00.000Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);

beforeEach(async () => {
  await resetDatabase();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

async function fixture() {
  const owner = await registerOwner();
  const zone = await prisma.zone.findFirstOrThrow({
    where: { farmId: owner.farmId },
  });
  const sensor = await prisma.sensor.create({
    data: {
      farmId: owner.farmId,
      zoneId: zone.id,
      key: "HISTORY-S1",
      lastSeenAt: NOW,
      batteryPct: 0,
    },
  });
  const headers = auth(owner.accessToken);
  return { owner, zone, sensor, headers };
}

describe("24-hour field history", () => {
  it("uses an exact rolling window, hourly averages, and nulls for missing hours", async () => {
    const { owner, zone, headers } = await fixture();
    await prisma.telemetry.createMany({
      data: [
        {
          farmId: owner.farmId,
          zoneId: zone.id,
          recordedAt: hoursAgo(25),
          rootMoisture: 99,
        },
        {
          farmId: owner.farmId,
          zoneId: zone.id,
          recordedAt: hoursAgo(24),
          rootMoisture: 0,
        },
        {
          farmId: owner.farmId,
          zoneId: zone.id,
          recordedAt: hoursAgo(2),
          rootMoisture: 20,
        },
        {
          farmId: owner.farmId,
          zoneId: zone.id,
          recordedAt: hoursAgo(1.5),
          rootMoisture: 40,
        },
        {
          farmId: owner.farmId,
          zoneId: zone.id,
          recordedAt: NOW,
          rootMoisture: 45,
        },
        {
          farmId: owner.farmId,
          zoneId: zone.id,
          recordedAt: hoursAgo(-1),
          rootMoisture: 100,
        },
      ],
    });
    const { body } = await request(testApp())
      .get(`/api/v1/farms/me/zones/${zone.id}/history`)
      .set(headers)
      .expect(200);
    expect(body.data.window).toEqual({
      from: hoursAgo(24).toISOString(),
      to: NOW.toISOString(),
    });
    expect(body.data.points).toHaveLength(24);
    expect(body.data.points[0]).toMatchObject({ moisture: 0, samples: 1 });
    expect(body.data.points[1]).toMatchObject({ moisture: null, samples: 0 });
    expect(body.data.points[22]).toMatchObject({ moisture: 30, samples: 2 });
    expect(body.data.latestMoisture).toEqual({
      value: 45,
      recordedAt: NOW.toISOString(),
    });
  });

  it("keeps sensor readings distinct and preserves a zero-percent battery", async () => {
    const { owner, zone, sensor, headers } = await fixture();
    const other = await prisma.sensor.create({
      data: {
        farmId: owner.farmId,
        zoneId: zone.id,
        key: "OTHER",
        lastSeenAt: NOW,
      },
    });
    await prisma.telemetry.createMany({
      data: [
        {
          farmId: owner.farmId,
          zoneId: zone.id,
          sensorId: sensor.id,
          recordedAt: hoursAgo(1),
          rootMoisture: 12,
        },
        {
          farmId: owner.farmId,
          zoneId: zone.id,
          sensorId: other.id,
          recordedAt: NOW,
          rootMoisture: 98,
        },
      ],
    });
    const { body } = await request(testApp())
      .get(`/api/v1/farms/me/sensors/${sensor.id}/history`)
      .set(headers)
      .expect(200);
    expect(body.data.telemetryScope).toBe("sensor");
    expect(body.data.sensor).toMatchObject({ id: sensor.id, batteryPct: 0 });
    expect(body.data.latestMoisture.value).toBe(12);
    expect(
      body.data.points.filter(
        (point: { samples: number }) => point.samples > 0,
      ),
    ).toHaveLength(1);
    expect(body.data.points[23].moisture).toBe(12);
  });

  it("labels legacy zone history as zone context rather than sensor measurements", async () => {
    const { owner, zone, sensor, headers } = await fixture();
    await prisma.telemetry.create({
      data: {
        farmId: owner.farmId,
        zoneId: zone.id,
        recordedAt: NOW,
        rootMoisture: 32,
        batteryPct: 95,
      },
    });
    const { body } = await request(testApp())
      .get(`/api/v1/farms/me/sensors/${sensor.id}/history`)
      .set(headers)
      .expect(200);
    expect(body.data.telemetryScope).toBe("zone");
    expect(body.data.latestMoisture.value).toBe(32);
    expect(body.data.sensor.batteryPct).toBe(0);
  });

  it("returns honest empty histories without inventing watering or moisture", async () => {
    const { zone, headers } = await fixture();
    const { body } = await request(testApp())
      .get(`/api/v1/farms/me/zones/${zone.id}/history`)
      .set(headers)
      .expect(200);
    expect(body.data.latestMoisture).toBeNull();
    expect(body.data.lastWatering).toBeNull();
    expect(body.data.warnings).toEqual([]);
    expect(
      body.data.points.every(
        (point: { moisture: number | null }) => point.moisture === null,
      ),
    ).toBe(true);
  });

  it("reports only an executed OPEN as last watering, never a receipt or failed request", async () => {
    const { owner, zone, headers } = await fixture();
    const base = {
      farmId: owner.farmId,
      zoneId: zone.id,
      issuedById: owner.userId,
      requestedAt: hoursAgo(2),
    };
    const executed = await prisma.irrigationCommand.create({
      data: {
        ...base,
        action: "OPEN",
        status: "EXECUTED",
        executedAt: hoursAgo(1),
        durationMin: 8,
      },
    });
    await prisma.irrigationCommand.createMany({
      data: [
        { ...base, action: "OPEN", status: "PENDING", acknowledgedAt: NOW },
        { ...base, action: "OPEN", status: "FAILED", executedAt: NOW },
        { ...base, action: "CLOSE", status: "EXECUTED", executedAt: NOW },
      ],
    });
    const { body } = await request(testApp())
      .get(`/api/v1/farms/me/zones/${zone.id}/history`)
      .set(headers)
      .expect(200);
    expect(body.data.lastWatering).toEqual({
      commandId: executed.id,
      executedAt: hoursAgo(1).toISOString(),
      durationMin: 8,
    });
    expect(
      (await prisma.zone.findUniqueOrThrow({ where: { id: zone.id } }))
        .valveState,
    ).toBe("CLOSED");
  });

  it("filters warnings by time and location while including applicable farm-wide warnings", async () => {
    const { owner, zone, sensor, headers } = await fixture();
    const other = await registerOwner();
    const base = {
      farmId: owner.farmId,
      occurredAt: hoursAgo(1),
      component: "SENSOR",
      messageAr: "تنبيه",
    };
    await prisma.errorLog.createMany({
      data: [
        {
          ...base,
          zoneId: zone.id,
          sensorKey: sensor.key,
          messageEn: "own sensor",
        },
        { ...base, zoneId: zone.id, messageEn: "zone warning" },
        { ...base, messageEn: "farm warning" },
        {
          ...base,
          zoneId: zone.id,
          sensorKey: "OTHER",
          messageEn: "other sensor",
        },
        {
          ...base,
          zoneId: zone.id,
          occurredAt: hoursAgo(25),
          messageEn: "old",
        },
        {
          ...base,
          zoneId: zone.id,
          occurredAt: hoursAgo(-1),
          messageEn: "future",
        },
        { ...base, farmId: other.farmId, messageEn: "foreign" },
      ],
    });
    const { body } = await request(testApp())
      .get(`/api/v1/farms/me/sensors/${sensor.id}/history`)
      .set(headers)
      .expect(200);
    expect(body.data.warningCount).toBe(3);
    expect(
      body.data.warnings
        .map((warning: { message: { en: string } }) => warning.message.en)
        .sort(),
    ).toEqual(["farm warning", "own sensor", "zone warning"]);
  });

  it("bounds warning payloads while returning the full matching count", async () => {
    const { owner, zone, headers } = await fixture();
    await prisma.errorLog.createMany({
      data: Array.from({ length: 103 }, (_, index) => ({
        farmId: owner.farmId,
        zoneId: zone.id,
        occurredAt: hoursAgo(index / 100),
        component: "SENSOR",
        messageEn: "Warning",
        messageAr: "تنبيه",
      })),
    });
    const { body } = await request(testApp())
      .get(`/api/v1/farms/me/zones/${zone.id}/history`)
      .set(headers)
      .expect(200);
    expect(body.data.warningCount).toBe(103);
    expect(body.data.warnings).toHaveLength(100);
  });

  it("returns 404 for foreign and missing zones and sensors", async () => {
    const { zone, sensor } = await fixture();
    const other = await registerOwner();
    for (const endpoint of [
      `zones/${zone.id}`,
      `sensors/${sensor.id}`,
      "zones/missing",
      "sensors/missing",
    ]) {
      await request(testApp())
        .get(`/api/v1/farms/me/${endpoint}/history`)
        .set(auth(other.accessToken))
        .expect(404);
    }
  });

  it("enforces member access without requiring valve permission", async () => {
    const { owner, zone, sensor } = await fixture();
    const admin = await createSuperAdmin();
    const engineer = await registerWorker(owner.ownerCode, "ENGINEER");
    const operator = await registerWorker(owner.ownerCode, "OPERATOR");
    for (const endpoint of [`zones/${zone.id}`, `sensors/${sensor.id}`]) {
      await request(testApp())
        .get(`/api/v1/farms/me/${endpoint}/history`)
        .expect(401);
      await request(testApp())
        .get(`/api/v1/farms/me/${endpoint}/history`)
        .set(auth(admin.accessToken))
        .expect(403);
      for (const worker of [engineer, operator]) {
        await request(testApp())
          .get(`/api/v1/farms/me/${endpoint}/history`)
          .set(auth(worker.accessToken))
          .expect(200);
      }
    }
  });

  it("respects the selected farm and cannot reuse the old farm's resource IDs", async () => {
    const { owner, zone, headers } = await fixture();
    const second = await prisma.farm.create({
      data: { ownerId: owner.userId, ownerCode: "HIST-2222", name: "Second" },
    });
    const secondZone = await prisma.zone.create({
      data: { farmId: second.id, name: "Second zone" },
    });
    const response = await request(testApp())
      .get(`/api/v1/farms/me/zones/${secondZone.id}/history`)
      .set(headers)
      .set("X-Farm-Id", second.id)
      .expect(200);
    expect(response.body.data.farmId).toBe(second.id);
    await request(testApp())
      .get(`/api/v1/farms/me/zones/${zone.id}/history`)
      .set(headers)
      .set("X-Farm-Id", second.id)
      .expect(404);
  });

  it("rejects a configured sensor whose zone belongs to another farm", async () => {
    const { owner } = await fixture();
    const other = await registerOwner();
    const otherZone = await prisma.zone.findFirstOrThrow({
      where: { farmId: other.farmId },
    });
    await prisma.sensor.create({
      data: {
        farmId: owner.farmId,
        zoneId: otherZone.id,
        key: "BROKEN",
        lastSeenAt: NOW,
      },
    });
    const gateway = new MqttGateway({
      topicPrefix: "semico/v1/devices",
      devices: {
        broken: { farmId: owner.farmId, kind: "SENSOR", sensorKey: "BROKEN" },
      },
      publishFarmEvent: vi.fn(),
    });
    await expect(
      gateway.ingest(
        "semico/v1/devices/broken/telemetry",
        JSON.stringify({ messageId: randomUUID(), rootMoisture: 12 }),
      ),
    ).rejects.toThrow();
    expect(await prisma.telemetry.count()).toBe(0);
    expect(await prisma.errorLog.count()).toBe(0);
  });

  it("attributes MQTT samples to their sensor and persists deduplicated warning transitions", async () => {
    const { owner, zone, sensor, headers } = await fixture();
    const publisher = vi.fn();
    const gateway = new MqttGateway({
      topicPrefix: "semico/v1/devices",
      devices: {
        "history-sensor": {
          farmId: owner.farmId,
          sensorKey: sensor.key,
          kind: "SENSOR",
        },
      },
      publishFarmEvent: publisher,
    });
    const topic = "semico/v1/devices/history-sensor/telemetry";
    const message = {
      messageId: randomUUID(),
      rootMoisture: 17,
      batteryPct: 12,
    };
    await gateway.ingest(topic, JSON.stringify(message));
    await gateway.ingest(topic, JSON.stringify(message));
    expect(
      await prisma.telemetry.findFirstOrThrow({
        where: { sourceMessageId: message.messageId },
      }),
    ).toMatchObject({ sensorId: sensor.id, zoneId: zone.id });
    expect(
      await prisma.errorLog.count({ where: { farmId: owner.farmId } }),
    ).toBe(2);
    expect(publisher).toHaveBeenCalledWith(
      expect.objectContaining({ type: "telemetry.updated", zoneId: zone.id }),
    );
    vi.setSystemTime(new Date(NOW.getTime() + 1000));
    await gateway.ingest(
      topic,
      JSON.stringify({ ...message, messageId: randomUUID() }),
    );
    expect(
      await prisma.errorLog.count({ where: { farmId: owner.farmId } }),
    ).toBe(2);
    vi.setSystemTime(new Date(NOW.getTime() + 2000));
    await gateway.ingest(
      topic,
      JSON.stringify({
        messageId: randomUUID(),
        rootMoisture: 18,
        batteryPct: 20,
      }),
    );
    vi.setSystemTime(new Date(NOW.getTime() + 3000));
    await gateway.ingest(
      topic,
      JSON.stringify({ ...message, messageId: randomUUID() }),
    );
    const { body } = await request(testApp())
      .get(`/api/v1/farms/me/sensors/${sensor.id}/history`)
      .set(headers)
      .expect(200);
    expect(body.data.telemetryScope).toBe("sensor");
    expect(body.data.warningCount).toBe(4);
    expect(body.data.sensor.batteryPct).toBe(12);
  });
});
