#!/usr/bin/env node
import "dotenv/config";
import mqtt, { type MqttClient } from "mqtt";
import { randomUUID } from "node:crypto";
import {
  mqttValveCommandSchema,
  valveCommandTopic,
  valveCommandAckTopic,
  type ValveCommandAck,
  type ValveCommandMessage,
} from "@semico/shared";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const MAX_REMEMBERED_COMMANDS = 1_000;
const MAX_COMMAND_BYTES = 16 * 1024;

export interface Esp32SimulatorOptions {
  client: MqttClient;
  deviceId: string;
  topicPrefix: string;
  writeLine?: (line: string) => void;
  writeError?: (line: string) => void;
  now?: () => Date;
  telemetryIntervalMs?: number;
  rootMoisture?: number;
}

export class Esp32Simulator {
  private readonly client: MqttClient;
  private readonly seenCommands = new Map<string, ValveCommandAck>();
  private telemetryTimer: ReturnType<typeof setInterval> | null = null;
  private readonly writeLine: (line: string) => void;
  private readonly writeError: (line: string) => void;
  private readonly now: () => Date;
  private readonly commandTopic: string;
  private readonly telemetryTopic: string;
  private readonly ackTopic: string;

  constructor(private readonly options: Esp32SimulatorOptions) {
    this.client = options.client;
    this.writeLine = options.writeLine ?? ((line) => process.stdout.write(`${line}\n`));
    this.writeError = options.writeError ?? ((line) => process.stderr.write(`${line}\n`));
    this.now = options.now ?? (() => new Date());
    this.commandTopic = valveCommandTopic(options.topicPrefix, options.deviceId);
    this.telemetryTopic = `${options.topicPrefix}/${options.deviceId}/telemetry`;
    this.ackTopic = valveCommandAckTopic(options.topicPrefix, options.deviceId);
  }

  start(): void {
    this.client.on("connect", () => {
      this.client.subscribe(this.commandTopic, { qos: 1 }, (error) => {
        if (error) {
          this.writeError(`ESP32 simulator subscription failed: ${error.message}`);
          return;
        }
        this.writeLine(`ESP32 connected; listening on ${this.commandTopic}`);
        void this.publishTelemetry().catch((error: unknown) => {
          this.writeError(`ESP32 simulator telemetry publish failed: ${error instanceof Error ? error.message : "unknown error"}`);
        });
      });
    });
    this.client.on("message", (topic, payload) => {
      if (topic !== this.commandTopic) return;
      void this.handleCommand(topic, payload).catch((error: unknown) => {
        this.writeError(`ESP32 simulator command handling failed: ${error instanceof Error ? error.message : "unknown error"}`);
      });
    });
    if (!this.telemetryTimer) {
      this.telemetryTimer = setInterval(() => {
        void this.publishTelemetry().catch((error: unknown) => {
          this.writeError(`ESP32 simulator telemetry publish failed: ${error instanceof Error ? error.message : "unknown error"}`);
        });
      }, this.options.telemetryIntervalMs ?? 5_000);
      this.telemetryTimer.unref();
    }
  }

  async publishTelemetry(): Promise<boolean> {
    if (!this.client.connected) return false;
    const payload = {
      messageId: randomUUID(),
      recordedAt: this.now().toISOString(),
      rootMoisture: this.options.rootMoisture ?? 17.5,
      batteryPct: 91,
      loraRssi: -72,
    };
    await new Promise<void>((resolvePublish, rejectPublish) => {
      this.client.publish(this.telemetryTopic, JSON.stringify(payload), { qos: 1, retain: false }, (error) => {
        if (error) rejectPublish(error);
        else resolvePublish();
      });
    });
    this.writeLine(`ESP32 published telemetry: rootMoisture=${payload.rootMoisture}% on ${this.telemetryTopic}`);
    return true;
  }

  async handleCommand(topic: string, payload: Buffer | string): Promise<boolean> {
    if (topic !== this.commandTopic) return false;
    const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
    if (bytes.byteLength > MAX_COMMAND_BYTES) return false;
    let command: ValveCommandMessage;
    try {
      const content = bytes.toString("utf8");
      command = mqttValveCommandSchema.parse(JSON.parse(content));
    } catch {
      this.writeError("ESP32 simulator ignored an invalid valve command");
      return false;
    }

    let ack = this.seenCommands.get(command.commandId);
    if (!ack) {
      this.writeLine(`ESP32 received: ${command.action} valve`);
      ack = {
        commandId: command.commandId,
        status: "RECEIVED",
        receivedAt: this.now().toISOString(),
      };
      this.seenCommands.set(command.commandId, ack);
      if (this.seenCommands.size > MAX_REMEMBERED_COMMANDS) {
        const oldest = this.seenCommands.keys().next().value;
        if (oldest) this.seenCommands.delete(oldest);
      }
    }

    await new Promise<void>((resolvePublish, rejectPublish) => {
      this.client.publish(this.ackTopic, JSON.stringify(ack), { qos: 1, retain: false }, (error) => {
        if (error) rejectPublish(error);
        else resolvePublish();
      });
    });
    return true;
  }

  async stop(): Promise<void> {
    if (this.telemetryTimer) clearInterval(this.telemetryTimer);
    this.telemetryTimer = null;
    await new Promise<void>((resolveEnd) => this.client.end(false, {}, () => resolveEnd()));
  }
}

interface SimulatorConfig {
  url: string;
  username?: string;
  password?: string;
  topicPrefix: string;
  deviceId: string;
  telemetryIntervalMs: number;
  rootMoisture: number;
}

export function readSimulatorConfig(env: NodeJS.ProcessEnv): SimulatorConfig {
  const url = env.SIMULATOR_MQTT_URL ?? env.MQTT_URL;
  const deviceId = env.SIMULATOR_DEVICE_ID;
  const topicPrefix = env.SIMULATOR_MQTT_TOPIC_PREFIX ?? env.MQTT_TOPIC_PREFIX ?? "semico/v1/devices";
  const username = env.SIMULATOR_MQTT_USERNAME;
  const password = env.SIMULATOR_MQTT_PASSWORD;
  const telemetryIntervalMs = Number(env.SIMULATOR_TELEMETRY_INTERVAL_MS ?? 5_000);
  const rootMoisture = Number(env.SIMULATOR_ROOT_MOISTURE ?? 17.5);
  if (!url) throw new Error("Set SIMULATOR_MQTT_URL to a valid mqtt:// or mqtts:// broker URL");
  let brokerUrl: URL;
  try {
    brokerUrl = new URL(url);
  } catch {
    throw new Error("Set SIMULATOR_MQTT_URL to a valid mqtt:// or mqtts:// broker URL");
  }
  if (brokerUrl.protocol !== "mqtt:" && brokerUrl.protocol !== "mqtts:") {
    throw new Error("Set SIMULATOR_MQTT_URL to a valid mqtt:// or mqtts:// broker URL");
  }
  if (!deviceId || !/^[A-Za-z0-9_-]+$/.test(deviceId)) throw new Error("Set SIMULATOR_DEVICE_ID to a single MQTT-safe device identifier");
  if (!/^[A-Za-z0-9/_-]+$/.test(topicPrefix)) throw new Error("SIMULATOR_MQTT_TOPIC_PREFIX contains unsupported characters");
  if (Boolean(username) !== Boolean(password)) throw new Error("SIMULATOR_MQTT_USERNAME and SIMULATOR_MQTT_PASSWORD must be set together");
  if (!Number.isInteger(telemetryIntervalMs) || telemetryIntervalMs < 100 || telemetryIntervalMs > 2_147_483_647) {
    throw new Error("SIMULATOR_TELEMETRY_INTERVAL_MS must be an integer between 100 and 2147483647");
  }
  if (!Number.isFinite(rootMoisture) || rootMoisture < 0 || rootMoisture > 100) {
    throw new Error("SIMULATOR_ROOT_MOISTURE must be between 0 and 100");
  }
  return { url, deviceId, topicPrefix, telemetryIntervalMs, rootMoisture, ...(username ? { username, password } : {}) };
}

async function main(): Promise<void> {
  const config = readSimulatorConfig(process.env);
  const client = mqtt.connect(config.url, {
    clientId: `semico-esp32-sim-${config.deviceId}`,
    clean: true,
    reconnectPeriod: 1_000,
    connectTimeout: 10_000,
    username: config.username,
    password: config.password,
  });
  const simulator = new Esp32Simulator({ ...config, client });
  client.on("error", (error) => process.stderr.write(`ESP32 simulator MQTT error: ${error.message}\n`));
  client.on("reconnect", () => process.stderr.write("ESP32 simulator reconnecting\n"));
  simulator.start();
  process.stdout.write(`ESP32 simulator listening for ${config.deviceId} valve commands\n`);

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await simulator.stop();
    process.exit(0);
  };
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error: unknown) => {
    process.stderr.write(`ESP32 simulator: ${error instanceof Error ? error.message : "invalid configuration"}\n`);
    process.exitCode = 1;
  });
}
