import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "./AuthContext";
import { SemicoLogo } from "@/app/components/SemicoLogo";
import { canAccessAdmin } from "./permissions";

/**
 * Route guard for the dashboard.
 *
 * Three states, and the loading one matters: rendering the dashboard while the boot-time refresh is
 * still in flight would bounce an already signed-in user to /login for a frame.
 */

function SessionLoading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <SemicoLogo height={32} />
      <p className="text-[13px] text-[#9CA3AF]">Loading…</p>
    </div>
  );
}

export function RequireAuth() {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === "loading") return <SessionLoading />;

  if (status === "anonymous") {
    // Remember where they were headed so login can send them back there.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (canAccessAdmin(user)) return <Navigate to="/admin/dashboard" replace />;
  return <Outlet />;
}

/**
 * Restricts a subtree to farm owners.
 *
 * Used for the worker-management section of Settings. Note this is convenience, not security — the
 * server enforces ownership on every owner-only endpoint regardless of what the client renders.
 */
export function RequireOwner({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== "OWNER") return null;
  return <>{children}</>;
}
