import { z } from "zod";
import { createLeadSchema, updateLeadSchema } from "@semico/shared";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { created, ok } from "../../lib/response.js";
import { idParamSchema, parseBody, parseParams, parseQuery } from "../../lib/validate.js";
import { leadsService } from "./leads.service.js";

const listQuerySchema = z.object({
  status: z.enum(["NEW", "CONTACTED", "CLOSED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const leadsController = {
  /** Public: the lead form is on the marketing pages and filled in by anonymous visitors. */
  create: asyncHandler(async (req, res) => {
    const input = parseBody(req, createLeadSchema);
    return created(res, await leadsService.create(input));
  }),

  list: asyncHandler(async (req, res) => {
    const query = parseQuery(req, listQuerySchema);
    const { leads, meta } = await leadsService.list({ status: query.status }, query);
    return ok(res, leads, meta);
  }),

  update: asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParamSchema);
    const input = parseBody(req, updateLeadSchema);
    return ok(res, await leadsService.update(id, input));
  }),
};
