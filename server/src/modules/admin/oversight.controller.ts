import {
  paginationQuerySchema,
  setFarmStatusSchema,
  setUserStatusSchema,
} from "@semico/shared";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { ApiError } from "../../lib/ApiError.js";
import { ok, paginated } from "../../lib/response.js";
import {
  idParamSchema,
  parseBody,
  parseParams,
  parseQuery,
} from "../../lib/validate.js";
import { oversightService } from "./oversight.service.js";

export const oversightController = {
  farms: asyncHandler(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const query = parseQuery(req, paginationQuerySchema);
    const { data, total } = await oversightService.farms(query);
    return paginated(res, data, { ...query, total });
  }),
  users: asyncHandler(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const query = parseQuery(req, paginationQuerySchema);
    const { data, total } = await oversightService.users(query);
    return paginated(res, data, { ...query, total });
  }),
  setFarmStatus: asyncHandler(async (req, res) => {
    if (!req.auth)
      throw ApiError.internal("Route is missing requireAuth middleware");
    return ok(
      res,
      await oversightService.setFarmStatus(
        req.auth.userId,
        parseParams(req, idParamSchema).id,
        parseBody(req, setFarmStatusSchema),
        req,
      ),
    );
  }),
  setUserStatus: asyncHandler(async (req, res) => {
    if (!req.auth)
      throw ApiError.internal("Route is missing requireAuth middleware");
    return ok(
      res,
      await oversightService.setUserStatus(
        req.auth.userId,
        parseParams(req, idParamSchema).id,
        parseBody(req, setUserStatusSchema),
        req,
      ),
    );
  }),
};
