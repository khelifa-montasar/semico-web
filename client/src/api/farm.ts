import type { Farm, FarmSettings, UpdateFarmInput, FarmSettingsInput, Zone } from "@semico/shared";
import { api } from "../lib/api/http";

/** `/farms/me` — the caller's own farm. Always `me`, never an id. */
export const farmApi = {
  me: () => api.get<Farm>("/farms/me"),
  update: (input: UpdateFarmInput) => api.patch<Farm>("/farms/me", input),

  settings: () => api.get<FarmSettings>("/farms/me/settings"),
  /** Partial: the Settings page saves individual controls rather than the whole form. */
  updateSettings: (input: Partial<FarmSettingsInput>) =>
    api.patch<FarmSettings>("/farms/me/settings", input),

  /** Invalidates the old join code. Owner-only. */
  rotateOwnerCode: () => api.post<{ ownerCode: string }>("/farms/me/owner-code/rotate"),

  zones: () => api.get<Zone[]>("/farms/me/zones"),
};
