import type {
  BlogPost as BlogRow,
  PricingPlan as PricingPlanRow,
} from "@prisma/client";
import {
  BLOG_CATEGORIES,
  pricingFeaturesSchema,
  type BlogCategory,
  type BlogPost,
  type BlogPostSummary,
  type PricingPlan,
} from "@semico/shared";
import { loc, locOrNull } from "../../lib/localized.js";

const CATEGORY_LABELS: Record<BlogCategory, { en: string; ar: string }> = {
  TECHNOLOGY: { en: "Technology", ar: "التكنولوجيا" },
  GUIDES: { en: "Guides", ar: "الأدلة" },
};

export function toBlogSummary(row: BlogRow): BlogPostSummary {
  const category = (BLOG_CATEGORIES as readonly string[]).includes(row.category)
    ? (row.category as BlogCategory)
    : "TECHNOLOGY";
  return {
    id: row.id,
    slug: row.slug,
    publishedAt: row.publishedAt.toISOString(),
    category,
    categoryLabel: CATEGORY_LABELS[category],
    title: loc(row.titleEn, row.titleAr),
    excerpt: loc(row.excerptEn, row.excerptAr),
    coverImageUrl: row.coverImageUrl,
  };
}

export function toBlogPost(row: BlogRow): BlogPost {
  return { ...toBlogSummary(row), body: locOrNull(row.bodyEn, row.bodyAr) };
}

export function toPricingPlan(row: PricingPlanRow): PricingPlan {
  return {
    id: row.id,
    name: loc(row.nameEn, row.nameAr),
    price: row.price,
    currency: row.currency,
    features: pricingFeaturesSchema.parse(JSON.parse(row.featuresJson)),
    isActive: row.isActive,
  };
}
