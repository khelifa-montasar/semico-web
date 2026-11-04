import {
  BLOG_CATEGORIES,
  type BlogPost,
  type BlogPostSummary,
  type ContentBundle,
  type Product,
  type PricingPlan,
  type ServicePlan,
  type Stat,
  type TeamMember,
  type Testimonial,
  type Wilaya,
} from "@semico/shared";
import { ApiError } from "../../lib/ApiError.js";
import { loc, locOrNull } from "../../lib/localized.js";
import { contentRepository } from "./content.repository.js";
import { toBlogPost, toBlogSummary, toPricingPlan } from "./content.mapper.js";

/**
 * Public content.
 *
 * No writes, no permissions — but it still goes through a service so the mapping from database
 * columns to the bilingual `Localized` shape lives in exactly one place per entity, rather than
 * being repeated in every controller that happens to need a product.
 */

export const contentService = {
  async pricingPlans(): Promise<PricingPlan[]> {
    return (await contentRepository.listPricingPlans()).map(toPricingPlan);
  },

  async blogPosts(category?: string): Promise<BlogPostSummary[]> {
    if (category) {
      const normalised = category.trim().toUpperCase();
      if (!(BLOG_CATEGORIES as readonly string[]).includes(normalised)) {
        throw ApiError.badRequest("Unknown blog category", {
          category: [`Expected one of: ${BLOG_CATEGORIES.join(", ")}`],
        });
      }
      const rows = await contentRepository.listBlogPostsByCategory(normalised);
      return rows.map(toBlogSummary);
    }

    const rows = await contentRepository.listBlogPosts();
    return rows.map(toBlogSummary);
  },

  async blogPost(slug: string): Promise<BlogPost> {
    const row = await contentRepository.findBlogPostBySlug(slug);
    // An unpublished draft must not be reachable by guessing its slug.
    if (!row || !row.published) throw ApiError.notFound("That article does not exist");
    return toBlogPost(row);
  },

  async products(): Promise<Product[]> {
    const rows = await contentRepository.listProducts();
    return rows.map((row) => ({
      id: row.id,
      iconKey: row.iconKey,
      title: loc(row.titleEn, row.titleAr),
      description: loc(row.descEn, row.descAr),
      imageUrl: row.imageUrl,
      sortOrder: row.sortOrder,
    }));
  },

  async servicePlans(): Promise<ServicePlan[]> {
    const rows = await contentRepository.listServicePlans();
    return rows.map((row) => ({
      id: row.id,
      title: loc(row.titleEn, row.titleAr),
      priceValue: row.priceValue,
      unit: locOrNull(row.unitEn, row.unitAr),
      badge: locOrNull(row.badgeEn, row.badgeAr),
      description: loc(row.descEn, row.descAr),
      sortOrder: row.sortOrder,
    }));
  },

  async team(): Promise<TeamMember[]> {
    const rows = await contentRepository.listTeam();
    return rows.map((row) => ({
      id: row.id,
      initials: row.initials,
      name: row.name,
      role: loc(row.roleEn, row.roleAr),
      bio: loc(row.bioEn, row.bioAr),
      linkedinUrl: row.linkedinUrl,
      sortOrder: row.sortOrder,
    }));
  },

  async stats(): Promise<Stat[]> {
    const rows = await contentRepository.listStats();
    return rows.map((row) => ({
      id: row.id,
      value: loc(row.valueEn, row.valueAr),
      label: loc(row.labelEn, row.labelAr),
      sortOrder: row.sortOrder,
    }));
  },

  async testimonials(): Promise<Testimonial[]> {
    const rows = await contentRepository.listTestimonials();
    return rows.map((row) => ({
      id: row.id,
      quote: loc(row.quoteEn, row.quoteAr),
      authorName: row.authorName,
      farm: loc(row.farmEn, row.farmAr),
      sortOrder: row.sortOrder,
    }));
  },

  async wilayas(): Promise<Wilaya[]> {
    const rows = await contentRepository.listWilayas();
    return rows.map((row) => ({
      code: row.code,
      name: loc(row.nameEn, row.nameAr),
      covered: row.covered,
    }));
  },

  /**
   * Everything the marketing pages need in one round trip.
   *
   * Home, About and Services each pull from several of these collections; bundling them avoids
   * three pages firing six requests apiece on first paint.
   */
  async bundle(): Promise<ContentBundle> {
    const [blogPosts, products, servicePlans, team, stats, testimonials] = await Promise.all([
      this.blogPosts(),
      this.products(),
      this.servicePlans(),
      this.team(),
      this.stats(),
      this.testimonials(),
    ]);

    return { blogPosts, products, servicePlans, team, stats, testimonials };
  },
};
