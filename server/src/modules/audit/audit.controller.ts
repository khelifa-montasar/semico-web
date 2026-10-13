import { z } from "zod";
import { ApiError } from "../../lib/ApiError.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { ok } from "../../lib/response.js";
import { parseQuery } from "../../lib/validate.js";
import { auditService } from "./audit.service.js";
import type { AuthContext } from "../../types/auth.js";

const auditQuerySchema = z.object({
  action: z.string().trim().optional(),
  actorId: z.string().trim().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

function authOf(req: { auth?: AuthContext }): AuthContext {
  if (!req.auth) throw ApiError.internal("Route is missing requireAuth middleware");
  return req.auth;
}

export const auditController = {
  list: asyncHandler(async (req, res) => {
    const query = parseQuery(req, auditQuerySchema);
    const { entries, meta } = await auditService.list(authOf(req), query);
    return ok(res, entries, meta);
  }),
};

export { auditQuerySchema };
