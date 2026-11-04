import { Router } from "express";
import { farmController } from "./farm.controller.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireFarmAccess, requireOwner } from "../../middleware/rbac.js";
import { idParamSchema } from "../../lib/validate.js";
import { prisma } from "../../db/prisma.js";
import { ApiError } from "../../lib/ApiError.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { ok } from "../../lib/response.js";

/**
 * `/api/v1/farms` — the caller's farms, and `/api/v1/farms/me` — the active one.
 *
 * Every per-farm resource is addressed as `me` rather than by id: there is deliberately no route
 * that takes a farm id, so cross-farm access is not expressible rather than merely forbidden. Which
 * of an owner's farms `me` resolves to is decided by `requireAuth` (the `X-Farm-Id` header, or the
 * oldest farm when absent).
 *
 * Reads are open to any active member (engineers included — they are read-only on valves). Writes
 * are owner-only, and guards are per-route rather than `router.use(...)` so a future owner-only
 * route here cannot leak its guard onto other routers sharing the `/farms` prefix.
 */
export const farmRoutes = Router();

const memberOnly = [requireAuth, requireFarmAccess];
const ownerOnly = [requireAuth, requireFarmAccess, requireOwner];

// The owner's farms themselves. Owner-only, and no farm access guard: holding farms is what being
// an owner means, so requiring one first would make the list unreachable for a new account.
farmRoutes.get("/", requireAuth, requireOwner, farmController.list);
farmRoutes.post("/", requireAuth, requireOwner, farmController.create);

farmRoutes.get("/me", ...memberOnly, farmController.get);
farmRoutes.patch("/me", ...ownerOnly, farmController.update);

/** The owner-drawn outline. Saved separately from the profile: it is a shape, not a text field. */
farmRoutes.patch("/me/boundary", ...ownerOnly, farmController.updateBoundary);

farmRoutes.get("/me/settings", ...memberOnly, farmController.getSettings);
farmRoutes.patch("/me/settings", ...ownerOnly, farmController.updateSettings);

farmRoutes.post("/me/owner-code/rotate", ...ownerOnly, farmController.rotateOwnerCode);

farmRoutes.get("/me/zones", ...memberOnly, farmController.listZones);
farmRoutes.post("/me/zones", ...ownerOnly, farmController.createZone);
farmRoutes.patch("/me/zones/:id", ...ownerOnly, farmController.updateZone);

/**
 * A single zone, scoped to the caller's farm.
 *
 * Defined here rather than in the telemetry module because a zone is farm metadata, not a reading.
 */
farmRoutes.get(
  "/me/zones/:id",
  ...memberOnly,
  asyncHandler(async (req, res) => {
    const auth = req.auth;
    if (!auth?.farmId) throw ApiError.forbidden("You are not attached to a farm yet");

    const { id } = idParamSchema.parse(req.params);
    const zone = await prisma.zone.findFirst({ where: { id, farmId: auth.farmId } });
    // 404 rather than 403 for a zone belonging to someone else — a 403 would confirm it exists.
    if (!zone) throw ApiError.notFound("That zone does not exist");

    return ok(res, {
      id: zone.id,
      name: zone.name,
      valveState: zone.valveState,
      sortOrder: zone.sortOrder,
    });
  }),
);
