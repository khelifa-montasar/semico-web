import { z } from "zod";
import { IRRIGATION_ACTIONS } from "../enums.js";

const commandIdSchema = z.string().min(1).max(100);

export const mqttValveCommandSchema = z.object({
  commandId: commandIdSchema,
  zoneId: z.string().min(1).max(100),
  action: z.enum(IRRIGATION_ACTIONS),
  durationMin: z.number().int().min(1).max(120).nullable(),
  issuedAt: z.string().datetime(),
}).strict().superRefine((command, ctx) => {
  if (command.action === "OPEN" && command.durationMin === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["durationMin"], message: "OPEN commands require a duration" });
  }
  if (command.action === "CLOSE" && command.durationMin !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["durationMin"], message: "CLOSE commands must not include a duration" });
  }
});

const receivedValveCommandAckSchema = z.object({
  commandId: commandIdSchema,
  status: z.literal("RECEIVED"),
  receivedAt: z.string().datetime(),
}).strict();

const executedValveCommandAckSchema = z.object({
  commandId: commandIdSchema,
  status: z.literal("EXECUTED"),
  valveState: z.enum(["OPEN", "CLOSED"]),
  completedAt: z.string().datetime(),
}).strict();

const failedValveCommandAckSchema = z.object({
  commandId: commandIdSchema,
  status: z.literal("FAILED"),
  completedAt: z.string().datetime(),
  errorCode: z.string().trim().min(1).max(64),
}).strict();

export const mqttValveCommandAckSchema = z.discriminatedUnion("status", [
  receivedValveCommandAckSchema,
  executedValveCommandAckSchema,
  failedValveCommandAckSchema,
]);

export type ValveCommandMessage = z.infer<typeof mqttValveCommandSchema>;
export type ValveCommandAck = z.infer<typeof mqttValveCommandAckSchema>;

export function valveCommandTopic(topicPrefix: string, deviceId: string): string {
  return `${topicPrefix}/${deviceId}/commands/valve`;
}

export function valveCommandAckTopic(topicPrefix: string, deviceId: string): string {
  return `${topicPrefix}/${deviceId}/acks/valve`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseValveCommandAckTopic(topic: string, topicPrefix: string): string | null {
  const match = topic.match(new RegExp(`^${escapeRegex(topicPrefix)}/([^/]+)/acks/valve$`));
  return match?.[1] ?? null;
}
