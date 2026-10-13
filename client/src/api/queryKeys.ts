/**
 * Query key factory.
 *
 * Centralised so that invalidating after a mutation is a matter of referencing a prefix rather
 * than re-typing a string literal and hoping it matches. Keys are arrays, so TanStack Query
 * invalidates by prefix: `queryKeys.telemetry.all` covers the latest reading and every series.
 */
export const queryKeys = {
  me: ["me"] as const,

  /** The signed-in user's own profile, including experience and education. */
  profile: {
    all: ["profile"] as const,
    detail: () => [...queryKeys.profile.all, "detail"] as const,
  },

  farm: {
    all: ["farm"] as const,
    detail: () => [...queryKeys.farm.all, "detail"] as const,
    settings: () => [...queryKeys.farm.all, "settings"] as const,
    zones: () => [...queryKeys.farm.all, "zones"] as const,
  },

  telemetry: {
    all: ["telemetry"] as const,
    latest: (zoneId?: string) => [...queryKeys.telemetry.all, "latest", zoneId ?? "all"] as const,
    latestPerZone: () => [...queryKeys.telemetry.all, "latest-per-zone"] as const,
    series: (params: { interval?: string; range?: string; zoneId?: string }) =>
      [...queryKeys.telemetry.all, "series", params] as const,
    deviceStatus: () => [...queryKeys.telemetry.all, "device-status"] as const,
  },

  systemHealth: {
    all: ["system-health"] as const,
    detail: () => [...queryKeys.systemHealth.all, "detail"] as const,
    errors: (limit: number) => [...queryKeys.systemHealth.all, "errors", limit] as const,
  },

  activity: {
    all: ["activity"] as const,
    feed: (filters: object) => [...queryKeys.activity.all, "feed", filters] as const,
    calendar: (month?: string) => [...queryKeys.activity.all, "calendar", month ?? "current"] as const,
  },

  irrigation: {
    all: ["irrigation"] as const,
    commands: (filters: object) =>
      [...queryKeys.irrigation.all, "commands", filters] as const,
  },

  workers: {
    all: ["workers"] as const,
    list: () => [...queryKeys.workers.all, "list"] as const,
  },

  analytics: {
    all: ["analytics"] as const,
    overview: (range: string) => [...queryKeys.analytics.all, "overview", range] as const,
    moisture: (params: object) => [...queryKeys.analytics.all, "moisture", params] as const,
    flow: (date: string | undefined, rainfallMm: number) =>
      [...queryKeys.analytics.all, "flow", date ?? "today", rainfallMm] as const,
    heatmap: (month?: string) => [...queryKeys.analytics.all, "heatmap", month ?? "current"] as const,
  },

  bookings: {
    all: ["bookings"] as const,
    availability: (params: object) =>
      [...queryKeys.bookings.all, "availability", params] as const,
    list: (filters: object) => [...queryKeys.bookings.all, "list", filters] as const,
  },

  /** Sales leads — owner-only, never farm-scoped. */
  leads: {
    all: ["leads"] as const,
    list: (filters: object) => [...queryKeys.leads.all, "list", filters] as const,
  },

  /** Public marketing content. Long-lived; edited rarely, so a generous stale time is fine. */
  content: {
    all: ["content"] as const,
    bundle: () => [...queryKeys.content.all, "bundle"] as const,
    blog: (category?: string) => [...queryKeys.content.all, "blog", category ?? "all"] as const,
    post: (slug: string) => [...queryKeys.content.all, "post", slug] as const,
    products: () => [...queryKeys.content.all, "products"] as const,
  },

  reference: {
    all: ["reference"] as const,
    wilayas: () => [...queryKeys.reference.all, "wilayas"] as const,
  },
} as const;
