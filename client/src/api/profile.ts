import type {
  EducationInput,
  ExperienceInput,
  UpdateProfileInput,
  UserProfile,
} from "@semico/shared";
import { api } from "../lib/api/http";

/**
 * `/users/me` — the signed-in user's own profile.
 *
 * Every mutation returns the whole profile, so the Settings form re-renders from one source of
 * truth rather than patching local state and hoping it matches.
 *
 * Note what is NOT here: email (the login identity) and role (an administrative action). Neither
 * is editable from a profile form, and the server ignores them if sent.
 */
export const usersApi = {
  me: () => api.get<UserProfile>("/users/me"),

  updateProfile: (input: UpdateProfileInput) => api.patch<UserProfile>("/users/me", input),

  addExperience: (input: ExperienceInput) =>
    api.post<UserProfile>("/users/me/experience", input),
  updateExperience: (id: string, input: Partial<ExperienceInput>) =>
    api.patch<UserProfile>(`/users/me/experience/${id}`, input),
  deleteExperience: (id: string) => api.delete<void>(`/users/me/experience/${id}`),

  addEducation: (input: EducationInput) => api.post<UserProfile>("/users/me/education", input),
  updateEducation: (id: string, input: Partial<EducationInput>) =>
    api.patch<UserProfile>(`/users/me/education/${id}`, input),
  deleteEducation: (id: string) => api.delete<void>(`/users/me/education/${id}`),
};
