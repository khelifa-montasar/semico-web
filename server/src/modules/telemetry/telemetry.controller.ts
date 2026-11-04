import { z } from "zod";
import { telemetryQuerySchema } from "@semico/shared";
import { ApiError } from "../../lib/ApiError.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { ok } from "../../lib/response.js";
import { parseQuery } from "../../lib/validate.js";
import { telemetryService } from "./telemetry.service.js";

function authOf(req: Parameters<typeof parseQuery>[0] & { auth?: import("../../types/auth.js").AuthContext }) {
  if (!req.auth) throw ApiError.internal("Route is missing requireAuth middleware");
  return req.auth;
}

const zoneQuerySchema = z.object({ zoneId: z.string().trim().optional() });
const limitQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const telemetryController = {
  /** Latest reading for the farm, or for one zone. Feeds the dashboard gauge. */
  latest: asyncHandler(async (req, res) => {
    const { zoneId } = parseQuery(req, zoneQuerySchema);
    return ok(res, await telemetryService.latest(authOf(req), zoneId));
  }),

  latestPerZone: asyncHandler(async (req, res) =>
    ok(res, await telemetryService.latestPerZone(authOf(req))),
  ),

  /** The moisture series. `?interval=day` gives the 7-day trend, `hour` the intraday detail. */
  series: asyncHandler(async (req, res) => {
    const query = parseQuery(req, telemetryQuerySchema);
    return ok(res, await telemetryService.series(authOf(req), query));
  }),

  deviceStatus: asyncHandler(async (req, res) =>
    ok(res, await telemetryService.deviceStatus(authOf(req))),
  ),

  /** Sensors grouped by zone, for the System Health main view. */
  sensors: asyncHandler(async (req, res) =>
    ok(res, await telemetryService.sensorsByZone(authOf(req))),
  ),

  systemHealth: asyncHandler(async (req, res) =>
    ok(res, await telemetryService.systemHealth(authOf(req))),
  ),

  errorLogs: asyncHandler(async (req, res) => {
    const { limit } = parseQuery(req, limitQuerySchema);
    return ok(res, await telemetryService.errorLogs(authOf(req), limit));
  }),
};
