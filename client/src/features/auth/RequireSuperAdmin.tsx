import { Navigate, Outlet } from "react-router";
import { SemicoLogo } from "@/app/components/SemicoLogo";
import { RouteFallback } from "@/app/components/RouteFallback";
import { useAuth } from "./AuthContext";
import { canAccessAdmin } from "./permissions";

export function RequireSuperAdmin() {
  const { status, user } = useAuth();
  if (status === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <SemicoLogo height={32} />
        <RouteFallback />
      </div>
    );
  }
  if (status !== "authenticated" || !canAccessAdmin(user)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}
