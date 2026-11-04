import {
  analyticsDateSchema,
  analyticsMonthSchema,
  analyticsRangeSchema,
  analyticsWindowSchema,
  exportQuerySchema,
  whatIfSchema,
} from "@semico/shared";
import type { Response } from "express";
import { ApiError } from "../../lib/ApiError.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { ok } from "../../lib/response.js";
import { parseQuery } from "../../lib/validate.js";
import { analyticsService } from "./analytics.service.js";
import type { AuthContext } from "../../types/auth.js";

function authOf(req: { auth?: AuthContext }): AuthContext {
  if (!req.auth) throw ApiError.internal("Route is missing requireAuth middleware");
  return req.auth;
}

export const analyticsController = {
  overview: asyncHandler(async (req, res) => {
    const query = parseQuery(req, analyticsRangeSchema);
    return ok(res, await analyticsService.overview(authOf(req), query));
  }),

  /** The moisture trend. Same series the dashboard chart uses, so they cannot diverge. */
  moisture: asyncHandler(async (req, res) => {
    const query = parseQuery(req, analyticsWindowSchema);
    return ok(res, await analyticsService.moisture(authOf(req), query));
  }),

  /** Hourly drying curve for one day, with the rainfall what-if applied. */
  flow: asyncHandler(async (req, res) => {
    const query = parseQuery(req, whatIfSchema.extend({ date: analyticsDateSchema.shape.date }));
    return ok(res, await analyticsService.flow(authOf(req), query.date, query.rainfallMm));
  }),

  heatmap: asyncHandler(async (req, res) => {
    const { month } = parseQuery(req, analyticsMonthSchema);
    return ok(res, await analyticsService.heatmap(authOf(req), month));
  }),

  /**
   * CSV download.
   *
   * Sends raw text rather than the JSON envelope, because the browser is expected to save this as a
   * file. The client's `http.ts` unwraps envelopes, so this endpoint is fetched directly.
   */
  export: asyncHandler(async (req, res: Response) => {
    const query = parseQuery(req, exportQuerySchema);

    // `format` was accepted and then ignored: the schema offered JSON and the endpoint always sent
    // CSV. Honouring it is the smaller fix of the two (the alternative was dropping the option),
    // and the client only ever asks for CSV, so nothing changes for it.
    if (query.format === "json") {
      return ok(res, await analyticsService.moisture(authOf(req), query));
    }

    const csv = await analyticsService.exportCsv(authOf(req), query);

    res
      .status(200)
      .setHeader("Content-Type", "text/csv; charset=utf-8")
      .setHeader(
        "Content-Disposition",
        `attachment; filename="semico-moisture-${query.range}.csv"`,
      )
      .send(csv);
  }),
};
