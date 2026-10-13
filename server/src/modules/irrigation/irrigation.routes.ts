import { Router } from "express";
import { irrigationController } from "./irrigation.controller.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireFarmAccess, requireValveControl } from "../../middleware/rbac.js";

/**
 * `/api/v1/farms/me/irrigation`
 *
 * The actuating endpoints are gated by `requireValveControl` — an owner always passes; a worker
 * only as an active OPERATOR whose permission is currently granted. Because the guard reads the
 * permission from the database on every request, revoking it takes effect on the operator's very
 * next press of the button, not when their token expires.
 *
 * Reading the command history only needs farm membership.
 *
 * Guards are per-route, not `router.use(...)` — see the note in workers.routes.ts.
 */
export const irrigationRoutes = Router();

const memberOnly = [requireAuth, requireFarmAccess];
const canActuate = [requireAuth, requireFarmAccess, requireValveControl];

irrigationRoutes.post("/irrigation/irrigate", ...canActuate, irrigationController.irrigate);
irrigationRoutes.post("/irrigation/valve", ...canActuate, irrigationController.valve);

irrigationRoutes.get("/irrigation/commands", ...memberOnly, irrigationController.history);
