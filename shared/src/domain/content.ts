import type { BlogCategory, Localized } from "../enums.js";

/**
 * Public marketing content.
 *
 * This is all currently living inside `translations.ts` as `en`/`ar` array pairs — blog posts,
 * the product catalogue, service plans, team, stats and testimonials. Moving it here is what
 * lets an editor change a price or publish a post without a client rebuild.
 *
 * Every translatable field is returned in both languages so the client can switch locale without
 * a refetch.
 */

export interface BlogPost {
  id: string;
  slug: string;
  publishedAt: string;
  category: BlogCategory;
  categoryLabel: Localized;
  title: Localized;
  excerpt: Localized;
  body: Localized | null;
  coverImageUrl: string | null;
}

/** List payloads omit the body — the index page only renders title/excerpt. */
export type BlogPostSummary = Omit<BlogPost, "body">;

export interface Product {
  id: string;
  /** Maps to a lucide icon name client-side; keeps the API free of presentation concerns. */
  iconKey: string;
  title: Localized;
  description: Localized;
  imageUrl: string | null;
  sortOrder: number;
}

export interface ServicePlan {
  id: string;
  title: Localized;
  /** `null` means "Custom" / quote-only — the UI renders a consultation CTA instead of a price. */
  priceValue: number | null;
  unit: Localized | null;
  badge: Localized | null;
  description: Localized;
  sortOrder: number;
}

export interface TeamMember {
  id: string;
  initials: string;
  name: string;
  role: Localized;
  bio: Localized;
  linkedinUrl: string | null;
  sortOrder: number;
}

export interface Stat {
  id: string;
  value: Localized;
  label: Localized;
  sortOrder: number;
}

export interface Testimonial {
  id: string;
  quote: Localized;
  authorName: string;
  farm: Localized;
  sortOrder: number;
}

/** Everything the marketing pages need, in one round trip. */
export interface ContentBundle {
  blogPosts: BlogPostSummary[];
  products: Product[];
  servicePlans: ServicePlan[];
  team: TeamMember[];
  stats: Stat[];
  testimonials: Testimonial[];
}

export interface Wilaya {
  code: string;
  name: Localized;
  /** Optional delivery/coverage flag for later; the UI ignores it today. */
  covered: boolean;
}
