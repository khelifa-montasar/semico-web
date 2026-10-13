import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ERROR_CODES, type Role, type UserStatus, type WorkerType } from "@semico/shared";
import { prisma } from "../db/prisma.js";
import { ApiError } from "../lib/ApiError.js";
import { verifyAccessToken } from "../lib/tokens.js";

/**
 * Authentication.
 *
 * The JWT is verified for identity, then the user is read FRESH FROM THE DATABASE to build the
 * request's authorization context. That second step is the important one: it means revoking a
 * worker's valve permission, changing their type, or disabling their account takes effect on
 * their very next request. The token carries only `sub` and `role` and is never trusted for
 * anything else — see lib/tokens.ts.
 */

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") return null;
  return token.trim() || null;
}

export const requireAuth: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const token = extractBearer(req.headers.authorization);
    if (!token) {
      throw ApiError.unauthorized("Authentication required");
    }

    const claims = await verifyAccessToken(token);
    if (!claims) {
      throw ApiError.unauthorized("Your session has expired", ERROR_CODES.TOKEN_INVALID);
    }

    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        workerType: true,
        valveControl: true,
        status: true,
        farmId: true,
        // Both directions of the farm link are needed. `farm` is the worker side of the join;
        // `ownedFarm` is how an OWNER is attached. Selecting only `farm` leaves every owner with a
        // null farmId and 403s them on every /farms/me/* route.
        farm: { select: { id: true, name: true } },
        ownedFarm: { select: { id: true, name: true } },
      },
    });

    if (!user) {
      // The account was deleted while its token was still valid.
      throw ApiError.unauthorized("Your account is no longer available", ERROR_CODES.TOKEN_INVALID);
    }

    if (user.status === "DISABLED") {
      throw ApiError.forbidden("This account has been disabled");
    }

    // An owner's farm comes from `ownedFarm`; a worker's from `farm`. Resolving both here is what
    // lets every downstream guard treat the two roles identically.
    const farm = user.farm ?? user.ownedFarm ?? null;

    req.auth = {
      userId: user.id,
      role: user.role as Role,
      workerType: (user.workerType as WorkerType | null) ?? null,
      valveControl: user.valveControl,
      status: user.status as UserStatus,
      farmId: farm?.id ?? user.farmId ?? null,
      farmName: farm?.name ?? null,
      email: user.email,
      fullName: user.fullName,
    };

    next();
  } catch (error) {
    next(error);
  }
};

/** Same as requireAuth, but tolerates anonymous callers (optional personalisation). */
export const optionalAuth: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!extractBearer(req.headers.authorization)) return next();
  return requireAuth(req, res, next);
};
