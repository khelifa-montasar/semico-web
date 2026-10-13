import {
  educationInputSchema,
  experienceInputSchema,
  updateProfileSchema,
} from "@semico/shared";
import { ApiError } from "../../lib/ApiError.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { created, noContent, ok } from "../../lib/response.js";
import { idParamSchema, parseBody, parseParams } from "../../lib/validate.js";
import { usersService } from "./users.service.js";
import type { AuthContext } from "../../types/auth.js";

function authOf(req: { auth?: AuthContext }): AuthContext {
  if (!req.auth) throw ApiError.internal("Route is missing requireAuth middleware");
  return req.auth;
}

/** Every mutation returns the whole profile, so the form re-renders from one source of truth. */
export const usersController = {
  me: asyncHandler(async (req, res) => ok(res, await usersService.me(authOf(req)))),

  updateProfile: asyncHandler(async (req, res) => {
    const input = parseBody(req, updateProfileSchema);
    return ok(res, await usersService.updateProfile(authOf(req), input, req));
  }),

  addExperience: asyncHandler(async (req, res) => {
    const input = parseBody(req, experienceInputSchema);
    return created(res, await usersService.addExperience(authOf(req), input));
  }),

  updateExperience: asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParamSchema);
    const input = parseBody(req, experienceInputSchema.partial());
    return ok(res, await usersService.updateExperience(authOf(req), id, input));
  }),

  deleteExperience: asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParamSchema);
    await usersService.deleteExperience(authOf(req), id);
    return noContent(res);
  }),

  addEducation: asyncHandler(async (req, res) => {
    const input = parseBody(req, educationInputSchema);
    return created(res, await usersService.addEducation(authOf(req), input));
  }),

  updateEducation: asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParamSchema);
    const input = parseBody(req, educationInputSchema.partial());
    return ok(res, await usersService.updateEducation(authOf(req), id, input));
  }),

  deleteEducation: asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParamSchema);
    await usersService.deleteEducation(authOf(req), id);
    return noContent(res);
  }),
};
