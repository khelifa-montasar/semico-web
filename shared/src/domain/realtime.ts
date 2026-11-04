import { z } from "zod";

/** Events delivered to a browser connection already bound to one authorized farm. */
export const realtimeEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("telemetry.updated"),
    farmId: z.string().min(1),
    zoneId: z.string().nullable(),
    recordedAt: z.string().datetime(),
  }).strict(),
  z.object({
    type: z.literal("device-status.updated"),
    farmId: z.string().min(1),
    updatedAt: z.string().datetime(),
  }).strict(),
  z.object({
    type: z.literal("alert.updated"),
    farmId: z.string().min(1),
    evaluatedAt: z.string().datetime(),
    activeAlerts: z.array(z.object({
      code: z.enum(["MOISTURE_LOW", "GATEWAY_OFFLINE"]),
      targetId: z.string().min(1),
      zoneId: z.string().min(1).nullable(),
    }).strict()),
  }).strict(),
]);

export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
