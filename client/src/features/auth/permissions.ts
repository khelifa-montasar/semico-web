import type { AuthUser } from "@semico/shared";

export function canAccessAdmin(user: AuthUser | null): boolean {
  return user?.role === "SUPER_ADMIN" && user.status === "ACTIVE";
}

/**
 * Client-side mirrors of the server's capability rules.
 *
 * These decide what the UI OFFERS; the server decides what it ALLOWS. They are kept here, in one
 * file, so the two cannot drift far apart — but they are not a security boundary, and every route
 * they hide is enforced again on the server. `server/src/types/auth.ts` holds the authoritative
 * versions; when one changes, change both.
 */

/** Owner, or an operator who currently holds the grant. */
export function canControlValves(user: AuthUser | null): boolean {
  if (!user || user.status !== "ACTIVE") return false;
  if (user.role === "OWNER") return true;
  return user.role === "WORKER" && user.workerType === "OPERATOR" && user.valveControl;
}

/**
 * Owner or ENGINEER. Never an operator: exporting the dataset is a different permission from
 * reading a chart on screen.
 */
export function canExportData(user: AuthUser | null): boolean {
  if (!user || user.status !== "ACTIVE") return false;
  return user.role === "OWNER" || (user.role === "WORKER" && user.workerType === "ENGINEER");
}

/** Technical diagnostics — the same population as export, kept as its own rule for clarity. */
export function canAccessDiagnostics(user: AuthUser | null): boolean {
  if (!user || user.status !== "ACTIVE") return false;
  return user.role === "OWNER" || (user.role === "WORKER" && user.workerType === "ENGINEER");
}
