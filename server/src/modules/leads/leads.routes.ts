import { Router } from "express";
import { leadsController } from "./leads.controller.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireOwner } from "../../middleware/rbac.js";
import { authLimiter } from "../../middleware/rateLimit.js";

/**
 * `/api/v1/leads`
 *
 * Creation is public — the form sits on the Services page and is filled in by anonymous visitors —
 * and is rate-limited on the same budget as login, since it is unauthenticated and writes to the
 * database.
 *
 * Reading and updating are owner-only: a lead list is a sales pipeline.
 *
 * Guards are per-route, not `router.use(...)` — see the note in workers.routes.ts.
 */
export const leadsRoutes = Router();

leadsRoutes.post("/", authLimiter, leadsController.create);

leadsRoutes.get("/", requireAuth, requireOwner, leadsController.list);
leadsRoutes.patch("/:id", requireAuth, requireOwner, leadsController.update);
