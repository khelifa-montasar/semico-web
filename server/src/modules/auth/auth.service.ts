import { ERROR_CODES, type AuthResponse, type AuthUser, type RegisterInput, type LoginInput } from "@semico/shared";
import type { Request } from "express";
import { prisma } from "../../db/prisma.js";
import { ApiError } from "../../lib/ApiError.js";
import { writeAudit } from "../../lib/audit.js";
import { burnPasswordTime, hashPassword, verifyPassword } from "../../lib/password.js";
import {
  accessTokenTtlSeconds,
  generateRefreshToken,
  generateTokenFamilyId,
  hashRefreshToken,
  signAccessToken,
} from "../../lib/tokens.js";
import { authRepository } from "./auth.repository.js";
import { toAuthUser, userMappingSelect } from "./auth.mapper.js";

/**
 * Authentication business rules.
 *
 * No Express types leak in here beyond the optional `Request` used for audit provenance, and no
 * HTTP concerns: the service returns domain values and throws `ApiError`, leaving status codes
 * and cookies to the controller.
 */

export interface IssuedSession {
  response: AuthResponse;
  /** Raw refresh token — the controller puts this in an httpOnly cookie and nothing else does. */
  refreshToken: string;
}

async function issueSession(
  user: AuthUser,
  options: { familyId?: string; req?: Request } = {},
): Promise<IssuedSession> {
  const accessToken = await signAccessToken({ sub: user.id, role: user.role });
  const refreshToken = generateRefreshToken();
  const familyId = options.familyId ?? generateTokenFamilyId();

  await authRepository.createRefreshToken({
    userId: user.id,
    tokenHash: hashRefreshToken(refreshToken),
    familyId,
  });

  return {
    response: { user, accessToken, expiresIn: accessTokenTtlSeconds },
    refreshToken,
  };
}

export const authService = {
  /**
   * Self-service signup.
   *
   * An owner gets a fresh farm and an owner code to share. A worker must present a valid code —
   * which is the only thing tying them to a farm — and lands with `valveControl` false until the
   * owner grants it.
   */
  async register(input: RegisterInput, req?: Request): Promise<IssuedSession> {
    const existing = await authRepository.findByEmail(input.email);
    if (existing) {
      throw ApiError.conflict("That email address is already registered", ERROR_CODES.EMAIL_IN_USE);
    }

    const passwordHash = await hashPassword(input.password);

    if (input.role === "OWNER") {
      const farmName = input.farmName?.trim() || `${input.fullName.split(" ")[0]}'s Farm`;

      const created = await authRepository.createOwnerWithFarm({
        email: input.email,
        passwordHash,
        fullName: input.fullName,
        farmName,
        wilayaId: undefined,
        commune: undefined,
      });

      await prisma.$transaction(async (tx) => {
        await writeAudit(
          tx,
          {
            actorId: created.userId,
            farmId: created.farmId,
            action: "REGISTER",
            entityType: "USER",
            entityId: created.userId,
            metadata: { role: "OWNER" },
          },
          req,
        );
        await tx.activityLog.create({
          data: {
            farmId: created.farmId,
            occurredAt: new Date(),
            kind: "SYSTEM_CHECK",
            type: "AUTO",
            actorId: created.userId,
            messageEn: "Farm created and monitoring enabled.",
            messageAr: "تم إنشاء المزرعة وتفعيل المراقبة.",
          },
        });
      });

      const user = await authRepository.findById(created.userId);
      if (!user) throw ApiError.internal("Account was created but could not be read back");

      return issueSession(toAuthUser(user), { req });
    }

    // ── worker ────────────────────────────────────────────────────────────────
    const ownerCode = input.ownerCode;
    if (!ownerCode) {
      // Guarded by the shared schema, but a service must not rely on its caller for correctness.
      throw ApiError.badRequest("A farm owner code is required to join as a worker", {
        ownerCode: ["A farm owner code is required to join as a worker"],
      });
    }

    const farm = await authRepository.findFarmByOwnerCode(ownerCode);
    if (!farm) {
      // Deliberately explicit: users mistype this code constantly, and a generic 400 would leave
      // them guessing which field was wrong.
      throw new ApiError(400, ERROR_CODES.INVALID_OWNER_CODE, "That farm owner code was not recognised", {
        details: { ownerCode: ["That farm owner code was not recognised"] },
      });
    }

    if (farm.status !== "ACTIVE") throw ApiError.forbidden("This farm has been suspended");

    const worker = await authRepository.createWorker({
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      farmId: farm.id,
      workerType: input.workerType ?? "ENGINEER",
    });

    await prisma.$transaction(async (tx) => {
      await writeAudit(
        tx,
        {
          actorId: worker.id,
          farmId: farm.id,
          action: "REGISTER",
          entityType: "USER",
          entityId: worker.id,
          metadata: { role: "WORKER", workerType: input.workerType ?? "ENGINEER" },
        },
        req,
      );
      await tx.activityLog.create({
        data: {
          farmId: farm.id,
          occurredAt: new Date(),
          kind: "SYSTEM_CHECK",
          type: "AUTO",
          actorId: worker.id,
          messageEn: `${worker.fullName} joined the farm.`,
          messageAr: `انضم ${worker.fullName} إلى المزرعة.`,
        },
      });
    });

    return issueSession(toAuthUser(worker), { req });
  },

  async login(input: LoginInput, req?: Request): Promise<IssuedSession> {
    const account = await authRepository.findByEmailWithSecret(input.email);

    if (!account) {
      // Spend the same time as a real verify so response latency does not reveal which emails
      // are registered.
      await burnPasswordTime(input.password);
      throw ApiError.unauthorized("Incorrect email or password", ERROR_CODES.INVALID_CREDENTIALS);
    }

    const passwordMatches = await verifyPassword(account.passwordHash, input.password);
    if (!passwordMatches) {
      throw ApiError.unauthorized("Incorrect email or password", ERROR_CODES.INVALID_CREDENTIALS);
    }

    if (account.status === "DISABLED" || account.platformDisabled) {
      throw ApiError.forbidden("This account has been disabled");
    }

    // Signing in with the temporary password is how an invited worker accepts the invitation, so
    // the invite resolves here. Without this they could authenticate successfully and then be
    // refused by every route, because the guards require an ACTIVE account — a worker who can log
    // in but can see nothing.
    if (account.status === "INVITED") {
      await prisma.user.update({ where: { id: account.id }, data: { status: "ACTIVE" } });
    }

    const user = await authRepository.findById(account.id);
    if (!user) throw ApiError.unauthorized("Account not found", ERROR_CODES.INVALID_CREDENTIALS);

    await prisma.$transaction(async (tx) => {
      await writeAudit(
        tx,
        {
          actorId: user.id,
          farmId: user.farm?.id ?? null,
          action: "LOGIN",
          entityType: "SESSION",
          entityId: user.id,
        },
        req,
      );
    });

    return issueSession(toAuthUser(user), { req });
  },

  /**
   * Exchanges a refresh token for a new access token, rotating the refresh token each time.
   *
   * Presenting an already-revoked token means someone replayed a stolen one, so the entire token
   * family is revoked and the user is forced to sign in again.
   */
  async refresh(rawToken: string, req?: Request): Promise<IssuedSession> {
    const tokenHash = hashRefreshToken(rawToken);
    const stored = await authRepository.findRefreshTokenByHash(tokenHash);

    if (!stored) {
      throw ApiError.unauthorized("Your session is no longer valid", ERROR_CODES.TOKEN_INVALID);
    }

    if (stored.revokedAt) {
      await authRepository.revokeFamily(stored.familyId);
      await prisma.$transaction(async (tx) => {
        await writeAudit(
          tx,
          {
            actorId: stored.userId,
            action: "REFRESH_REUSE_DETECTED",
            entityType: "SESSION",
            entityId: stored.familyId,
            metadata: { reason: "revoked refresh token presented" },
          },
          req,
        );
      });
      throw ApiError.unauthorized(
        "Your session has been ended for security reasons. Please sign in again.",
        ERROR_CODES.REFRESH_REUSE_DETECTED,
      );
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw ApiError.unauthorized("Your session has expired", ERROR_CODES.TOKEN_EXPIRED);
    }

    if (stored.user.status === "DISABLED" || stored.user.platformDisabled) {
      await authRepository.revokeFamily(stored.familyId);
      throw ApiError.forbidden("This account has been disabled");
    }

    // Rotation: the presented token dies with this request.
    await authRepository.revokeRefreshToken(stored.id);

    const user = await authRepository.findById(stored.userId);
    if (!user) throw ApiError.unauthorized("Account not found", ERROR_CODES.TOKEN_INVALID);

    // Same family, so a later reuse of any earlier token is still detected.
    return issueSession(toAuthUser(user), { familyId: stored.familyId, req });
  },

  async logout(rawToken: string | undefined, userId: string, req?: Request): Promise<void> {
    if (rawToken) {
      const stored = await authRepository.findRefreshTokenByHash(hashRefreshToken(rawToken));
      // Only revoke a token that belongs to the caller.
      if (stored && stored.userId === userId && !stored.revokedAt) {
        await authRepository.revokeRefreshToken(stored.id);
      }
    }

    await prisma.$transaction(async (tx) => {
      await writeAudit(
        tx,
        { actorId: userId, action: "LOGOUT", entityType: "SESSION", entityId: userId },
        req,
      );
    });
  },

  async me(userId: string): Promise<AuthUser> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: userMappingSelect });
    if (!user) throw ApiError.notFound("Account not found");
    return toAuthUser(user);
  },
};

export { userMappingSelect };
