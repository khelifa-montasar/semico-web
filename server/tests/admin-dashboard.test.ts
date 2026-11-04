import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { MQTT_ACTIVITY_WINDOW_SECONDS } from "@semico/shared";
import { prisma } from "../src/db/prisma.js";
import { MqttGateway } from "../src/modules/telemetry/mqttGateway.js";
import { auth, createSuperAdmin, registerOwner, resetDatabase, testApp } from "./helpers/api.js";

beforeEach(resetDatabase);
afterEach(() => vi.restoreAllMocks());

describe("GET /api/v1/admin/stats", () => {
  it("returns an empty platform without needing a farm", async () => {
    const admin = await createSuperAdmin();
    const response = await request(testApp()).get("/api/v1/admin/stats").set(auth(admin.accessToken)).expect(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body.data).toEqual({
      totalFarms: 0, totalUsers: 1, totalActiveMqttDevices: 0,
      recentFarms: [], mqttActivityWindowSeconds: MQTT_ACTIVITY_WINDOW_SECONDS,
    });
  });

  it("counts all farms and account statuses, returning only the five newest farms and safe owner details", async () => {
    const admin = await createSuperAdmin();
    const first = await registerOwner("First Farm");
    const second = await registerOwner("Second Farm");
    await prisma.farm.update({ where: { id: first.farmId }, data: { createdAt: new Date("2026-01-01T00:00:00Z") } });
    await prisma.farm.update({ where: { id: second.farmId }, data: { createdAt: new Date("2026-01-02T00:00:00Z"), status: "SUSPENDED" } });
    const additions = [
      { id: "farm-c", ownerId: first.userId, createdAt: new Date("2026-02-01T00:00:00Z") },
      { id: "farm-d", ownerId: first.userId, createdAt: new Date("2026-02-02T00:00:00Z") },
      { id: "farm-e", ownerId: second.userId, createdAt: new Date("2026-02-03T00:00:00Z") },
      { id: "farm-f", ownerId: second.userId, createdAt: new Date("2026-02-03T00:00:00Z") },
    ];
    await prisma.farm.createMany({ data: additions.map((farm, index) => ({
      ...farm, name: farm.id, ownerCode: `TEST-000${index}`,
    })) });
    await prisma.user.createMany({ data: ["INVITED", "DISABLED"].map((status) => ({
      email: `${status.toLowerCase()}@test.dz`, passwordHash: "fixture", fullName: status,
      role: "WORKER", status, farmId: first.farmId,
    })) });

    const response = await request(testApp()).get("/api/v1/admin/stats")
      .set(auth(admin.accessToken)).set("X-Farm-Id", first.farmId).expect(200);
    expect(response.body.data).toMatchObject({ totalFarms: 6, totalUsers: 5, totalActiveMqttDevices: 0 });
    expect(response.body.data.recentFarms.map((farm: { id: string }) => farm.id))
      .toEqual(["farm-f", "farm-e", "farm-d", "farm-c", second.farmId]);
    expect(response.body.data.recentFarms[0]).toMatchObject({
      createdAt: "2026-02-03T00:00:00.000Z",
      owner: { id: second.userId, fullName: "Test Owner", email: second.email },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|ownerCode|refreshTokens/);
  });

  it("counts unique devices from valid MQTT traffic across farms and expires inactive devices", async () => {
    const admin = await createSuperAdmin();
    const first = await registerOwner("Farm A");
    const second = await registerOwner("Farm B");
    const zone = await prisma.zone.findFirstOrThrow({ where: { farmId: first.farmId } });
    // An online farm summary alone is not evidence that a registered MQTT device is reporting.
    await prisma.deviceStatus.update({ where: { farmId: first.farmId }, data: { controllerOnline: true } });
    const readStats = () => request(testApp()).get("/api/v1/admin/stats").set(auth(admin.accessToken)).expect(200);
    expect((await readStats()).body.data.totalActiveMqttDevices).toBe(0);
    const clock = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(clock);
    const gateway = new MqttGateway({
      topicPrefix: "semico/v1/devices",
      devices: {
        controller: { farmId: first.farmId, zoneId: zone.id, kind: "CONTROLLER" },
        gateway: { farmId: second.farmId, kind: "GATEWAY" },
      },
      publishFarmEvent: vi.fn(),
    });
    const payload = JSON.stringify({ messageId: randomUUID(), batteryPct: 90 });
    await gateway.ingest("semico/v1/devices/controller/telemetry", payload);
    await gateway.ingest("semico/v1/devices/controller/telemetry", payload);
    await gateway.ingest("semico/v1/devices/gateway/telemetry", JSON.stringify({ messageId: randomUUID(), batteryPct: 80 }));
    await expect(gateway.ingest("semico/v1/devices/unknown/telemetry", payload)).rejects.toThrow();
    await expect(gateway.ingest("semico/v1/devices/controller/telemetry", JSON.stringify({ messageId: randomUUID(), batteryPct: 101 }))).rejects.toThrow();
    expect((await readStats()).body.data.totalActiveMqttDevices).toBe(2);
    now.mockReturnValue(clock + MQTT_ACTIVITY_WINDOW_SECONDS * 1000 - 1);
    expect((await readStats()).body.data.totalActiveMqttDevices).toBe(2);
    now.mockReturnValue(clock + MQTT_ACTIVITY_WINDOW_SECONDS * 1000);
    expect((await readStats()).body.data.totalActiveMqttDevices).toBe(0);
  });

  it("counts a valid valve acknowledgement as device activity", async () => {
    const admin = await createSuperAdmin();
    const owner = await registerOwner();
    const zone = await prisma.zone.findFirstOrThrow({ where: { farmId: owner.farmId } });
    const command = await prisma.irrigationCommand.create({ data: {
      farmId: owner.farmId, zoneId: zone.id, issuedById: owner.userId, action: "OPEN",
    } });
    const gateway = new MqttGateway({
      topicPrefix: "semico/v1/devices",
      devices: { controller: { farmId: owner.farmId, zoneId: zone.id, kind: "CONTROLLER" } },
      publishFarmEvent: vi.fn(),
    });
    await gateway.ingestValveCommandAck("controller", JSON.stringify({
      commandId: command.id, status: "RECEIVED", receivedAt: new Date().toISOString(),
    }));
    const response = await request(testApp()).get("/api/v1/admin/stats").set(auth(admin.accessToken)).expect(200);
    expect(response.body.data.totalActiveMqttDevices).toBe(1);
  });
});
