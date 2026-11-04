import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateBlogPostInput,
  CreatePricingPlanInput,
} from "@semico/shared";
import { adminApi, queryKeys } from "@/api";
import { useAuth } from "@/features/auth/AuthContext";
import { canAccessAdmin } from "@/features/auth/permissions";

export function useAdminPricing(page: number) {
  const { user, status } = useAuth();
  return useQuery({
    queryKey: queryKeys.admin.pricing(user?.id ?? null, page),
    queryFn: () => adminApi.pricing(page),
    enabled: status === "authenticated" && canAccessAdmin(user),
    gcTime: 0,
  });
}

export function useAdminBlog(page: number) {
  const { user, status } = useAuth();
  return useQuery({
    queryKey: queryKeys.admin.blog(user?.id ?? null, page),
    queryFn: () => adminApi.blog(page),
    enabled: status === "authenticated" && canAccessAdmin(user),
    gcTime: 0,
  });
}

export function usePricingMutations() {
  const queryClient = useQueryClient();
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.pricingAll }),
      queryClient.invalidateQueries({ queryKey: queryKeys.content.pricing() }),
    ]);
  const save = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id?: string;
      input: CreatePricingPlanInput;
    }) =>
      id ? adminApi.updatePricing(id, input) : adminApi.createPricing(input),
    onSuccess: invalidate,
  });
  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminApi.updatePricing(id, { isActive }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: adminApi.deletePricing,
    onSuccess: invalidate,
  });
  return { save, toggle, remove };
}

export function useBlogMutations() {
  const queryClient = useQueryClient();
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.blogAll }),
      queryClient.invalidateQueries({ queryKey: queryKeys.content.all }),
    ]);
  const save = useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CreateBlogPostInput }) =>
      id ? adminApi.updateBlog(id, input) : adminApi.createBlog(input),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: adminApi.deleteBlog,
    onSuccess: invalidate,
  });
  return { save, remove };
}
