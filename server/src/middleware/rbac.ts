import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ERROR_CODES, type Role } from "@semico/shared";
import { ApiError } from "../lib/ApiError.js";
import { canControlValves, canReadFarm, isOwner, type AuthContext } from "../types/auth.js";

/**
 * Authorization.
 *
 * Two distinct concepts, deliberately kept apart:
 *   • ROLE (`OWNER` | `WORKER`) gates administration — workers, farm settings, the audit trail.
 *   • CAPABILITY (valve control) gates the actuators. It is not a role: an OPERATOR holds it only
 *     while the owner has granted it, and OBSERVERs never do.
 *
 * Every guard here reads from `req.auth`, which `requireAuth` rebuilt from the database on this
 * request — so a permission revoked a second ago is already in force.
 */

function contextOrThrow(req: Request): AuthContext {
  if (!req.auth) {
    // A route guard was mounted without requireAuth first — a wiring bug, not a client error.
    throw ApiError.internal("Route is missing requireAuth middleware");
  }
  return req.auth;
}

/** Gate administration on ownership. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const auth = contextOrThrow(req);
      if (!roles.includes(auth.role)) {
        throw ApiError.forbidden("This action is limited to the farm owner");
      }
      if (auth.status !== "ACTIVE") {
        throw ApiError.forbidden("This account is not active");
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export const requireOwner: RequestHandler = requireRole("OWNER");

/**
 * Gate the valve endpoints.
 *
 * Owner always passes; a worker passes only as an active OPERATOR whose `valveControl` is
 * currently true. OBSERVERs and revoked operators get a 403 here even though the client hides
 * the control — the server is the enforcement point, not the UI.
 */
export const requireValveControl: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const auth = contextOrThrow(req);
    if (!canControlValves(auth)) {
      throw new ApiError(
        403,
        ERROR_CODES.VALVE_CONTROL_REQUIRED,
        "You do not have permission to operate valves on this farm",
      );
    }
    next();
  } catch (error) {
    next(error);
  }
};

/** Any active member of a farm may read its data — observers included, they are read-only. */
export const requireFarmAccess: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const auth = contextOrThrow(req);
    if (!canReadFarm(auth)) {
      throw ApiError.forbidden("You are not attached to a farm yet");
    }
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Confirms a resource belongs to the caller's farm.
 *
 * Returns 404 rather than 403 on a mismatch: a 403 would confirm that a record with that id
 * exists, which is enough to enumerate other farms' data by id.
 */
export function assertSameFarm(auth: AuthContext, resourceFarmId: string | null): void {
  if (!auth.farmId || !resourceFarmId || auth.farmId !== resourceFarmId) {
    throw ApiError.notFound();
  }
}

export { isOwner, canControlValves };
