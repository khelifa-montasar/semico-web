import { Router } from "express";
import { analyticsController } from "./analytics.controller.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireFarmAccess } from "../../middleware/rbac.js";

/**
 * `/api/v1/farms/me/analytics`
 *
 * Read-only for every active member. Guards are per-route, not `router.use(...)` — see the note in
 * workers.routes.ts for why that distinction matters when several routers share a prefix.
 */
export const analyticsRoutes = Router();

const memberOnly = [requireAuth, requireFarmAccess];

analyticsRoutes.get("/analytics/overview", ...memberOnly, analyticsController.overview);
analyticsRoutes.get("/analytics/moisture", ...memberOnly, analyticsController.moisture);
analyticsRoutes.get("/analytics/flow", ...memberOnly, analyticsController.flow);
analyticsRoutes.get("/analytics/heatmap", ...memberOnly, analyticsController.heatmap);
analyticsRoutes.get("/analytics/export", ...memberOnly, analyticsController.export);
