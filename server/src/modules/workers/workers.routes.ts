import { Router } from "express";
import { workersController } from "./workers.controller.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireFarmAccess, requireOwner } from "../../middleware/rbac.js";

/**
 * `/api/v1/farms/me/workers` — owner-only.
 *
 * Worker management is administration, so it gates on ROLE (OWNER), not on the valve capability.
 * An operator with valve control is still not allowed to invite people or change permissions.
 *
 * Guards are attached PER ROUTE rather than with `router.use(...)`. Several routers share the
 * `/farms/me` prefix, and Express runs a mounted router's `use` middleware for every request that
 * enters it — even one no route inside it matches. A router-level `requireOwner` therefore rejected
 * every worker's request to any other `/farms/me/*` route before it ever reached its own handler.
 */
export const workersRoutes = Router();

const ownerOnly = [requireAuth, requireFarmAccess, requireOwner];

workersRoutes.get("/workers", ...ownerOnly, workersController.list);
workersRoutes.post("/workers/invite", ...ownerOnly, workersController.invite);
workersRoutes.patch("/workers/:id", ...ownerOnly, workersController.update);
workersRoutes.patch("/workers/:id/valve-control", ...ownerOnly, workersController.setValveControl);
workersRoutes.post("/workers/:id/reset-password", ...ownerOnly, workersController.resetPassword);
workersRoutes.delete("/workers/:id", ...ownerOnly, workersController.remove);
