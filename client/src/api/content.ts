import type {
  BlogPost,
  BlogPostSummary,
  ContentBundle,
  Product,
  PricingPlan,
  ServicePlan,
  Stat,
  TeamMember,
  Testimonial,
  Wilaya,
} from "@semico/shared";
import { api, qs } from "../lib/api/http";

/**
 * Public marketing content.
 *
 * Every translatable field arrives as a `{ en, ar }` pair, so the language toggle repaints without
 * refetching. No auth required for any of these.
 */
export const contentApi = {
  /** Everything Home, About and Services need, in one round trip. */
  bundle: () => api.get<ContentBundle>("/content/bundle"),

  blog: (category?: string) =>
    api.get<BlogPostSummary[]>(`/content/blog${qs({ category })}`),

  post: (slug: string) => api.get<BlogPost>(`/content/blog/${slug}`),

  products: () => api.get<Product[]>("/content/products"),
  servicePlans: () => api.get<ServicePlan[]>("/content/service-plans"),
  pricingPlans: () => api.get<PricingPlan[]>("/content/pricing-plans"),
  team: () => api.get<TeamMember[]>("/content/team"),
  stats: () => api.get<Stat[]>("/content/stats"),
  testimonials: () => api.get<Testimonial[]>("/content/testimonials"),
};

/** Reference data. The 58 Algerian wilayas, used by the address dropdown. */
export const referenceApi = {
  wilayas: () => api.get<Wilaya[]>("/reference/wilayas"),
};
