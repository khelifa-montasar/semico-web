import { Router } from "express";
import { authController } from "./auth.controller.js";
import { requireAuth } from "../../middleware/auth.js";
import { authLimiter } from "../../middleware/rateLimit.js";

/**
 * `/api/v1/auth`
 *
 * The limiter is attached per-route rather than to the whole router so that `refresh` and `me` —
 * which fire routinely, including on every page load — are not throttled by the tight credential
 * budget that protects `register` and `login`.
 */
export const authRoutes = Router();

authRoutes.post("/register", authLimiter, authController.register);
authRoutes.post("/login", authLimiter, authController.login);

authRoutes.post("/refresh", authController.refresh);
authRoutes.post("/logout", requireAuth, authController.logout);
authRoutes.get("/me", requireAuth, authController.me);
