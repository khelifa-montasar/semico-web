import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SetFarmStatusInput, SetUserStatusInput } from "@semico/shared";
import { adminApi, queryKeys } from "@/api";
import { useAuth } from "@/features/auth/AuthContext";
import { canAccessAdmin } from "@/features/auth/permissions";

export function useAdminFarms(page: number) {
  const { user, status } = useAuth();
  return useQuery({
    queryKey: queryKeys.admin.farms(user?.id ?? null, page),
    queryFn: () => adminApi.farms(page),
    enabled: status === "authenticated" && canAccessAdmin(user),
    gcTime: 0,
  });
}

export function useAdminUsers(page: number) {
  const { user, status } = useAuth();
  return useQuery({
    queryKey: queryKeys.admin.users(user?.id ?? null, page),
    queryFn: () => adminApi.users(page),
    enabled: status === "authenticated" && canAccessAdmin(user),
    gcTime: 0,
  });
}

export function useSetFarmStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SetFarmStatusInput }) =>
      adminApi.setFarmStatus(id, input),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.farm.all }),
      ]),
  });
}

export function useSetUserStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SetUserStatusInput }) =>
      adminApi.setUserStatus(id, input),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.me }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workers.all }),
      ]),
  });
}
