/**
 * The client's API surface.
 *
 * One module per resource, mirroring `server/src/modules/`. The shared `http` layer owns token
 * handling, envelope unwrapping and the 401→refresh→retry dance, so these modules are just typed
 * path builders — which is the point: a change to an endpoint path happens in exactly one file.
 */

export { activityApi, type ActivityFilters } from "./activity";
export { adminApi } from "./admin";
export { analyticsApi, type RangeParams } from "./analytics";
export { authApi } from "./auth";
export { bookingsApi } from "./bookings";
export { contentApi, referenceApi } from "./content";
export { farmApi } from "./farm";
export { irrigationApi } from "./irrigation";
export { leadsApi } from "./leads";
export { usersApi } from "./profile";
export { telemetryApi, type SeriesParams } from "./telemetry";
export { realtimeApi } from "./realtime";
export { workersApi } from "./workers";
export { queryKeys } from "./queryKeys";

// Re-exported so feature code has a single import for the pieces it always needs together.
export { ApiError, api, qs, type Page } from "../lib/api/http";
