import { asyncHandler } from "../../lib/asyncHandler.js";
import { ok } from "../../lib/response.js";
import { adminService } from "./admin.service.js";

export const adminController = {
  stats: asyncHandler(async (_req, res) => {
    res.set("Cache-Control", "private, no-store");
    return ok(res, await adminService.stats());
  }),
};
