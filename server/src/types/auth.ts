import type { Role, UserStatus, WorkerType } from "@semico/shared";

/**
 * What `requireAuth` attaches to the request after verifying the token.
 *
 * Every field except `userId` and `role` is resolved from the DATABASE on each request, not from
 * the JWT. That is deliberate: it is what makes an owner revoking an operator's valve permission
 * — or disabling an account — take effect on that user's very next request, instead of whenever
 * their unexpired token happens to lapse.
 */
export interface AuthContext {
  userId: string;
  role: Role;
  workerType: WorkerType | null;
  valveControl: boolean;
  status: UserStatus;
  /** null for an owner whose farm record is missing, or a worker not yet attached to a farm. */
  farmId: string | null;
  farmName: string | null;
  email: string;
  fullName: string;
}

/** True when the caller may manage workers, farm settings and see the audit trail. */
export function isOwner(auth: AuthContext): boolean {
  return auth.role === "OWNER" && auth.status === "ACTIVE";
}

/**
 * The valve-control capability — the single rule for who may open or close a valve.
 *
 * This is a capability, not a role: an owner always may; a worker only if they are an active
 * OPERATOR who has been explicitly granted (and not since had revoked) valve control.
 */
export function canControlValves(auth: AuthContext): boolean {
  if (auth.status !== "ACTIVE") return false;
  if (auth.role === "OWNER") return true;
  return auth.workerType === "OPERATOR" && auth.valveControl;
}

/** Any signed-in, active user may read farm data. Observers included — they are read-only. */
export function canReadFarm(auth: AuthContext): boolean {
  return auth.status === "ACTIVE" && auth.farmId !== null;
}
