import type { Request } from "express";
import { farmSettingsSchema, updateFarmSchema } from "@semico/shared";
import { ApiError } from "../../lib/ApiError.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { ok } from "../../lib/response.js";
import { parseBody } from "../../lib/validate.js";
import { farmService } from "./farm.service.js";

function authOf(req: Request) {
  if (!req.auth) throw ApiError.internal("Route is missing requireAuth middleware");
  return req.auth;
}

export const farmController = {
  get: asyncHandler(async (req, res) => ok(res, await farmService.get(authOf(req)))),

  update: asyncHandler(async (req, res) => {
    const input = parseBody(req, updateFarmSchema);
    return ok(res, await farmService.update(authOf(req), input, req));
  }),

  getSettings: asyncHandler(async (req, res) => ok(res, await farmService.getSettings(authOf(req)))),

  updateSettings: asyncHandler(async (req, res) => {
    // Partial: the Settings page saves individual controls, not the whole form at once.
    const input = parseBody(req, farmSettingsSchema.partial());
    return ok(res, await farmService.updateSettings(authOf(req), input, req));
  }),

  rotateOwnerCode: asyncHandler(async (req, res) =>
    ok(res, await farmService.rotateOwnerCode(authOf(req), req)),
  ),

  listZones: asyncHandler(async (req, res) => ok(res, await farmService.listZones(authOf(req)))),
};
