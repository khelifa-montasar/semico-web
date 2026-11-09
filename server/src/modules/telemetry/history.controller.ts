import { z } from "zod";
import { ApiError } from "../../lib/ApiError.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { ok } from "../../lib/response.js";
import { historyService } from "./history.service.js";

const identifier = z.string().trim().min(1).max(128);

export const historyController = {
  zone: asyncHandler(async (req, res) => {
    if (!req.auth) throw ApiError.internal("Route is missing authentication");
    return ok(
      res,
      await historyService.detail(
        req.auth,
        "zone",
        identifier.parse(req.params.zoneId),
      ),
    );
  }),
  sensor: asyncHandler(async (req, res) => {
    if (!req.auth) throw ApiError.internal("Route is missing authentication");
    return ok(
      res,
      await historyService.detail(
        req.auth,
        "sensor",
        identifier.parse(req.params.sensorId),
      ),
    );
  }),
};
