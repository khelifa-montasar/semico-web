import { prisma } from "../../src/db/prisma.js";
import { registerOwner, registerWorker, type RegisteredUser } from "./api.js";

/**
 * A full cast of accounts for one farm, plus a second isolated farm.
 *
 * Role and capability are separate axes in this system, and the RBAC matrix has to cover every
 * combination — an owner, an operator WITH valve control, an operator WITHOUT it, an engineer, an
 * invited account, and a disabled one. Building them in one place keeps the matrix readable and
 * means a change to how a role is created does not have to be repeated across suites.
 */

export interface Cast {
  farmId: string;
  ownerCode: string;
  owner: RegisteredUser;
  /** OPERATOR with `valveControl` granted — the only worker who may touch a valve. */
  operatorValve: RegisteredUser;
  /** OPERATOR without the grant. */
  operatorPlain: RegisteredUser;
  engineer: RegisteredUser;
  /** Status INVITED, but holding a token issued before the status changed. */
  invited: RegisteredUser;
  /** Status DISABLED, likewise holding a previously issued token. */
  disabled: RegisteredUser;
}

/** Grants valve control directly, so the cast does not depend on the workers endpoints. */
async function grantValve(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { valveControl: true } });
}

async function setStatus(userId: string, status: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { status } });
}

export async function buildCast(farmName = "Cast Farm"): Promise<Cast> {
  const owner = await registerOwner(farmName);

  const operatorValve = await registerWorker(owner.ownerCode, "OPERATOR");
  const operatorPlain = await registerWorker(owner.ownerCode, "OPERATOR");
  const engineer = await registerWorker(owner.ownerCode, "ENGINEER");
  const invited = await registerWorker(owner.ownerCode, "ENGINEER");
  const disabled = await registerWorker(owner.ownerCode, "OPERATOR");

  await grantValve(operatorValve.userId);
  await setStatus(invited.userId, "INVITED");
  await setStatus(disabled.userId, "DISABLED");

  return {
    farmId: owner.farmId,
    ownerCode: owner.ownerCode,
    owner,
    operatorValve,
    operatorPlain,
    engineer,
    invited,
    disabled,
  };
}

/** Every named member of a cast, with the role/capability it represents. */
export function castMembers(cast: Cast): Array<{ name: string; user: RegisteredUser }> {
  return [
    { name: "owner", user: cast.owner },
    { name: "operator+valve", user: cast.operatorValve },
    { name: "operator", user: cast.operatorPlain },
    { name: "engineer", user: cast.engineer },
    { name: "invited", user: cast.invited },
    { name: "disabled", user: cast.disabled },
  ];
}

/** Decodes a JWT payload without verifying it — enough to inspect what the token carries. */
export function claimsOf(token: string): Record<string, unknown> {
  const payload = token.split(".")[1] ?? "";
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
}
