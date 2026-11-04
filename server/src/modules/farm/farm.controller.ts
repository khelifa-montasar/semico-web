import type { Request } from "express";
import {
  createFarmSchema,
  farmBoundarySchema,
  farmSettingsSchema,
  updateFarmSchema,
  updateZoneSchema,
  zoneInputSchema,
} from "@semico/shared";
import { ApiError } from "../../lib/ApiError.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { ok } from "../../lib/response.js";
import { idParamSchema, parseBody } from "../../lib/validate.js";
import { farmService } from "./farm.service.js";

function authOf(req: Request) {
  if (!req.auth) throw ApiError.internal("Route is missing requireAuth middleware");
  return req.auth;
}

export const farmController = {
  get: asyncHandler(async (req, res) => ok(res, await farmService.get(authOf(req)))),

  /** The owner's farms, for the switcher. 201 on create, like every other resource creation. */
  list: asyncHandler(async (req, res) => ok(res, await farmService.listMine(authOf(req)))),

  create: asyncHandler(async (req, res) => {
    const input = parseBody(req, createFarmSchema);
    return res.status(201).json({ data: await farmService.create(authOf(req), input, req) });
  }),

  updateBoundary: asyncHandler(async (req, res) => {
    const input = parseBody(req, farmBoundarySchema);
    return ok(res, await farmService.updateBoundary(authOf(req), input, req));
  }),

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

  createZone: asyncHandler(async (req, res) => {
    const input = parseBody(req, zoneInputSchema);
    return res.status(201).json({ data: await farmService.createZone(authOf(req), input, req) });
  }),

  updateZone: asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const input = parseBody(req, updateZoneSchema);
    return ok(res, await farmService.updateZone(authOf(req), id, input, req));
  }),
};
