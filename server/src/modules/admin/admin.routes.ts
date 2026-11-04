import { Router } from "express";
import { adminController } from "./admin.controller.js";
import { cmsController } from "./cms.controller.js";
import { oversightController } from "./oversight.controller.js";

/** The entire namespace is guarded by requireAuth + requireSuperAdmin at the API mount. */
export const adminRoutes = Router();
adminRoutes.get("/stats", adminController.stats);
adminRoutes.get("/pricing", cmsController.listPricing);
adminRoutes.get("/pricing/:id", cmsController.pricing);
adminRoutes.post("/pricing", cmsController.createPricing);
adminRoutes.patch("/pricing/:id", cmsController.updatePricing);
adminRoutes.delete("/pricing/:id", cmsController.deletePricing);
adminRoutes.get("/blog", cmsController.listBlog);
adminRoutes.get("/blog/:id", cmsController.blog);
adminRoutes.post("/blog", cmsController.createBlog);
adminRoutes.patch("/blog/:id", cmsController.updateBlog);
adminRoutes.delete("/blog/:id", cmsController.deleteBlog);
adminRoutes.get("/farms", oversightController.farms);
adminRoutes.patch("/farms/:id/status", oversightController.setFarmStatus);
adminRoutes.get("/users", oversightController.users);
adminRoutes.patch("/users/:id/status", oversightController.setUserStatus);
