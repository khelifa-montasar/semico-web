import {
  createBlogPostSchema,
  createPricingPlanSchema,
  paginationQuerySchema,
  updateBlogPostSchema,
  updatePricingPlanSchema,
} from "@semico/shared";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { created, noContent, ok, paginated } from "../../lib/response.js";
import {
  idParamSchema,
  parseBody,
  parseParams,
  parseQuery,
} from "../../lib/validate.js";
import { cmsService } from "./cms.service.js";

export const cmsController = {
  listPricing: asyncHandler(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const query = parseQuery(req, paginationQuerySchema);
    const { data, total } = await cmsService.listPricing(query);
    return paginated(res, data, { ...query, total });
  }),
  pricing: asyncHandler(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    return ok(
      res,
      await cmsService.pricing(parseParams(req, idParamSchema).id),
    );
  }),
  createPricing: asyncHandler(async (req, res) =>
    created(
      res,
      await cmsService.createPricing(parseBody(req, createPricingPlanSchema)),
    ),
  ),
  updatePricing: asyncHandler(async (req, res) =>
    ok(
      res,
      await cmsService.updatePricing(
        parseParams(req, idParamSchema).id,
        parseBody(req, updatePricingPlanSchema),
      ),
    ),
  ),
  deletePricing: asyncHandler(async (req, res) => {
    await cmsService.deletePricing(parseParams(req, idParamSchema).id);
    return noContent(res);
  }),
  listBlog: asyncHandler(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const query = parseQuery(req, paginationQuerySchema);
    const { data, total } = await cmsService.listBlog(query);
    return paginated(res, data, { ...query, total });
  }),
  blog: asyncHandler(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    return ok(res, await cmsService.blog(parseParams(req, idParamSchema).id));
  }),
  createBlog: asyncHandler(async (req, res) =>
    created(
      res,
      await cmsService.createBlog(parseBody(req, createBlogPostSchema)),
    ),
  ),
  updateBlog: asyncHandler(async (req, res) =>
    ok(
      res,
      await cmsService.updateBlog(
        parseParams(req, idParamSchema).id,
        parseBody(req, updateBlogPostSchema),
      ),
    ),
  ),
  deleteBlog: asyncHandler(async (req, res) => {
    await cmsService.deleteBlog(parseParams(req, idParamSchema).id);
    return noContent(res);
  }),
};
