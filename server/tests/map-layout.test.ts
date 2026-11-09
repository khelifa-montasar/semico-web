import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { prisma } from "../src/db/prisma.js";
import { MqttGateway } from "../src/modules/telemetry/mqttGateway.js";
import {
  auth,
  registerOwner,
  registerWorker,
  resetDatabase,
  testApp,
} from "./helpers/api.js";

beforeEach(resetDatabase);
const boundary = [
  [36.75, 3.04],
  [36.75, 3.041],
  [36.749, 3.041],
  [36.749, 3.04],
];

async function fixture() {
  const owner = await registerOwner();
  const headers = auth(owner.accessToken);
  const resize = (zoneCount: number, sensorsPerZone: number) =>
    request(testApp())
      .patch("/api/v1/farms/me/settings")
      .set(headers)
      .send({ zoneCount, sensorsPerZone });
  return { owner, headers, resize };
}

describe("saved map layout", () => {
  it("creates exactly one configured zone and one sensor when 1 + 1 is saved", async () => {
    const { owner, headers, resize } = await fixture();
    const response = await resize(1, 1).expect(200);
    expect(response.body.data).toMatchObject({
      farmId: owner.farmId,
      zoneCount: 1,
      sensorsPerZone: 1,
    });
    const zones = await request(testApp())
      .get("/api/v1/farms/me/zones")
      .set(headers)
      .expect(200);
    const sensors = await request(testApp())
      .get("/api/v1/farms/me/sensors")
      .set(headers)
      .expect(200);
    expect(zones.body.data).toHaveLength(1);
    expect(sensors.body.data).toHaveLength(1);
    expect(sensors.body.data[0].sensors).toHaveLength(1);
    expect(sensors.body.data[0].sensors[0]).toMatchObject({
      connection: "OFFLINE",
      lastSeenAt: null,
      batteryPct: null,
    });
    expect(await prisma.zone.count({ where: { farmId: owner.farmId } })).toBe(
      3,
    );
    expect(await prisma.irrigationCommand.count()).toBe(0);
  });

  it("restores the same identifiers and geometry without deleting sensor history", async () => {
    const { owner, headers, resize } = await fixture();
    await resize(3, 2).expect(200);
    const before = await prisma.sensor.findMany({
      where: { farmId: owner.farmId },
      orderBy: { id: "asc" },
    });
    const zones = await prisma.zone.findMany({
      where: { farmId: owner.farmId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    const sensor = before.find((row) => row.zoneId === zones[2].id)!;
    await prisma.zone.update({
      where: { id: zones[2].id },
      data: { boundaryJson: JSON.stringify(boundary) },
    });
    const reading = await prisma.telemetry.create({
      data: {
        farmId: owner.farmId,
        zoneId: zones[2].id,
        sensorId: sensor.id,
        recordedAt: new Date(),
        rootMoisture: 42,
      },
    });
    await resize(1, 1).expect(200);
    expect(
      await prisma.sensor.count({
        where: { farmId: owner.farmId, configured: true },
      }),
    ).toBe(1);
    expect(await prisma.sensor.count({ where: { farmId: owner.farmId } })).toBe(
      6,
    );
    await request(testApp())
      .get(`/api/v1/farms/me/sensors/${sensor.id}/history`)
      .set(headers)
      .expect(404);
    await request(testApp())
      .post("/api/v1/farms/me/irrigation/valve")
      .set(headers)
      .send({ action: "OPEN", zoneId: zones[2].id })
      .expect(404);
    await resize(3, 2).expect(200);
    const restored = await prisma.sensor.findMany({
      where: { farmId: owner.farmId, configured: true },
      orderBy: { id: "asc" },
    });
    expect(restored.map((row) => row.id)).toEqual(before.map((row) => row.id));
    expect(
      (await prisma.telemetry.findUniqueOrThrow({ where: { id: reading.id } }))
        .sensorId,
    ).toBe(sensor.id);
    expect(
      (await prisma.zone.findUniqueOrThrow({ where: { id: zones[2].id } }))
        .boundaryJson,
    ).toBe(JSON.stringify(boundary));
    const history = await request(testApp())
      .get(`/api/v1/farms/me/sensors/${sensor.id}/history`)
      .set(headers)
      .expect(200);
    expect(history.body.data.latestMoisture.value).toBe(42);
  });

  it("grows the persisted layout and produces unique keys even after manual ordering", async () => {
    const { owner, resize } = await fixture();
    await resize(1, 1).expect(200);
    await resize(5, 4).expect(200);
    expect(
      await prisma.zone.count({
        where: { farmId: owner.farmId, configured: true },
      }),
    ).toBe(5);
    const sensors = await prisma.sensor.findMany({
      where: { farmId: owner.farmId, configured: true },
    });
    expect(sensors).toHaveLength(20);
    expect(new Set(sensors.map((sensor) => sensor.key)).size).toBe(20);
    await resize(5, 4).expect(200);
    expect(await prisma.sensor.count({ where: { farmId: owner.farmId } })).toBe(
      20,
    );
  });

  it.each(["open", "pending"])(
    "refuses to hide a zone with %s irrigation and rolls back the settings",
    async (kind) => {
      const { owner, resize } = await fixture();
      await resize(3, 2).expect(200);
      const zones = await prisma.zone.findMany({
        where: { farmId: owner.farmId },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      });
      if (kind === "open")
        await prisma.zone.update({
          where: { id: zones[2].id },
          data: { valveState: "OPEN" },
        });
      else
        await prisma.irrigationCommand.create({
          data: {
            farmId: owner.farmId,
            zoneId: zones[2].id,
            issuedById: owner.userId,
            action: "OPEN",
            status: "PENDING",
          },
        });
      const auditCount = await prisma.auditLog.count();
      await resize(1, 1).expect(409);
      expect(
        await prisma.farmSettings.findUnique({
          where: { farmId: owner.farmId },
        }),
      ).toMatchObject({ zoneCount: 3, sensorsPerZone: 2 });
      expect(
        await prisma.zone.count({
          where: { farmId: owner.farmId, configured: true },
        }),
      ).toBe(3);
      expect(await prisma.auditLog.count()).toBe(auditCount);
    },
  );

  it("keeps manual zone creation in sync with configured counts", async () => {
    const { owner, headers, resize } = await fixture();
    await resize(1, 1).expect(200);
    const created = await request(testApp())
      .post("/api/v1/farms/me/zones")
      .set(headers)
      .send({ name: "Orchard", sortOrder: 4, boundary })
      .expect(201);
    expect(created.body.data.boundary).toEqual(boundary);
    expect(
      await prisma.farmSettings.findUnique({ where: { farmId: owner.farmId } }),
    ).toMatchObject({ zoneCount: 2, sensorsPerZone: 1 });
    expect(
      await prisma.sensor.count({
        where: { farmId: owner.farmId, configured: true },
      }),
    ).toBe(2);
  });

  it("persists and clears a validated zone boundary in the selected farm", async () => {
    const { owner, headers } = await fixture();
    const zone = await prisma.zone.findFirstOrThrow({
      where: { farmId: owner.farmId },
    });
    await request(testApp())
      .patch(`/api/v1/farms/me/zones/${zone.id}`)
      .set(headers)
      .send({ boundary })
      .expect(200);
    const single = await request(testApp())
      .get(`/api/v1/farms/me/zones/${zone.id}`)
      .set(headers)
      .expect(200);
    const list = await request(testApp())
      .get("/api/v1/farms/me/zones")
      .set(headers)
      .expect(200);
    expect(single.body.data.boundary).toEqual(boundary);
    expect(
      list.body.data.find((row: { id: string }) => row.id === zone.id).boundary,
    ).toEqual(boundary);
    await request(testApp())
      .patch(`/api/v1/farms/me/zones/${zone.id}`)
      .set(headers)
      .send({ boundary: null })
      .expect(200);
    expect(
      (await prisma.zone.findUniqueOrThrow({ where: { id: zone.id } }))
        .boundaryJson,
    ).toBeNull();
  });

  it("rejects invalid polygons, worker writes, and cross-farm edits", async () => {
    const { owner, headers } = await fixture();
    const zone = await prisma.zone.findFirstOrThrow({
      where: { farmId: owner.farmId },
    });
    const endpoint = `/api/v1/farms/me/zones/${zone.id}`;
    for (const invalid of [
      [],
      [
        [1, 1],
        [1, 1],
        [1, 1],
      ],
      [
        [91, 3],
        [36, 3],
        [36, 4],
      ],
      [
        [36, 3],
        [37, 4],
        [36, 4],
        [37, 3],
      ],
    ]) {
      await request(testApp())
        .patch(endpoint)
        .set(headers)
        .send({ boundary: invalid })
        .expect(400);
    }
    const worker = await registerWorker(owner.ownerCode, "ENGINEER");
    await request(testApp())
      .patch(endpoint)
      .set(auth(worker.accessToken))
      .send({ boundary })
      .expect(403);
    await request(testApp())
      .patch("/api/v1/farms/me/settings")
      .set(auth(worker.accessToken))
      .send({ zoneCount: 1, sensorsPerZone: 1 })
      .expect(403);
    const other = await registerOwner();
    await request(testApp())
      .patch(endpoint)
      .set(auth(other.accessToken))
      .send({ boundary })
      .expect(404);
  });

  it("rejects telemetry from deactivated sensors without dropping their historical rows", async () => {
    const { owner, resize } = await fixture();
    await resize(1, 2).expect(200);
    const sensors = await prisma.sensor.findMany({
      where: { farmId: owner.farmId, configured: true },
      orderBy: { sortOrder: "asc" },
    });
    const gateway = new MqttGateway({
      topicPrefix: "semico/v1/devices",
      devices: {
        retired: {
          farmId: owner.farmId,
          sensorKey: sensors[1].key,
          kind: "SENSOR",
        },
      },
      publishFarmEvent: vi.fn(),
    });
    await resize(1, 1).expect(200);
    await expect(
      gateway.ingest(
        "semico/v1/devices/retired/telemetry",
        JSON.stringify({
          messageId: "00000000-0000-4000-8000-000000000001",
          rootMoisture: 30,
        }),
      ),
    ).rejects.toThrow();
    expect(await prisma.telemetry.count()).toBe(0);
    expect(
      await prisma.sensor.findUnique({ where: { id: sensors[1].id } }),
    ).not.toBeNull();
  });
});
