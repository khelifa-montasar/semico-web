import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  EducationEntry,
  EducationInput,
  ExperienceEntry,
  ExperienceInput,
  UpdateProfileInput,
  UserProfile,
} from "@semico/shared";
import { queryKeys, usersApi } from "@/api";
import { farmApi } from "@/api/farm";

/**
 * Settings data.
 *
 * Every mutation returns the whole profile, and each one invalidates the profile query — so the
 * form re-renders from a single source of truth rather than patching local state and hoping it
 * matches what the server stored.
 */

export function useProfile() {
  return useQuery({
    queryKey: queryKeys.profile.detail(),
    queryFn: () => usersApi.me(),
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => usersApi.updateProfile(input),
    onSuccess: (profile: UserProfile) => {
      // Seed the cache with the authoritative response, then invalidate `me` so the header avatar
      // and initials follow a name change.
      queryClient.setQueryData(queryKeys.profile.detail(), profile);
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

export function useAddExperience() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ExperienceInput) => usersApi.addExperience(input),
    onSuccess: (profile: UserProfile) =>
      queryClient.setQueryData(queryKeys.profile.detail(), profile),
  });
}

export function useUpdateExperience() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; input: Partial<ExperienceInput> }) =>
      usersApi.updateExperience(vars.id, vars.input),
    onSuccess: (profile: UserProfile) =>
      queryClient.setQueryData(queryKeys.profile.detail(), profile),
  });
}

export function useDeleteExperience() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersApi.deleteExperience(id),
    // The delete returns 204, so refetch rather than seeding.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.profile.detail() }),
  });
}

export function useAddEducation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: EducationInput) => usersApi.addEducation(input),
    onSuccess: (profile: UserProfile) =>
      queryClient.setQueryData(queryKeys.profile.detail(), profile),
  });
}

export function useUpdateEducation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; input: Partial<EducationInput> }) =>
      usersApi.updateEducation(vars.id, vars.input),
    onSuccess: (profile: UserProfile) =>
      queryClient.setQueryData(queryKeys.profile.detail(), profile),
  });
}

export function useDeleteEducation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersApi.deleteEducation(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.profile.detail() }),
  });
}

/**
 * Farm irrigation settings — the threshold slider and the two preference toggles.
 *
 * Note the server's field is `pushNotifications`, exposed in the UI as "Notifications".
 */
export function useFarmSettings() {
  return useQuery({
    queryKey: queryKeys.farm.settings(),
    queryFn: () => farmApi.settings(),
  });
}

export function useUpdateFarmSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      moistureThreshold?: number;
      autoIrrigation?: boolean;
      pushNotifications?: boolean;
    }) => farmApi.updateSettings(input),
    onSuccess: (settings) => queryClient.setQueryData(queryKeys.farm.settings(), settings),
  });
}

export type { ExperienceEntry, EducationEntry };
