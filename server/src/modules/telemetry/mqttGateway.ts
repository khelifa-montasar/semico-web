import mqtt, { type IClientOptions, type MqttClient } from "mqtt";
import { z } from "zod";
import {
  parseValveCommandAckTopic,
  mqttValveCommandAckSchema,
  valveCommandTopic,
  mqttValveCommandSchema,
  type RealtimeEvent,
  type ValveCommandMessage,
} from "@semico/shared";
import { prisma } from "../../db/prisma.js";
import { ApiError } from "../../lib/ApiError.js";
import { irrigationRepository } from "../irrigation/irrigation.repository.js";
import { logger } from "../../middleware/requestLogger.js";
import { telemetryRepository } from "./telemetry.repository.js";
import { mqttDeviceActivity } from "./deviceActivity.js";

export interface MqttDeviceMapping {
  farmId: string;
  zoneId?: string;
  sensorKey?: string;
  kind: "CONTROLLER" | "GATEWAY" | "SENSOR";
}

export type FarmEventPublisher = (event: RealtimeEvent) => void;

class InvalidMqttMessageError extends Error {}

const telemetryMessageSchema = z.object({
  messageId: z.string().uuid(),
  recordedAt: z.string().datetime().optional(),
  rootMoisture: z.number().min(0).max(100).nullable().optional(),
  surfaceMoisture: z.number().min(0).max(100).nullable().optional(),
  soilTempC: z.number().min(-40).max(85).nullable().optional(),
  batteryPct: z.number().int().min(0).max(100).nullable().optional(),
  flowRateLpm: z.number().min(0).max(10_000).nullable().optional(),
  loraRssi: z.number().int().min(-200).max(0).nullable().optional(),
  valveState: z.enum(["OPEN", "CLOSED"]).nullable().optional(),
}).strict().refine((message) =>
  Object.keys(message).some((key) => key !== "messageId" && key !== "recordedAt"),
  "At least one measurement is required",
);

const MAX_MESSAGE_BYTES = 16 * 1024;
const MAX_READING_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseTelemetryTopic(topic: string, topicPrefix: string): string | null {
  const match = topic.match(new RegExp(`^${escapeRegex(topicPrefix)}/([^/]+)/telemetry$`));
  return match?.[1] ?? null;
}

export class MqttGateway {
  private client: MqttClient | null = null;
  private offlineMonitor: ReturnType<typeof setInterval> | null = null;
  private readonly gatewayLastSeen = new Map<string, number>();
  private readonly offlineGateways = new Set<string>();
  private readonly lowMoistureDevices = new Map<string, { farmId: string; zoneId: string | null }>();
  private readonly publishedAlertSnapshots = new Map<string, string>();

  constructor(
    private readonly options: {
      url?: string;
      username?: string;
      password?: string;
      topicPrefix: string;
      devices: Record<string, MqttDeviceMapping>;
      publishFarmEvent: FarmEventPublisher;
      receiptTimeoutMs?: number;
      deviceOfflineTimeoutMs?: number;
      now?: () => number;
      connect?: (url: string, options: IClientOptions) => MqttClient;
    },
  ) {}

  private readonly receiptTimers = new Map<string, ReturnType<typeof setTimeout>>();

  start(): void {
    if (!this.offlineMonitor) {
      const timeoutMs = this.options.deviceOfflineTimeoutMs ?? 120_000;
      this.offlineMonitor = setInterval(
        () => this.checkOfflineGateways(),
        Math.max(250, Math.min(10_000, Math.floor(timeoutMs / 4))),
      );
      this.offlineMonitor.unref();
    }
    if (!this.options.url) {
      logger.info("MQTT gateway disabled (MQTT_URL is unset)");
      return;
    }

    const connect = this.options.connect ?? mqtt.connect;
    this.client = connect(this.options.url, {
      clientId: `semico-server-${process.pid}`,
      clean: true,
      connectTimeout: 10_000,
      reconnectPeriod: 1_000,
      username: this.options.username,
      password: this.options.password,
    });

    this.client.on("connect", () => {
      logger.info("MQTT gateway connected");
      this.client?.subscribe(
        [
          `${this.options.topicPrefix}/+/telemetry`,
          `${this.options.topicPrefix}/+/acks/valve`,
        ],
        { qos: 1 },
        (error) => {
          if (error) logger.error({ err: error }, "MQTT device topic subscription failed");
        },
      );
    });
    this.client.on("reconnect", () => logger.warn("MQTT gateway reconnecting"));
    this.client.on("offline", () => logger.warn("MQTT gateway offline"));
    this.client.on("error", (error) => logger.error({ err: error }, "MQTT gateway error"));

    // MQTT.js sends PUBACK after handleMessage completes. Persist before acknowledging so a
    // transient database failure causes QoS 1 redelivery instead of silently losing the reading.
    const acknowledge = this.client.handleMessage.bind(this.client);
    this.client.handleMessage = (packet, callback) => {
      void this.processPacket(packet.topic, packet.payload)
        .then(() => acknowledge(packet, callback))
        .catch((error: unknown) => {
          logger.warn({ topic: packet.topic, err: error instanceof Error ? error.message : "invalid message" }, "MQTT device message rejected");
          if (error instanceof InvalidMqttMessageError) acknowledge(packet, callback);
          else callback(error instanceof Error ? error : new Error("MQTT message processing failed"));
        });
    };
  }

  async stop(): Promise<void> {
    const client = this.client;
    this.client = null;
    if (this.offlineMonitor) clearInterval(this.offlineMonitor);
    this.offlineMonitor = null;
    for (const timer of this.receiptTimers.values()) clearTimeout(timer);
    this.receiptTimers.clear();
    if (!client) return;
    await new Promise<void>((resolve) => client.end(false, {}, () => resolve()));
  }

  checkOfflineGateways(now = this.options.now?.() ?? Date.now()): void {
    const timeoutMs = this.options.deviceOfflineTimeoutMs ?? 120_000;
    for (const [deviceId, device] of Object.entries(this.options.devices)) {
      if (device.kind !== "GATEWAY") continue;
      const lastSeenAt = this.gatewayLastSeen.get(deviceId);
      if (lastSeenAt === undefined || now - lastSeenAt < timeoutMs || this.offlineGateways.has(deviceId)) continue;
      this.offlineGateways.add(deviceId);
      this.publishAlertSnapshot(device.farmId);
    }
  }

  private publishAlertSnapshot(farmId: string): void {
    const activeAlerts = [
      ...[...this.lowMoistureDevices.entries()]
        .filter(([, alert]) => alert.farmId === farmId)
        .map(([deviceId, alert]) => ({
          code: "MOISTURE_LOW" as const,
          targetId: alert.zoneId ?? deviceId,
          zoneId: alert.zoneId,
        })),
      ...[...this.offlineGateways]
        .filter((deviceId) => this.options.devices[deviceId]?.farmId === farmId)
        .map((deviceId) => ({
          code: "GATEWAY_OFFLINE" as const,
          targetId: deviceId,
          zoneId: this.options.devices[deviceId]?.zoneId ?? null,
        })),
    ].sort((a, b) => `${a.code}:${a.targetId}`.localeCompare(`${b.code}:${b.targetId}`));
    const snapshot = JSON.stringify(activeAlerts);
    if (this.publishedAlertSnapshots.get(farmId) === snapshot) return;
    this.publishedAlertSnapshots.set(farmId, snapshot);
    this.options.publishFarmEvent({
      type: "alert.updated",
      farmId,
      evaluatedAt: new Date().toISOString(),
      activeAlerts,
    });
  }

  assertCanRoute(farmId: string, zoneId: string): void {
    const matches = Object.entries(this.options.devices).filter(([, device]) =>
      device.kind === "CONTROLLER" && device.farmId === farmId && device.zoneId === zoneId,
    );
    if (matches.length !== 1) {
      throw new ApiError(503, "DEVICE_UNAVAILABLE", matches.length === 0
        ? "No MQTT controller is mapped to this farm zone"
        : "Multiple MQTT controllers are mapped to this farm zone");
    }
  }

  async publishValveCommand(command: ValveCommandMessage, farmId: string): Promise<void> {
    const parsed = mqttValveCommandSchema.parse(command);
    this.assertCanRoute(farmId, parsed.zoneId);
    const [deviceId] = Object.entries(this.options.devices).find(([, device]) =>
      device.kind === "CONTROLLER" && device.farmId === farmId && device.zoneId === parsed.zoneId,
    ) ?? [];
    const client = this.client;
    if (!deviceId || !client?.connected) throw new Error("MQTT command gateway is not connected");

    this.clearReceiptTimer(parsed.commandId);
    const timer = setTimeout(() => {
      this.receiptTimers.delete(parsed.commandId);
      void irrigationRepository.failUnacknowledgedCommand(parsed.commandId).catch((error: unknown) => {
        logger.error({ err: error, commandId: parsed.commandId }, "Valve command receipt timeout could not be recorded");
      });
    }, this.options.receiptTimeoutMs ?? 30_000);
    timer.unref();
    this.receiptTimers.set(parsed.commandId, timer);

    try {
      await new Promise<void>((resolve, reject) => {
        client.publish(
          valveCommandTopic(this.options.topicPrefix, deviceId),
          JSON.stringify(parsed),
          { qos: 1, retain: false },
          (error) => error ? reject(error) : resolve(),
        );
      });
    } catch (error) {
      this.clearReceiptTimer(parsed.commandId);
      throw error;
    }
  }

  async processPacket(topic: string, payload: Buffer | string): Promise<void> {
    const deviceId = parseValveCommandAckTopic(topic, this.options.topicPrefix);
    if (deviceId) {
      await this.ingestValveCommandAck(deviceId, payload);
      return;
    }
    await this.ingest(topic, payload);
  }

  async ingestValveCommandAck(deviceId: string, payload: Buffer | string): Promise<void> {
    const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
    if (bytes.byteLength > MAX_MESSAGE_BYTES) throw new InvalidMqttMessageError("MQTT acknowledgment exceeds size limit");
    const device = this.options.devices[deviceId];
    if (!device || device.kind !== "CONTROLLER" || !device.zoneId) {
      throw new InvalidMqttMessageError("Acknowledgment topic is not mapped to a controller zone");
    }

    let ack: z.infer<typeof mqttValveCommandAckSchema>;
    try {
      ack = mqttValveCommandAckSchema.parse(JSON.parse(bytes.toString("utf8")));
    } catch {
      throw new InvalidMqttMessageError("Invalid valve command acknowledgment");
    }

    const command = await irrigationRepository.findCommand(ack.commandId);
    if (!command || command.farmId !== device.farmId || command.zoneId !== device.zoneId) {
      throw new InvalidMqttMessageError("Acknowledgment does not match this controller's farm and zone");
    }
    if (command.status !== "PENDING") {
      mqttDeviceActivity.markSeen(deviceId);
      return;
    }

    if (ack.status === "RECEIVED") {
      const marked = await irrigationRepository.markCommandReceived(
        command.id,
        device.farmId,
        device.zoneId,
        new Date(ack.receivedAt),
      );
      if (marked) this.clearReceiptTimer(command.id);
      mqttDeviceActivity.markSeen(deviceId);
      return;
    }

    if (ack.status === "EXECUTED") {
      const expectedState = command.action === "OPEN" ? "OPEN" : "CLOSED";
      if (ack.valveState !== expectedState) {
        throw new InvalidMqttMessageError("Acknowledgment valve state does not match the command");
      }
      await irrigationRepository.completeCommand({
        commandId: command.id,
        farmId: device.farmId,
        zoneId: device.zoneId,
        action: command.action,
        status: "EXECUTED",
        executedAt: new Date(ack.completedAt),
        valveState: ack.valveState,
      });
    } else {
      await irrigationRepository.completeCommand({
        commandId: command.id,
        farmId: device.farmId,
        zoneId: device.zoneId,
        action: command.action,
        status: "FAILED",
      });
    }
    this.clearReceiptTimer(command.id);
    mqttDeviceActivity.markSeen(deviceId);
  }

  private clearReceiptTimer(commandId: string): void {
    const timer = this.receiptTimers.get(commandId);
    if (timer) clearTimeout(timer);
    this.receiptTimers.delete(commandId);
  }

  async ingest(topic: string, payload: Buffer | string): Promise<void> {
    const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
    if (bytes.byteLength > MAX_MESSAGE_BYTES) throw new InvalidMqttMessageError("MQTT message exceeds size limit");

    const deviceId = parseTelemetryTopic(topic, this.options.topicPrefix);
    if (!deviceId) throw new InvalidMqttMessageError("Unsupported MQTT topic");
    const device = this.options.devices[deviceId];
    if (!device) throw new InvalidMqttMessageError("Unknown MQTT device");

    let message: z.infer<typeof telemetryMessageSchema>;
    try {
      const decoded: unknown = JSON.parse(bytes.toString("utf8"));
      message = telemetryMessageSchema.parse(decoded);
    } catch {
      throw new InvalidMqttMessageError("Invalid MQTT telemetry payload");
    }
    const recordedAt = message.recordedAt ? new Date(message.recordedAt) : new Date();
    const now = Date.now();
    if (recordedAt.getTime() < now - MAX_READING_AGE_MS || recordedAt.getTime() > now + MAX_FUTURE_SKEW_MS) {
      throw new InvalidMqttMessageError("MQTT reading timestamp is outside the accepted window");
    }

    if (device.zoneId) {
      const zone = await prisma.zone.findFirst({
        where: { id: device.zoneId, farmId: device.farmId },
        select: { id: true },
      });
      if (!zone) throw new InvalidMqttMessageError("Configured MQTT zone is not part of the mapped farm");
    }
    if (device.sensorKey) {
      const sensor = await prisma.sensor.findFirst({
        where: {
          farmId: device.farmId,
          key: device.sensorKey,
          ...(device.zoneId ? { zoneId: device.zoneId } : {}),
        },
        select: { id: true },
      });
      if (!sensor) throw new InvalidMqttMessageError("Configured MQTT sensor is not part of the mapped farm");
    }

    const result = await telemetryRepository.persistDeviceReading({
      kind: device.kind,
      sensorKey: device.sensorKey,
      reading: {
        farmId: device.farmId,
        zoneId: device.zoneId ?? null,
        recordedAt,
        sourceMessageId: message.messageId,
        rootMoisture: message.rootMoisture,
        surfaceMoisture: message.surfaceMoisture,
        soilTempC: message.soilTempC,
        batteryPct: message.batteryPct,
        flowRateLpm: message.flowRateLpm,
        loraRssi: message.loraRssi,
        valveState: message.valveState,
      },
    });

    mqttDeviceActivity.markSeen(deviceId);

    // MQTT QoS 1 may redeliver. The farm/message unique key makes duplicate delivery a no-op.
    if (result.duplicate) return;

    this.options.publishFarmEvent({
      type: "telemetry.updated",
      farmId: device.farmId,
      zoneId: device.zoneId ?? null,
      recordedAt: result.reading.recordedAt.toISOString(),
    });
    if (result.status) {
      this.options.publishFarmEvent({
        type: "device-status.updated",
        farmId: device.farmId,
        updatedAt: result.status.updatedAt.toISOString(),
      });
    }

    if (message.rootMoisture != null) {
      if (message.rootMoisture < 18) {
        this.lowMoistureDevices.set(deviceId, { farmId: device.farmId, zoneId: device.zoneId ?? null });
      } else {
        this.lowMoistureDevices.delete(deviceId);
      }
    }
    if (device.kind === "GATEWAY") {
      this.gatewayLastSeen.set(deviceId, this.options.now?.() ?? Date.now());
      this.offlineGateways.delete(deviceId);
    }
    this.publishAlertSnapshot(device.farmId);
  }
}
