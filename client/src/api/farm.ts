import type {
  CreateFarmInput,
  Farm,
  FarmSettings,
  FarmSummary,
  UpdateFarmInput,
  FarmSettingsInput,
  Zone,
  ZoneInput,
  UpdateZoneInput,
} from "@semico/shared";
import { api } from "../lib/api/http";

/** `/farms/me` — the caller's own farm. Always `me`, never an id. */
export const farmApi = {
  me: () => api.get<Farm>("/farms/me"),
  update: (input: UpdateFarmInput) => api.patch<Farm>("/farms/me", input),

  /**
   * The owner's farms (up to three).
   *
   * Deliberately `/farms`, not `/farms/me`: this is the collection, and which one `me` resolves to
   * is decided by the `X-Farm-Id` header that `http.ts` attaches.
   */
  list: () => api.get<FarmSummary[]>("/farms"),
  create: (input: CreateFarmInput) => api.post<Farm>("/farms", input),

  /** The outline drawn on the map. Owner-only. */
  updateBoundary: (boundary: Array<[number, number]>) =>
    api.patch<Farm>("/farms/me/boundary", { boundary }),

  settings: (farmId?: string) => api.get<FarmSettings>("/farms/me/settings", farmId ? { headers: { "X-Farm-Id": farmId } } : undefined),
  /** Partial: the Settings page saves individual controls rather than the whole form. */
  updateSettings: (input: Partial<FarmSettingsInput>, farmId?: string) =>
    api.patch<FarmSettings>("/farms/me/settings", input, farmId ? { headers: { "X-Farm-Id": farmId } } : undefined),

  /** Invalidates the old join code. Owner-only. */
  rotateOwnerCode: () => api.post<{ ownerCode: string }>("/farms/me/owner-code/rotate"),

  zones: () => api.get<Zone[]>("/farms/me/zones"),
  createZone: (input: ZoneInput, farmId?: string) => api.post<Zone>("/farms/me/zones", input, farmId ? { headers: { "X-Farm-Id": farmId } } : undefined),
  updateZone: (id: string, input: UpdateZoneInput, farmId?: string) => api.patch<Zone>(`/farms/me/zones/${id}`, input, farmId ? { headers: { "X-Farm-Id": farmId } } : undefined),
};
