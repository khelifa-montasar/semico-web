import type { RequestHandler } from "express";
import { ApiError } from "../../lib/ApiError.js";
import { ok } from "../../lib/response.js";
import { realtimeService } from "./realtime.service.js";

export const realtimeController: { issueTicket: RequestHandler } = {
  issueTicket: (req, res) => {
    if (!req.auth?.farmId) throw ApiError.internal("Route is missing farm authorization");
    return ok(res, realtimeService.issueTicket(req.auth.userId, req.auth.farmId));
  },
};
