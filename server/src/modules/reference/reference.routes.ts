import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { ok } from "../../lib/response.js";
import { contentService } from "../content/content.service.js";

/**
 * `/api/v1/reference` — lookup data.
 *
 * Currently the 58 Algerian wilayas, which back the Settings address dropdown and the farm
 * address. Public because the signup form needs the list before an account exists.
 */
export const referenceRoutes = Router();

referenceRoutes.get(
  "/wilayas",
  asyncHandler(async (_req, res) => ok(res, await contentService.wilayas())),
);
