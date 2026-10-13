import { commandQuerySchema, irrigateSchema, valveCommandSchema } from "@semico/shared";
import { ApiError } from "../../lib/ApiError.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { created, ok } from "../../lib/response.js";
import { parseBody, parseQuery } from "../../lib/validate.js";
import { irrigationService } from "./irrigation.service.js";

function authOf(req: { auth?: import("../../types/auth.js").AuthContext }) {
  if (!req.auth) throw ApiError.internal("Route is missing requireAuth middleware");
  return req.auth;
}

export const irrigationController = {
  /** "Irrigate now" — opens a valve for a bounded duration. */
  irrigate: asyncHandler(async (req, res) => {
    const input = parseBody(req, irrigateSchema);
    return created(res, await irrigationService.irrigate(authOf(req), input, req));
  }),

  /** Manual open/close from Settings. */
  valve: asyncHandler(async (req, res) => {
    const input = parseBody(req, valveCommandSchema);
    return created(res, await irrigationService.valve(authOf(req), input, req));
  }),

  history: asyncHandler(async (req, res) => {
    const query = parseQuery(req, commandQuerySchema);
    const { commands, meta } = await irrigationService.history(
      authOf(req),
      { status: query.status, zoneId: query.zoneId },
      query,
    );
    return ok(res, commands, meta);
  }),
};
