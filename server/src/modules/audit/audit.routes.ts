import { Router } from "express";
import { auditController } from "./audit.controller.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireFarmAccess, requireOwner } from "../../middleware/rbac.js";

/**
 * `/api/v1/farms/me/audit` — the security audit trail, owner-only.
 *
 * Separate from the activity feed because the audiences differ: the feed is bilingual and readable
 * by every member, this carries actor IP and user agent and is restricted to the person accountable
 * for the farm.
 *
 * Guards are per-route, not `router.use(...)` — see the note in workers.routes.ts.
 */
export const auditRoutes = Router();

auditRoutes.get("/audit", requireAuth, requireFarmAccess, requireOwner, auditController.list);
