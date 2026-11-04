import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { MqttClient } from "mqtt";
import {
  mqttValveCommandSchema,
  parseValveCommandAckTopic,
  valveCommandAckTopic,
  valveCommandTopic,
} from "@semico/shared";
import { prisma } from "../src/db/prisma.js";
import { MqttGateway } from "../src/modules/telemetry/mqttGateway.js";
import { setValveCommandTransport } from "../src/modules/irrigation/commandTransport.js";
import { Esp32Simulator, readSimulatorConfig } from "../scripts/esp32-simulator.js";
import { auth, registerOwner, resetDatabase, testApp } from "./helpers/api.js";

class FakeMqttClient extends EventEmitter {
  connected = true;
  readonly subscriptions: string[] = [];
  readonly published: Array<{ topic: string; payload: string; options: { qos: number; retain: boolean } }> = [];

  subscribe(topic: string | string[], _options: unknown, callback?: (error?: Error | null) => void): this {
    this.subscriptions.push(...(Array.isArray(topic) ? topic : [topic]));
    callback?.(null);
    return this;
  }

  publish(
    topic: string,
    payload: string | Buffer,
    options: { qos: number; retain: boolean },
    callback?: (error?: Error | null) => void,
  ): this {
    this.published.push({ topic, payload: payload.toString(), options });
    callback?.(null);
    return this;
  }

  handleMessage(_packet: unknown, callback: (error?: Error) => void): void {
    callback();
  }

  end(_force?: boolean, _options?: unknown, callback?: () => void): this {
    this.connected = false;
    callback?.();
    return this;
  }
}

const prefix = "semico/v1/devices";
const now = "2026-10-25T12:00:00.000Z";

beforeEach(resetDatabase);
afterEach(() => setValveCommandTransport(null));

describe("valve MQTT contract", () => {
  it("builds device-scoped topics and accepts only valid command shapes", () => {
    expect(valveCommandTopic(prefix, "controller-a")).toBe(`${prefix}/controller-a/commands/valve`);
    expect(valveCommandAckTopic(prefix, "controller-a")).toBe(`${prefix}/controller-a/acks/valve`);
    expect(parseValveCommandAckTopic(`${prefix}/controller-a/acks/valve`, prefix)).toBe("controller-a");
    expect(parseValveCommandAckTopic(`${prefix}/controller-a/commands/valve`, prefix)).toBeNull();

    expect(mqttValveCommandSchema.safeParse({
      commandId: "cm-test",
      zoneId: "zone-a",
      action: "OPEN",
      durationMin: 10,
      issuedAt: now,
    }).success).toBe(true);
    expect(mqttValveCommandSchema.safeParse({
      commandId: "cm-test",
      zoneId: "zone-a",
      action: "OPEN",
      durationMin: null,
      issuedAt: now,
    }).success).toBe(false);
  });

  it("publishes to the unique server-mapped controller topic at QoS 1", async () => {
    const owner = await registerOwner();
    const zone = await prisma.zone.findFirstOrThrow({ where: { farmId: owner.farmId } });
    const client = new FakeMqttClient();
    const gateway = new MqttGateway({
      url: "mqtt://broker.test",
      topicPrefix: prefix,
      devices: { "controller-a": { farmId: owner.farmId, zoneId: zone.id, kind: "CONTROLLER" } },
      publishFarmEvent: vi.fn(),
      connect: () => client as unknown as MqttClient,
    });
    gateway.start();
    client.emit("connect");

    await gateway.publishValveCommand({
      commandId: "cm-test",
      zoneId: zone.id,
      action: "OPEN",
      durationMin: 10,
      issuedAt: now,
    }, owner.farmId);

    expect(client.subscriptions).toContain(`${prefix}/+/acks/valve`);
    expect(client.published).toEqual([{
      topic: `${prefix}/controller-a/commands/valve`,
      payload: JSON.stringify({ commandId: "cm-test", zoneId: zone.id, action: "OPEN", durationMin: 10, issuedAt: now }),
      options: { qos: 1, retain: false },
    }]);
    await gateway.stop();
  });

  it("keeps API commands pending through broker publish and simulator receipt", async () => {
    const owner = await registerOwner();
    const zone = await prisma.zone.findFirstOrThrow({ where: { farmId: owner.farmId } });
    const client = new FakeMqttClient();
    const gateway = new MqttGateway({
      url: "mqtt://broker.test",
      topicPrefix: prefix,
      devices: { "controller-a": { farmId: owner.farmId, zoneId: zone.id, kind: "CONTROLLER" } },
      publishFarmEvent: vi.fn(),
      connect: () => client as unknown as MqttClient,
    });
    gateway.start();
    client.emit("connect");
    setValveCommandTransport(gateway);

    const response = await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set(auth(owner.accessToken))
      .send({ durationMin: 10, zoneId: zone.id })
      .expect(201);
    const commandId = response.body.data.id as string;
    expect(response.body.data).toMatchObject({ status: "PENDING", acknowledgedAt: null, executedAt: null });
    expect((await prisma.zone.findUniqueOrThrow({ where: { id: zone.id } })).valveState).toBe("CLOSED");

    await gateway.ingestValveCommandAck("controller-a", JSON.stringify({
      commandId,
      status: "RECEIVED",
      receivedAt: now,
    }));
    const received = await prisma.irrigationCommand.findUniqueOrThrow({ where: { id: commandId } });
    expect(received.status).toBe("PENDING");
    expect(received.acknowledgedAt).toEqual(new Date(now));
    expect((await prisma.zone.findUniqueOrThrow({ where: { id: zone.id } })).valveState).toBe("CLOSED");
    await gateway.stop();
  });

  it("fails closed when the zone has no unique controller mapping", async () => {
    const owner = await registerOwner();
    const zone = await prisma.zone.findFirstOrThrow({ where: { farmId: owner.farmId } });
    const gateway = new MqttGateway({
      topicPrefix: prefix,
      devices: {
        "controller-a": { farmId: owner.farmId, zoneId: zone.id, kind: "CONTROLLER" },
        "controller-b": { farmId: owner.farmId, zoneId: zone.id, kind: "CONTROLLER" },
      },
      publishFarmEvent: vi.fn(),
    });
    expect(() => gateway.assertCanRoute(owner.farmId, zone.id)).toThrow("Multiple MQTT controllers");
    expect(() => gateway.assertCanRoute("other-farm", zone.id)).toThrow("No MQTT controller");
  });

  it("fails an unreceived command at the bounded receipt timeout without changing valve state", async () => {
    const owner = await registerOwner();
    const zone = await prisma.zone.findFirstOrThrow({ where: { farmId: owner.farmId } });
    const command = await prisma.irrigationCommand.create({
      data: {
        farmId: owner.farmId,
        zoneId: zone.id,
        issuedById: owner.userId,
        action: "OPEN",
        durationMin: 10,
        status: "PENDING",
      },
    });
    const client = new FakeMqttClient();
    const gateway = new MqttGateway({
      url: "mqtt://broker.test",
      topicPrefix: prefix,
      devices: { "controller-a": { farmId: owner.farmId, zoneId: zone.id, kind: "CONTROLLER" } },
      publishFarmEvent: vi.fn(),
      receiptTimeoutMs: 100,
      connect: () => client as unknown as MqttClient,
    });
    gateway.start();
    try {
      await gateway.publishValveCommand({
        commandId: command.id,
        zoneId: zone.id,
        action: "OPEN",
        durationMin: 10,
        issuedAt: now,
      }, owner.farmId);
      await new Promise((resolveWait) => setTimeout(resolveWait, 150));
      expect((await prisma.irrigationCommand.findUniqueOrThrow({ where: { id: command.id } })).status).toBe("FAILED");
      expect((await prisma.zone.findUniqueOrThrow({ where: { id: zone.id } })).valveState).toBe("CLOSED");
    } finally {
      await gateway.stop();
    }
  });

  it("records simulator receipt without executing the command or changing valve state", async () => {
    const owner = await registerOwner();
    const zone = await prisma.zone.findFirstOrThrow({ where: { farmId: owner.farmId } });
    const command = await prisma.irrigationCommand.create({
      data: {
        farmId: owner.farmId,
        zoneId: zone.id,
        issuedById: owner.userId,
        action: "OPEN",
        durationMin: 10,
        status: "PENDING",
      },
    });
    const gateway = new MqttGateway({
      topicPrefix: prefix,
      devices: { "controller-a": { farmId: owner.farmId, zoneId: zone.id, kind: "CONTROLLER" } },
      publishFarmEvent: vi.fn(),
    });
    const receipt = JSON.stringify({ commandId: command.id, status: "RECEIVED", receivedAt: now });

    await gateway.ingestValveCommandAck("controller-a", receipt);
    await gateway.ingestValveCommandAck("controller-a", receipt);

    const afterReceipt = await prisma.irrigationCommand.findUniqueOrThrow({ where: { id: command.id } });
    expect(afterReceipt).toMatchObject({ status: "PENDING", acknowledgedAt: new Date(now), executedAt: null });
    expect((await prisma.zone.findUniqueOrThrow({ where: { id: zone.id } })).valveState).toBe("CLOSED");

    await gateway.ingestValveCommandAck("controller-a", JSON.stringify({
      commandId: command.id,
      status: "EXECUTED",
      valveState: "OPEN",
      completedAt: now,
    }));
    const executed = await prisma.irrigationCommand.findUniqueOrThrow({ where: { id: command.id } });
    expect(executed).toMatchObject({ status: "EXECUTED", executedAt: new Date(now) });
    expect((await prisma.zone.findUniqueOrThrow({ where: { id: zone.id } })).valveState).toBe("OPEN");
  });

  it("does not change state for failed, mismatched, or wrong-controller acknowledgments", async () => {
    const owner = await registerOwner("Farm A");
    const other = await registerOwner("Farm B");
    const zone = await prisma.zone.findFirstOrThrow({ where: { farmId: owner.farmId } });
    const otherZone = await prisma.zone.findFirstOrThrow({ where: { farmId: other.farmId } });
    const command = await prisma.irrigationCommand.create({
      data: {
        farmId: owner.farmId,
        zoneId: zone.id,
        issuedById: owner.userId,
        action: "OPEN",
        durationMin: 5,
        status: "PENDING",
      },
    });
    const gateway = new MqttGateway({
      topicPrefix: prefix,
      devices: {
        "controller-a": { farmId: owner.farmId, zoneId: zone.id, kind: "CONTROLLER" },
        "controller-b": { farmId: other.farmId, zoneId: otherZone.id, kind: "CONTROLLER" },
      },
      publishFarmEvent: vi.fn(),
    });

    await expect(gateway.ingestValveCommandAck("controller-b", JSON.stringify({
      commandId: command.id,
      status: "EXECUTED",
      valveState: "OPEN",
      completedAt: now,
    }))).rejects.toThrow("does not match");
    await expect(gateway.ingestValveCommandAck("controller-a", JSON.stringify({
      commandId: command.id,
      status: "EXECUTED",
      valveState: "CLOSED",
      completedAt: now,
    }))).rejects.toThrow("does not match the command");

    await gateway.ingestValveCommandAck("controller-a", JSON.stringify({
      commandId: command.id,
      status: "FAILED",
      completedAt: now,
      errorCode: "VALVE_STUCK",
    }));
    expect((await prisma.irrigationCommand.findUniqueOrThrow({ where: { id: command.id } })).status).toBe("FAILED");
    expect((await prisma.zone.findUniqueOrThrow({ where: { id: zone.id } })).valveState).toBe("CLOSED");
  });

  it("simulator prints each valid command once and publishes only a receipt ACK", async () => {
    const client = new FakeMqttClient();
    const output: string[] = [];
    const simulator = new Esp32Simulator({
      client: client as unknown as MqttClient,
      deviceId: "controller-a",
      topicPrefix: prefix,
      writeLine: (line) => output.push(line),
      writeError: () => undefined,
      now: () => new Date(now),
    });
    simulator.start();
    client.emit("connect");
    await Promise.resolve();
    expect(client.subscriptions).toEqual([`${prefix}/controller-a/commands/valve`]);
    expect(client.published[0]?.topic).toBe(`${prefix}/controller-a/telemetry`);
    output.length = 0;
    client.published.length = 0;
    const command = {
      commandId: "cm-test",
      zoneId: "zone-a",
      action: "OPEN",
      durationMin: 10,
      issuedAt: now,
    };
    const topic = `${prefix}/controller-a/commands/valve`;

    expect(await simulator.handleCommand(topic, JSON.stringify(command))).toBe(true);
    expect(await simulator.handleCommand(topic, JSON.stringify(command))).toBe(true);
    expect(output).toEqual(["ESP32 received: OPEN valve"]);
    expect(client.published).toHaveLength(2);
    expect(JSON.parse(client.published[0]?.payload ?? "{}")).toEqual({
      commandId: "cm-test",
      status: "RECEIVED",
      receivedAt: now,
    });
    expect(client.published[0]?.topic).toBe(`${prefix}/controller-a/acks/valve`);
    expect(client.published[0]?.options).toEqual({ qos: 1, retain: false });
    expect(await simulator.handleCommand(topic, JSON.stringify({ ...command, farmId: "untrusted" }))).toBe(false);
    expect(client.published).toHaveLength(2);
    await simulator.stop();
  });

  it("simulator publishes unique telemetry that the existing gateway accepts and raises a low-moisture alert", async () => {
    const owner = await registerOwner();
    const zone = await prisma.zone.findFirstOrThrow({ where: { farmId: owner.farmId } });
    const client = new FakeMqttClient();
    const simulator = new Esp32Simulator({
      client: client as unknown as MqttClient,
      deviceId: "controller-a",
      topicPrefix: prefix,
      writeLine: () => undefined,
    });
    const publishFarmEvent = vi.fn();
    const gateway = new MqttGateway({
      topicPrefix: prefix,
      devices: { "controller-a": { farmId: owner.farmId, zoneId: zone.id, kind: "CONTROLLER" } },
      publishFarmEvent,
    });
    expect(await simulator.publishTelemetry()).toBe(true);
    expect(await simulator.publishTelemetry()).toBe(true);
    const ids = client.published.map((message) => JSON.parse(message.payload).messageId);
    expect(new Set(ids).size).toBe(2);
    for (const message of client.published) {
      expect(message.options).toEqual({ qos: 1, retain: false });
      await gateway.ingest(message.topic, message.payload);
    }
    expect(await prisma.telemetry.count({ where: { farmId: owner.farmId } })).toBe(2);
    expect(publishFarmEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: "alert.updated",
      farmId: owner.farmId,
      activeAlerts: [{ code: "MOISTURE_LOW", targetId: zone.id, zoneId: zone.id }],
    }));
    client.connected = false;
    expect(await simulator.publishTelemetry()).toBe(false);
    expect(client.published).toHaveLength(2);
    await simulator.stop();
  });

  it("simulator honors telemetry settings and rejects invalid configuration", () => {
    const env = { SIMULATOR_MQTT_URL: "mqtt://localhost:1883", SIMULATOR_DEVICE_ID: "controller-a" };
    expect(readSimulatorConfig(env)).toMatchObject({ telemetryIntervalMs: 5000, rootMoisture: 17.5 });
    expect(readSimulatorConfig({ ...env, SIMULATOR_TELEMETRY_INTERVAL_MS: "1000", SIMULATOR_ROOT_MOISTURE: "42" }))
      .toMatchObject({ telemetryIntervalMs: 1000, rootMoisture: 42 });
    expect(readSimulatorConfig({ MQTT_URL: "mqtt://localhost:1883", MQTT_TOPIC_PREFIX: "semico/v2/devices", SIMULATOR_DEVICE_ID: "controller-a" }))
      .toMatchObject({ topicPrefix: "semico/v2/devices" });
    for (const value of ["NaN", "-1", "101"]) {
      expect(() => readSimulatorConfig({ ...env, SIMULATOR_ROOT_MOISTURE: value })).toThrow("SIMULATOR_ROOT_MOISTURE");
    }
    for (const value of ["0", "NaN", "100.5", "2147483648"]) {
      expect(() => readSimulatorConfig({ ...env, SIMULATOR_TELEMETRY_INTERVAL_MS: value })).toThrow("SIMULATOR_TELEMETRY_INTERVAL_MS");
    }
  });
});
