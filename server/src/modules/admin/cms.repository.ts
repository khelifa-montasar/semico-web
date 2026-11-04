import type { Prisma } from "@prisma/client";
import type { PaginationQuery } from "@semico/shared";
import { prisma } from "../../db/prisma.js";

export const cmsRepository = {
  listPricing({ page, pageSize }: PaginationQuery) {
    return prisma.$transaction([
      prisma.pricingPlan.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ price: "asc" }, { id: "asc" }],
      }),
      prisma.pricingPlan.count(),
    ]);
  },
  findPricing(id: string) {
    return prisma.pricingPlan.findUnique({ where: { id } });
  },
  createPricing(data: Prisma.PricingPlanCreateInput) {
    return prisma.pricingPlan.create({ data });
  },
  updatePricing(id: string, data: Prisma.PricingPlanUpdateInput) {
    return prisma.pricingPlan.update({ where: { id }, data });
  },
  deletePricing(id: string) {
    return prisma.pricingPlan.delete({ where: { id } });
  },
  listBlog({ page, pageSize }: PaginationQuery) {
    return prisma.$transaction([
      prisma.blogPost.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ publishedAt: "desc" }, { sortOrder: "asc" }, { id: "asc" }],
      }),
      prisma.blogPost.count(),
    ]);
  },
  findBlog(id: string) {
    return prisma.blogPost.findUnique({ where: { id } });
  },
  createBlog(data: Prisma.BlogPostCreateInput) {
    return prisma.blogPost.create({ data });
  },
  updateBlog(id: string, data: Prisma.BlogPostUpdateInput) {
    return prisma.blogPost.update({ where: { id }, data });
  },
  deleteBlog(id: string) {
    return prisma.blogPost.delete({ where: { id } });
  },
};
