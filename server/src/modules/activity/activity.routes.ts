import { Router } from "express";
import { activityController } from "./activity.controller.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireFarmAccess } from "../../middleware/rbac.js";

/**
 * `/api/v1/farms/me/activity`
 *
 * Read-only for every active member — operators and engineers see the same feed. Only the owner
 * sees the security audit, which is a separate endpoint.
 *
 * Guards are per-route, not `router.use(...)` — see the note in workers.routes.ts.
 */
export const activityRoutes = Router();

const memberOnly = [requireAuth, requireFarmAccess];

activityRoutes.get("/activity", ...memberOnly, activityController.feed);
activityRoutes.get("/activity/calendar", ...memberOnly, activityController.calendar);
