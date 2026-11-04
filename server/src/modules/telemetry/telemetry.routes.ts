import { Router } from "express";
import { telemetryController } from "./telemetry.controller.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireFarmAccess } from "../../middleware/rbac.js";

/**
 * `/api/v1/farms/me/*` — telemetry and diagnostics. Every read is farm-scoped.
 *
 * Guards are attached PER ROUTE, not with `router.use(...)`: this router shares the `/farms/me`
 * prefix with several others, and a mounted router's `use` middleware runs for every request that
 * enters it, including ones it does not handle.
 */
export const telemetryRoutes = Router();

const memberOnly = [requireAuth, requireFarmAccess];

// `latest` before the series route so the more specific path is matched first.
telemetryRoutes.get("/telemetry/latest", ...memberOnly, telemetryController.latest);
telemetryRoutes.get("/telemetry/latest-per-zone", ...memberOnly, telemetryController.latestPerZone);
telemetryRoutes.get("/telemetry", ...memberOnly, telemetryController.series);

telemetryRoutes.get("/device-status", ...memberOnly, telemetryController.deviceStatus);

/** Sensors grouped by zone — the System Health main view. */
telemetryRoutes.get("/sensors", ...memberOnly, telemetryController.sensors);

telemetryRoutes.get("/system-health", ...memberOnly, telemetryController.systemHealth);
telemetryRoutes.get("/system-health/errors", ...memberOnly, telemetryController.errorLogs);
