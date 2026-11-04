import { Router } from "express";
import { contentController } from "./content.controller.js";

/**
 * `/api/v1/content` — public marketing content.
 *
 * No auth, no limiter beyond the global one: these are cacheable reads that the marketing pages
 * need before anyone has signed in.
 */
export const contentRoutes = Router();

contentRoutes.get("/bundle", contentController.bundle);
contentRoutes.get("/blog", contentController.blogPosts);
contentRoutes.get("/blog/:slug", contentController.blogPost);
contentRoutes.get("/products", contentController.products);
contentRoutes.get("/service-plans", contentController.servicePlans);
contentRoutes.get("/pricing-plans", contentController.pricingPlans);
contentRoutes.get("/team", contentController.team);
contentRoutes.get("/stats", contentController.stats);
contentRoutes.get("/testimonials", contentController.testimonials);
