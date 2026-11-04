import { z } from "zod";
import { BLOG_CATEGORIES } from "../enums.js";
import type { BlogPost } from "./content.js";

export const pricingFeaturesSchema = z
  .array(
    z
      .object({
        en: z.string().trim().min(1).max(240),
        ar: z.string().trim().min(1).max(240),
      })
      .strict(),
  )
  .max(50);

export const createPricingPlanSchema = z
  .object({
    nameEn: z.string().trim().min(1).max(200),
    nameAr: z.string().trim().min(1).max(200),
    price: z.number().finite().nonnegative(),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/)
      .default("DZD"),
    features: pricingFeaturesSchema.default([]),
    isActive: z.boolean().default(true),
  })
  .strict();

export const updatePricingPlanSchema = createPricingPlanSchema
  .partial()
  .refine(
    (input) => Object.keys(input).length > 0,
    "At least one field is required",
  );

export const createBlogPostSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(1)
      .max(160)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    titleEn: z.string().trim().min(1).max(200),
    titleAr: z.string().trim().min(1).max(200),
    excerptEn: z.string().trim().max(600).default(""),
    excerptAr: z.string().trim().max(600).default(""),
    bodyEn: z.string().trim().min(1).max(50_000),
    bodyAr: z.string().trim().min(1).max(50_000),
    category: z.enum(BLOG_CATEGORIES).default("TECHNOLOGY"),
    publishedAt: z
      .string()
      .datetime({ offset: true })
      .default(() => new Date().toISOString()),
    published: z.boolean().default(false),
    coverImageUrl: z
      .string()
      .trim()
      .max(2000)
      .url()
      .refine(
        (value) => /^https?:\/\//i.test(value),
        "Use an HTTP or HTTPS image URL",
      )
      .nullable()
      .default(null),
    sortOrder: z.number().int().min(0).max(1_000_000).default(0),
  })
  .strict();

export const updateBlogPostSchema = createBlogPostSchema
  .partial()
  .refine(
    (input) => Object.keys(input).length > 0,
    "At least one field is required",
  );

export type CreatePricingPlanInput = z.infer<typeof createPricingPlanSchema>;
export type UpdatePricingPlanInput = z.infer<typeof updatePricingPlanSchema>;
export type CreateBlogPostInput = z.infer<typeof createBlogPostSchema>;
export type UpdateBlogPostInput = z.infer<typeof updateBlogPostSchema>;

export interface AdminBlogPost extends BlogPost {
  published: boolean;
  sortOrder: number;
}
