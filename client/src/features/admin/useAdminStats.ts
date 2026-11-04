import { useQuery } from "@tanstack/react-query";
import { adminApi, queryKeys } from "@/api";
import { useAuth } from "@/features/auth/AuthContext";
import { canAccessAdmin } from "@/features/auth/permissions";

export function useAdminStats() {
  const { user, status } = useAuth();
  return useQuery({
    queryKey: queryKeys.admin.stats(user?.id ?? null),
    queryFn: () => adminApi.stats(),
    enabled: status === "authenticated" && canAccessAdmin(user),
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    // Platform data should not remain cached after the portal is closed.
    gcTime: 0,
  });
}
