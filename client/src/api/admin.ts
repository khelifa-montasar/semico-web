import type {
  AdminFarm,
  AdminUser,
  AdminBlogPost,
  CreateBlogPostInput,
  CreatePricingPlanInput,
  PlatformStats,
  PricingPlan,
  SetFarmStatusInput,
  SetUserStatusInput,
  UpdateBlogPostInput,
  UpdatePricingPlanInput,
} from "@semico/shared";
import { api, qs } from "../lib/api/http";

export const adminApi = {
  stats: () => api.get<PlatformStats>("/admin/stats"),
  pricing: (page = 1) =>
    api.getPage<PricingPlan[]>(`/admin/pricing${qs({ page })}`),
  createPricing: (input: CreatePricingPlanInput) =>
    api.post<PricingPlan>("/admin/pricing", input),
  updatePricing: (id: string, input: UpdatePricingPlanInput) =>
    api.patch<PricingPlan>(`/admin/pricing/${encodeURIComponent(id)}`, input),
  deletePricing: (id: string) =>
    api.delete<void>(`/admin/pricing/${encodeURIComponent(id)}`),
  blog: (page = 1) =>
    api.getPage<AdminBlogPost[]>(`/admin/blog${qs({ page })}`),
  createBlog: (input: CreateBlogPostInput) =>
    api.post<AdminBlogPost>("/admin/blog", input),
  updateBlog: (id: string, input: UpdateBlogPostInput) =>
    api.patch<AdminBlogPost>(`/admin/blog/${encodeURIComponent(id)}`, input),
  deleteBlog: (id: string) =>
    api.delete<void>(`/admin/blog/${encodeURIComponent(id)}`),
  farms: (page = 1) => api.getPage<AdminFarm[]>(`/admin/farms${qs({ page })}`),
  setFarmStatus: (id: string, input: SetFarmStatusInput) =>
    api.patch<AdminFarm>(
      `/admin/farms/${encodeURIComponent(id)}/status`,
      input,
    ),
  users: (page = 1) => api.getPage<AdminUser[]>(`/admin/users${qs({ page })}`),
  setUserStatus: (id: string, input: SetUserStatusInput) =>
    api.patch<AdminUser>(
      `/admin/users/${encodeURIComponent(id)}/status`,
      input,
    ),
};
