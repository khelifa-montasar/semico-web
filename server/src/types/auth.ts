import type { FarmStatus, Role, UserStatus, WorkerType } from "@semico/shared";

/**
 * What `requireAuth` attaches to the request after verifying the token.
 *
 * Every field is resolved from the DATABASE on each request, not from
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
  /** null for super admins, owners without a farm, and workers not yet attached to a farm. */
  farmId: string | null;
  farmName: string | null;
  farmStatus: FarmStatus | null;
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
  if (auth.status !== "ACTIVE" || auth.farmStatus !== "ACTIVE") return false;
  if (auth.role === "OWNER") return true;
  return auth.role === "WORKER" && auth.workerType === "OPERATOR" && auth.valveControl;
}

/** Active farm members may read farm data. Platform administrators have no farm membership. */
export function canReadFarm(auth: AuthContext): boolean {
  return (auth.role === "OWNER" || auth.role === "WORKER") && auth.status === "ACTIVE" && auth.farmStatus === "ACTIVE" && auth.farmId !== null;
}

/**
 * Data export — the owner, and workers of type ENGINEER. Never an operator.
 *
 * Export is the capability that separates the two worker types in V2: an engineer analyses a farm,
 * an operator runs it. Keeping them apart means operating a valve does not also hand someone the
 * farm's entire history as a file.
 */
export function canExportData(auth: AuthContext): boolean {
  if (auth.status !== "ACTIVE" || auth.farmStatus !== "ACTIVE") return false;
  return auth.role === "OWNER" || (auth.role === "WORKER" && auth.workerType === "ENGINEER");
}

/**
 * Technical diagnostics — sensor precision, the savings model, the simulation.
 *
 * Currently the same population as export, but kept as its own predicate: they are different
 * permissions that happen to coincide, and a future role may hold one without the other.
 */
export function canAccessDiagnostics(auth: AuthContext): boolean {
  if (auth.status !== "ACTIVE" || auth.farmStatus !== "ACTIVE") return false;
  return auth.role === "OWNER" || (auth.role === "WORKER" && auth.workerType === "ENGINEER");
}
