import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireFarmAccess } from "../../middleware/rbac.js";
import { realtimeController } from "./realtime.controller.js";

export const realtimeRoutes = Router();

realtimeRoutes.post("/realtime-ticket", requireAuth, requireFarmAccess, realtimeController.issueTicket);
