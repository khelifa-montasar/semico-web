import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db/prisma.js";
import { MqttGateway, parseTelemetryTopic } from "../src/modules/telemetry/mqttGateway.js";
import { registerOwner, resetDatabase } from "./helpers/api.js";

beforeEach(resetDatabase);

describe("MQTT telemetry gateway", () => {
  it("parses only the configured versioned telemetry topic", () => {
    expect(parseTelemetryTopic("semico/v1/devices/controller-a/telemetry", "semico/v1/devices"))
      .toBe("controller-a");
    expect(parseTelemetryTopic("semico/v1/devices/controller-a/commands", "semico/v1/devices"))
      .toBeNull();
    expect(parseTelemetryTopic("other/v1/devices/controller-a/telemetry", "semico/v1/devices"))
      .toBeNull();
  });

  it("persists a validated reading and publishes only farm-scoped events afterward", async () => {
    const owner = await registerOwner();
    const zone = await prisma.zone.findFirstOrThrow({ where: { farmId: owner.farmId } });
    const publishFarmEvent = vi.fn();
    const gateway = new MqttGateway({
      topicPrefix: "semico/v1/devices",
      devices: { "controller-a": { farmId: owner.farmId, zoneId: zone.id, kind: "CONTROLLER" } },
      publishFarmEvent,
    });
    const messageId = randomUUID();

    await gateway.ingest(
      `semico/v1/devices/controller-a/telemetry`,
      JSON.stringify({ messageId, rootMoisture: 45, batteryPct: 88, loraRssi: -73 }),
    );

    const reading = await prisma.telemetry.findFirstOrThrow({ where: { farmId: owner.farmId } });
    expect(reading).toMatchObject({
      sourceMessageId: messageId,
      zoneId: zone.id,
      rootMoisture: 45,
      batteryPct: 88,
      loraRssi: -73,
    });
    expect(await prisma.deviceStatus.findUniqueOrThrow({ where: { farmId: owner.farmId } }))
      .toMatchObject({ controllerOnline: true, batteryPct: 88, loraRssi: -73 });
    expect(publishFarmEvent).toHaveBeenCalledTimes(3);
    expect(publishFarmEvent).toHaveBeenNthCalledWith(1, expect.objectContaining({
      type: "telemetry.updated",
      farmId: owner.farmId,
      zoneId: zone.id,
    }));
    expect(publishFarmEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: "device-status.updated",
      farmId: owner.farmId,
    }));
    expect(publishFarmEvent).toHaveBeenNthCalledWith(3, expect.objectContaining({
      type: "alert.updated", farmId: owner.farmId, activeAlerts: [],
    }));
  });

  it("does not duplicate QoS 1 readings when a source message is redelivered", async () => {
    const owner = await registerOwner();
    const zone = await prisma.zone.findFirstOrThrow({ where: { farmId: owner.farmId } });
    const publishFarmEvent = vi.fn();
    const gateway = new MqttGateway({
      topicPrefix: "semico/v1/devices",
      devices: { "controller-a": { farmId: owner.farmId, zoneId: zone.id, kind: "CONTROLLER" } },
      publishFarmEvent,
    });
    const payload = JSON.stringify({ messageId: randomUUID(), rootMoisture: 45 });
    const topic = "semico/v1/devices/controller-a/telemetry";

    await gateway.ingest(topic, payload);
    await gateway.ingest(topic, payload);

    expect(await prisma.telemetry.count({ where: { farmId: owner.farmId } })).toBe(1);
    expect(publishFarmEvent).toHaveBeenCalledTimes(3);
  });

  it("rejects unknown devices, farm claims, invalid measurements, and cross-farm zones", async () => {
    const owner = await registerOwner("Farm A");
    const other = await registerOwner("Farm B");
    const zone = await prisma.zone.findFirstOrThrow({ where: { farmId: other.farmId } });
    const gateway = new MqttGateway({
      topicPrefix: "semico/v1/devices",
      devices: { "controller-a": { farmId: owner.farmId, zoneId: zone.id, kind: "CONTROLLER" } },
      publishFarmEvent: vi.fn(),
    });
    const payload = (extra: object) => JSON.stringify({ messageId: randomUUID(), rootMoisture: 45, ...extra });

    await expect(gateway.ingest("semico/v1/devices/unknown/telemetry", payload({}))).rejects.toThrow("Unknown MQTT device");
    await expect(gateway.ingest("semico/v1/devices/controller-a/telemetry", payload({ farmId: other.farmId }))).rejects.toThrow();
    await expect(gateway.ingest("semico/v1/devices/controller-a/telemetry", payload({ rootMoisture: 101 }))).rejects.toThrow();
    await expect(gateway.ingest("semico/v1/devices/controller-a/telemetry", payload({}))).rejects.toThrow("Configured MQTT zone");
    expect(await prisma.telemetry.count()).toBe(0);
  });

  it("publishes full alert snapshots when moisture crosses 18% and suppresses unchanged alerts", async () => {
    const owner = await registerOwner();
    const zone = await prisma.zone.findFirstOrThrow({ where: { farmId: owner.farmId } });
    const publishFarmEvent = vi.fn();
    const gateway = new MqttGateway({
      topicPrefix: "semico/v1/devices",
      devices: { "controller-a": { farmId: owner.farmId, zoneId: zone.id, kind: "CONTROLLER" } },
      publishFarmEvent,
    });
    for (const rootMoisture of [18, 17.5, 16, 18]) {
      await gateway.ingest("semico/v1/devices/controller-a/telemetry", JSON.stringify({ messageId: randomUUID(), rootMoisture }));
    }
    const alerts = publishFarmEvent.mock.calls.map(([event]) => event).filter((event) => event.type === "alert.updated");
    expect(alerts.map((event) => event.activeAlerts)).toEqual([
      [], [{ code: "MOISTURE_LOW", targetId: zone.id, zoneId: zone.id }], [],
    ]);
  });

  it("alerts when a reporting gateway goes offline and clears it when telemetry resumes", async () => {
    const owner = await registerOwner();
    const publishFarmEvent = vi.fn();
    let clock = Date.now();
    const gateway = new MqttGateway({
      topicPrefix: "semico/v1/devices",
      devices: { "gateway-a": { farmId: owner.farmId, kind: "GATEWAY" } },
      publishFarmEvent, now: () => clock, deviceOfflineTimeoutMs: 1000,
    });
    const heartbeat = () => gateway.ingest("semico/v1/devices/gateway-a/telemetry", JSON.stringify({ messageId: randomUUID(), batteryPct: 90 }));
    await heartbeat();
    publishFarmEvent.mockClear();
    clock += 999;
    gateway.checkOfflineGateways();
    expect(publishFarmEvent).not.toHaveBeenCalled();
    clock += 1;
    gateway.checkOfflineGateways();
    gateway.checkOfflineGateways();
    expect(publishFarmEvent).toHaveBeenCalledTimes(1);
    expect(publishFarmEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: "alert.updated", farmId: owner.farmId,
      activeAlerts: [{ code: "GATEWAY_OFFLINE", targetId: "gateway-a", zoneId: null }],
    }));
    await heartbeat();
    expect(publishFarmEvent).toHaveBeenLastCalledWith(expect.objectContaining({ type: "alert.updated", activeAlerts: [] }));
  });
});
