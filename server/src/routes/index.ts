import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireSuperAdmin } from "../middleware/rbac.js";
import { adminRoutes } from "../modules/admin/admin.routes.js";
import { authRoutes } from "../modules/auth/auth.routes.js";
import { contentRoutes } from "../modules/content/content.routes.js";
import { farmRoutes } from "../modules/farm/farm.routes.js";
import { telemetryRoutes } from "../modules/telemetry/telemetry.routes.js";
import { activityRoutes } from "../modules/activity/activity.routes.js";
import { irrigationRoutes } from "../modules/irrigation/irrigation.routes.js";
import { analyticsRoutes } from "../modules/analytics/analytics.routes.js";
import { workersRoutes } from "../modules/workers/workers.routes.js";
import { auditRoutes } from "../modules/audit/audit.routes.js";
import { usersRoutes } from "../modules/users/users.routes.js";
import { bookingsRoutes } from "../modules/bookings/bookings.routes.js";
import { leadsRoutes } from "../modules/leads/leads.routes.js";
import { referenceRoutes } from "../modules/reference/reference.routes.js";
import { realtimeRoutes } from "../modules/realtime/realtime.routes.js";

/**
 * The versioned API surface.
 *
 * Every feature module mounts here under `/api/v1`. The client's base URL is `/api/v1` and the
 * Vite dev proxy forwards `/api` to this server verbatim (no rewrite), so the browser only ever
 * sees one origin — which is what lets the refresh token live in a SameSite=Lax cookie.
 *
 * The many routers sharing the `/farms/me` prefix are safe because each attaches its guards
 * PER ROUTE rather than with `router.use(...)`. A router-level guard runs for every request that
 * enters the router, including ones it does not handle, so an owner-only guard declared that way
 * would reject a worker on an unrelated sibling route. Keep it per-route.
 */
export const apiRouter = Router();

/** Versioned liveness, for clients that want to confirm which API they are talking to. */
apiRouter.get("/health", (_req, res) => {
  res.json({ data: { status: "ok", version: "v1" } });
});

// Guard every method and nested admin path, including endpoints added in later phases.
// This namespace is exclusive to platform admins and has no farm membership requirement.
apiRouter.use("/admin", requireAuth, requireSuperAdmin);
apiRouter.use("/admin", adminRoutes);

apiRouter.use("/auth", authRoutes);
apiRouter.use("/content", contentRoutes);
apiRouter.use("/reference", referenceRoutes);
apiRouter.use("/bookings", bookingsRoutes);
apiRouter.use("/leads", leadsRoutes);
apiRouter.use("/users", usersRoutes);

apiRouter.use("/farms/me", telemetryRoutes);
apiRouter.use("/farms/me", realtimeRoutes);
apiRouter.use("/farms/me", activityRoutes);
apiRouter.use("/farms/me", irrigationRoutes);
apiRouter.use("/farms/me", analyticsRoutes);
apiRouter.use("/farms/me", workersRoutes);
apiRouter.use("/farms/me", auditRoutes);
apiRouter.use("/farms", farmRoutes);
