import { Navigate, Outlet } from "react-router";
import { useAuth } from "./AuthContext";
import { canAccessDiagnostics } from "./permissions";

/**
 * Route guard for Technical Diagnostics (the module formerly labelled "Demo Plot").
 *
 * Allowed: the owner, and workers of type ENGINEER. An OPERATOR is redirected — running the valves
 * and analysing sensor precision are different jobs, and V2 separates them.
 *
 * REDIRECTS rather than rendering nothing. `RequireOwner` in `RequireAuth.tsx` does the opposite —
 * it returns `null` for a non-owner — which is fine for hiding a section inside a page but wrong for
 * a route: someone who follows a stale link would get a blank page instead of being sent somewhere
 * useful.
 *
 * This is convenience, not security: the diagnostics module holds no server data, so there is
 * nothing to protect beyond the presentation. The capability that DOES guard data — export — is
 * enforced on the server at `/farms/me/analytics/export`.
 */
export function RequireDiagnosticsRoute() {
  const { status, user } = useAuth();

  // The parent route is already wrapped in `RequireAuth`, so `loading` is a brief edge case rather
  // than the normal path — rendering nothing for one frame beats flashing a redirect.
  if (status === "loading") return null;

  if (!canAccessDiagnostics(user)) return <Navigate to="/dashboard" replace />;

  return <Outlet />;
}
