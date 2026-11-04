import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ERROR_CODES, ROLES, type FarmStatus, type Role, type UserStatus, type WorkerType } from "@semico/shared";
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
        platformDisabled: true,
        farmId: true,
        // Both directions of the farm link are needed. `farm` is the worker side of the join;
        // `ownedFarms` is how an OWNER is attached. Selecting only `farm` leaves every owner with a
        // null farmId and 403s them on every /farms/me/* route.
        farm: { select: { id: true, name: true, status: true } },
        // Ordered so "the owner's active farm" is deterministic rather than whichever row the
        // database happened to return first.
        ownedFarms: { select: { id: true, name: true, status: true }, orderBy: { createdAt: "asc" } },
      },
    });

    if (!user) {
      // The account was deleted while its token was still valid.
      throw ApiError.unauthorized("Your account is no longer available", ERROR_CODES.TOKEN_INVALID);
    }

    if (user.status === "DISABLED" || user.platformDisabled) {
      throw ApiError.forbidden("This account has been disabled");
    }

    if (!(ROLES as readonly string[]).includes(user.role)) {
      throw ApiError.forbidden("This account has an unrecognized role");
    }

    // Resolve the ACTIVE farm for this request.
    //
    // An owner may hold up to three farms, so `/farms/me/*` needs to know which one it is acting on.
    // `X-Farm-Id` selects it; without the header the owner's oldest farm is used, which keeps every
    // existing single-farm client working unchanged. A worker has exactly one farm and cannot
    // select another — naming a farm they are not attached to is refused rather than ignored, so a
    // stale client cannot silently write to the wrong farm.
    const requestedFarmId = req.header("x-farm-id")?.trim() || null;

    let farm = user.farm ?? null;

    if (user.role === "SUPER_ADMIN") {
      // Platform requests are independent of the client's selected farm header.
      farm = null;
    } else if (user.role === "OWNER") {
      const owned = user.ownedFarms ?? [];

      if (requestedFarmId) {
        const selected = owned.find((candidate) => candidate.id === requestedFarmId);
        if (!selected) {
          throw ApiError.forbidden("You do not own that farm");
        }
        farm = selected;
      } else {
        farm = owned[0] ?? null;
      }
    } else if (requestedFarmId && requestedFarmId !== user.farm?.id) {
      throw ApiError.forbidden("You are not attached to that farm");
    }

    req.auth = {
      userId: user.id,
      role: user.role as Role,
      workerType: user.role === "SUPER_ADMIN" ? null : (user.workerType as WorkerType | null) ?? null,
      valveControl: user.role === "SUPER_ADMIN" ? false : user.valveControl,
      status: user.status as UserStatus,
      farmId: user.role === "SUPER_ADMIN" ? null : farm?.id ?? user.farmId ?? null,
      farmName: farm?.name ?? null,
      farmStatus: (farm?.status as FarmStatus | undefined) ?? null,
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
