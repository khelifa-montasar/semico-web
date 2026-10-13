import { activityQuerySchema, calendarQuerySchema } from "@semico/shared";
import { ApiError } from "../../lib/ApiError.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { ok } from "../../lib/response.js";
import { parseQuery } from "../../lib/validate.js";
import { activityService } from "./activity.service.js";

function authOf(req: { auth?: import("../../types/auth.js").AuthContext }) {
  if (!req.auth) throw ApiError.internal("Route is missing requireAuth middleware");
  return req.auth;
}

export const activityController = {
  /** Paged feed with `type` / `kind` / `zoneId` / date-range filters. */
  feed: asyncHandler(async (req, res) => {
    const query = parseQuery(req, activityQuerySchema);
    const { entries, meta } = await activityService.feed(authOf(req), query);
    return ok(res, entries, meta);
  }),

  calendar: asyncHandler(async (req, res) => {
    const { month } = parseQuery(req, calendarQuerySchema);
    return ok(res, await activityService.calendar(authOf(req), month));
  }),
};
