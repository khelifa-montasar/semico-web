import { prisma } from "../../db/prisma.js";

/**
 * Read-only access to the public marketing content.
 *
 * Everything here is public and cacheable. Ordered queries take `sortOrder` from the database
 * rather than being hardcoded in the client, so an editor can reorder the product grid without a
 * deploy.
 */
export const contentRepository = {
  listBlogPosts(includeUnpublished = false) {
    return prisma.blogPost.findMany({
      where: includeUnpublished ? {} : { published: true },
      orderBy: [{ publishedAt: "desc" }, { sortOrder: "asc" }],
    });
  },

  findBlogPostBySlug(slug: string) {
    return prisma.blogPost.findUnique({ where: { slug } });
  },

  listBlogPostsByCategory(category: string) {
    return prisma.blogPost.findMany({
      where: { published: true, category },
      orderBy: { publishedAt: "desc" },
    });
  },

  listProducts() {
    return prisma.product.findMany({ orderBy: { sortOrder: "asc" } });
  },

  listServicePlans() {
    return prisma.servicePlan.findMany({ orderBy: { sortOrder: "asc" } });
  },

  listTeam() {
    return prisma.teamMember.findMany({ orderBy: { sortOrder: "asc" } });
  },

  listStats() {
    return prisma.stat.findMany({ orderBy: { sortOrder: "asc" } });
  },

  listTestimonials() {
    return prisma.testimonial.findMany({ orderBy: { sortOrder: "asc" } });
  },

  listWilayas() {
    return prisma.wilaya.findMany({ orderBy: { code: "asc" } });
  },
};
