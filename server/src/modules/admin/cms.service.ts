import type { BlogPost } from "@prisma/client";
import type {
  AdminBlogPost,
  CreateBlogPostInput,
  CreatePricingPlanInput,
  PaginationQuery,
  UpdateBlogPostInput,
  UpdatePricingPlanInput,
} from "@semico/shared";
import { ApiError } from "../../lib/ApiError.js";
import { toBlogPost, toPricingPlan } from "../content/content.mapper.js";
import { cmsRepository } from "./cms.repository.js";

function toAdminPost(row: BlogPost): AdminBlogPost {
  return {
    ...toBlogPost(row),
    published: row.published,
    sortOrder: row.sortOrder,
  };
}

export const cmsService = {
  async listPricing(query: PaginationQuery) {
    const [rows, total] = await cmsRepository.listPricing(query);
    return { data: rows.map(toPricingPlan), total };
  },
  async pricing(id: string) {
    const row = await cmsRepository.findPricing(id);
    if (!row) throw ApiError.notFound("That pricing plan does not exist");
    return toPricingPlan(row);
  },
  async createPricing(input: CreatePricingPlanInput) {
    const { features, ...data } = input;
    return toPricingPlan(
      await cmsRepository.createPricing({
        ...data,
        featuresJson: JSON.stringify(features),
      }),
    );
  },
  async updatePricing(id: string, input: UpdatePricingPlanInput) {
    const { features, ...data } = input;
    return toPricingPlan(
      await cmsRepository.updatePricing(id, {
        ...data,
        ...(features !== undefined
          ? { featuresJson: JSON.stringify(features) }
          : {}),
      }),
    );
  },
  async deletePricing(id: string) {
    await cmsRepository.deletePricing(id);
  },
  async listBlog(query: PaginationQuery) {
    const [rows, total] = await cmsRepository.listBlog(query);
    return { data: rows.map(toAdminPost), total };
  },
  async blog(id: string) {
    const row = await cmsRepository.findBlog(id);
    if (!row) throw ApiError.notFound("That article does not exist");
    return toAdminPost(row);
  },
  async createBlog(input: CreateBlogPostInput) {
    return toAdminPost(
      await cmsRepository.createBlog({
        ...input,
        publishedAt: new Date(input.publishedAt),
      }),
    );
  },
  async updateBlog(id: string, input: UpdateBlogPostInput) {
    return toAdminPost(
      await cmsRepository.updateBlog(id, {
        ...input,
        ...(input.publishedAt !== undefined
          ? { publishedAt: new Date(input.publishedAt) }
          : {}),
      }),
    );
  },
  async deleteBlog(id: string) {
    await cmsRepository.deleteBlog(id);
  },
};
