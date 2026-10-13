import { Router } from "express";
import { bookingsController } from "./bookings.controller.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireOwner } from "../../middleware/rbac.js";
import { authLimiter } from "../../middleware/rateLimit.js";

/**
 * `/api/v1/bookings`
 *
 * Availability and creation are public — the consultation form lives on the marketing pages and is
 * filled in by anonymous visitors. Creating one is rate-limited on the same budget as login,
 * because it is unauthenticated and writes to the database.
 *
 * The owner-side list and status changes are deliberately not farm-scoped: these are company
 * consultations, not per-farm records, which is why they are not under `/farms/me`.
 */
export const bookingsRoutes = Router();

bookingsRoutes.get("/availability", bookingsController.availability);
bookingsRoutes.post("/", authLimiter, bookingsController.create);

bookingsRoutes.get("/", requireAuth, requireOwner, bookingsController.list);
bookingsRoutes.patch("/:id", requireAuth, requireOwner, bookingsController.updateStatus);
