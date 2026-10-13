import { inviteWorkerSchema, setValveControlSchema, updateWorkerSchema } from "@semico/shared";
import { ApiError } from "../../lib/ApiError.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { created, noContent, ok } from "../../lib/response.js";
import { idParamSchema, parseBody, parseParams } from "../../lib/validate.js";
import { workersService } from "./workers.service.js";

function authOf(req: { auth?: import("../../types/auth.js").AuthContext }) {
  if (!req.auth) throw ApiError.internal("Route is missing requireAuth middleware");
  return req.auth;
}

export const workersController = {
  list: asyncHandler(async (req, res) => ok(res, await workersService.list(authOf(req)))),

  /**
   * Creates the worker's account and returns a one-time password.
   *
   * The password is in the response exactly once, because there is no email delivery in this
   * project — the owner passes it on themselves. It is never retrievable again.
   */
  invite: asyncHandler(async (req, res) => {
    const input = parseBody(req, inviteWorkerSchema);
    return created(res, await workersService.invite(authOf(req), input, req));
  }),

  update: asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParamSchema);
    const input = parseBody(req, updateWorkerSchema);
    return ok(res, await workersService.update(authOf(req), id, input, req));
  }),

  /** Grant or revoke valve control. Recorded in both the feed and the audit trail. */
  setValveControl: asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParamSchema);
    const { granted } = parseBody(req, setValveControlSchema);
    return ok(res, await workersService.setValveControl(authOf(req), id, granted, req));
  }),

  resetPassword: asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParamSchema);
    return ok(res, await workersService.resetPassword(authOf(req), id, req));
  }),

  remove: asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParamSchema);
    await workersService.remove(authOf(req), id, req);
    return noContent(res);
  }),
};
