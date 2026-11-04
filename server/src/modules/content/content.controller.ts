import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { ok } from "../../lib/response.js";
import { parseQuery } from "../../lib/validate.js";
import { ApiError } from "../../lib/ApiError.js";
import { contentService } from "./content.service.js";

/**
 * HTTP layer for public content. All read-only, all public.
 *
 * Blog responses deliberately include BOTH languages, so the client's language toggle repaints
 * without a refetch.
 */

const blogQuerySchema = z.object({
  category: z.string().trim().optional(),
});

const slugParamSchema = z.object({
  slug: z.string().trim().min(1),
});

export const contentController = {
  pricingPlans: asyncHandler(async (_req, res) => {
    res.set("Cache-Control", "no-store");
    return ok(res, await contentService.pricingPlans());
  }),

  blogPosts: asyncHandler(async (req, res) => {
    const { category } = parseQuery(req, blogQuerySchema);
    return ok(res, await contentService.blogPosts(category));
  }),

  blogPost: asyncHandler(async (req, res) => {
    const { slug } = parseQuery(
      { query: req.params },
      slugParamSchema,
    );
    return ok(res, await contentService.blogPost(slug));
  }),

  products: asyncHandler(async (_req, res) => ok(res, await contentService.products())),

  servicePlans: asyncHandler(async (_req, res) => ok(res, await contentService.servicePlans())),

  team: asyncHandler(async (_req, res) => ok(res, await contentService.team())),

  stats: asyncHandler(async (_req, res) => ok(res, await contentService.stats())),

  testimonials: asyncHandler(async (_req, res) => ok(res, await contentService.testimonials())),

  /** One round trip for Home / About / Services. */
  bundle: asyncHandler(async (_req, res) => ok(res, await contentService.bundle())),
};

export { ApiError };
