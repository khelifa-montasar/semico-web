import type { AuthUser, Role, UserStatus, WorkerType } from "@semico/shared";
import { initialsFrom } from "../../lib/initials.js";

/**
 * Turns a database row into the shape the client consumes.
 *
 * Kept as an explicit mapping rather than returning Prisma rows directly, for three reasons: the
 * password hash must never be able to leak, `initials` is derived once on the server so the
 * header and the worker table agree, and `farmName` is flattened from the relation so the client
 * does not have to know the schema.
 */

export interface UserRowForMapping {
  id: string;
  email: string;
  fullName: string;
  role: string;
  workerType: string | null;
  valveControl: boolean;
  status: string;
  avatarUrl: string | null;
  phone: string | null;
  wilayaId: string | null;
  commune: string | null;
  bio: string | null;
  farmId: string | null;
  farm?: { id: string; name: string } | null;
  ownedFarm?: { id: string; name: string } | null;
}

export function toAuthUser(user: UserRowForMapping): AuthUser {
  const farm = user.farm ?? user.ownedFarm ?? null;

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role as Role,
    workerType: (user.workerType as WorkerType | null) ?? null,
    valveControl: user.valveControl,
    status: user.status as UserStatus,
    farmId: farm?.id ?? user.farmId ?? null,
    farmName: farm?.name ?? null,
    avatarUrl: user.avatarUrl,
    phone: user.phone,
    wilayaId: user.wilayaId,
    commune: user.commune,
    bio: user.bio,
    initials: initialsFrom(user.fullName, user.email),
  };
}

/** Prisma `select` used everywhere a user is mapped, so the hash can never be selected by mistake. */
export const userMappingSelect = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  workerType: true,
  valveControl: true,
  status: true,
  avatarUrl: true,
  phone: true,
  wilayaId: true,
  commune: true,
  bio: true,
  farmId: true,
  farm: { select: { id: true, name: true } },
  ownedFarm: { select: { id: true, name: true } },
} as const;
