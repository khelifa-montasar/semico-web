import { Router } from "express";
import { analyticsController } from "./analytics.controller.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireExportAccess, requireFarmAccess } from "../../middleware/rbac.js";

/**
 * `/api/v1/farms/me/analytics`
 *
 * Reads are open to every active member. Export is not: it requires the export capability (owner or
 * engineer), because taking the dataset away is a different permission from reading a chart on
 * screen. Guards are per-route, not `router.use(...)` — see the note in workers.routes.ts for why
 * that distinction matters when several routers share a prefix.
 */
export const analyticsRoutes = Router();

const memberOnly = [requireAuth, requireFarmAccess];

analyticsRoutes.get("/analytics/overview", ...memberOnly, analyticsController.overview);
analyticsRoutes.get("/analytics/moisture", ...memberOnly, analyticsController.moisture);
analyticsRoutes.get("/analytics/flow", ...memberOnly, analyticsController.flow);
analyticsRoutes.get("/analytics/heatmap", ...memberOnly, analyticsController.heatmap);
analyticsRoutes.get(
  "/analytics/export",
  ...memberOnly,
  requireExportAccess,
  analyticsController.export,
);
