import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ERROR_CODES, type Role } from "@semico/shared";
import { ApiError } from "../lib/ApiError.js";
import { canControlValves, canExportData, canReadFarm, isOwner, type AuthContext } from "../types/auth.js";

/**
 * Authorization.
 *
 * Two distinct concepts, deliberately kept apart:
 *   • ROLE (`OWNER` | `WORKER` | `SUPER_ADMIN`) separates farm and platform administration.
 *   • CAPABILITY (valve control) gates the actuators. It is not a role: an OPERATOR holds it only
 *     while the owner has granted it, and ENGINEERs never do.
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

/** Allow only the explicitly listed roles; SUPER_ADMIN does not inherit OWNER access. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const auth = contextOrThrow(req);
      if (!roles.includes(auth.role)) {
        throw ApiError.forbidden("Your role does not permit this action");
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
export const requireSuperAdmin: RequestHandler = requireRole("SUPER_ADMIN");

/**
 * Gate the valve endpoints.
 *
 * Owner always passes; a worker passes only as an active OPERATOR whose `valveControl` is
 * currently true. ENGINEERs and revoked operators get a 403 here even though the client hides
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

/** Any active member of a farm may read its data — engineers included, they are read-only. */
export const requireFarmAccess: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const auth = contextOrThrow(req);
    if (auth.farmStatus === "SUSPENDED") {
      throw ApiError.forbidden("This farm has been suspended");
    }
    if (!canReadFarm(auth)) {
      throw ApiError.forbidden("You are not attached to a farm yet");
    }
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Gate data export (CSV now, PDF later).
 *
 * The owner and ENGINEERs may export; an OPERATOR may not, even though they can read the same data
 * on screen. Reading a chart and taking the dataset away are different permissions, and this is the
 * server's enforcement point — the client also hides the button, but that is convenience, not
 * security.
 */
export const requireExportAccess: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const auth = contextOrThrow(req);
    if (!canExportData(auth)) {
      throw new ApiError(
        403,
        ERROR_CODES.EXPORT_NOT_PERMITTED,
        "Your role does not permit exporting farm data",
      );
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

export { isOwner, canControlValves, canExportData };
