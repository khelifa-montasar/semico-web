import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateFarmInput, Farm, UpdateFarmInput, ZoneInput, UpdateZoneInput } from "@semico/shared";
import { farmApi, queryKeys } from "@/api";
import { setActiveFarmId } from "@/lib/api/http";
import { mapViewportQueryKey, type MapViewport } from "@/features/map/useMapViewport";

/**
 * Multi-farm management (V2).
 *
 * An owner holds up to three farms; every /farms/me/* screen answers for whichever one is ACTIVE.
 * That choice lives in the HTTP layer (`X-Farm-Id`), so these hooks never pass a farm id to a
 * farm-scoped call — switching is the only thing that changes which farm the API acts on.
 */

/** The active farm, in full. `farmApi.me()` resolves the header. */
export function useFarm() {
  return useQuery({
    queryKey: queryKeys.farm.detail(),
    queryFn: () => farmApi.me(),
  });
}

/** Every farm the owner holds, oldest first. Owner-only. */
export function useFarms() {
  return useQuery({
    queryKey: queryKeys.farm.list(),
    queryFn: () => farmApi.list(),
  });
}

export function useCreateFarm() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateFarmInput) => farmApi.create(input),
    onSuccess: () => {
      // The list gains a row and the switcher has a new option.
      void queryClient.invalidateQueries({ queryKey: queryKeys.farm.all });
    },
  });
}

export function useUpdateFarm() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateFarmInput) => farmApi.update(input),
    onSuccess: (farm: Farm) => {
      queryClient.setQueryData(queryKeys.farm.detail(), farm);
      if (farm.latitude != null && farm.longitude != null) {
        queryClient.setQueryData<MapViewport>(mapViewportQueryKey(farm.id), (current) => ({
          center: [farm.latitude!, farm.longitude!],
          zoom: current?.zoom ?? 19,
        }));
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.farm.list() });
    },
  });
}

export function useCreateZone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ZoneInput) => farmApi.createZone(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.farm.zones() }),
  });
}

export function useUpdateZone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateZoneInput }) =>
      farmApi.updateZone(vars.id, vars.input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.farm.zones() }),
  });
}

export function useUpdateFarmBoundary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (boundary: Array<[number, number]>) => farmApi.updateBoundary(boundary),
    onSuccess: (farm: Farm) => {
      // Seed the authoritative response so the map repaints without a round trip.
      queryClient.setQueryData(queryKeys.farm.detail(), farm);
    },
  });
}

/**
 * Makes a farm the active one.
 *
 * Invalidates EVERYTHING rather than the farm queries alone: every farm-scoped screen — telemetry,
 * zones, workers, analytics, activity — is now answering for a different farm, and leaving one of
 * them on the old farm's data would show two farms' figures side by side.
 */
export function useSwitchFarm() {
  const queryClient = useQueryClient();

  return useCallback(
    (farmId: string) => {
      setActiveFarmId(farmId);
      void queryClient.invalidateQueries();
    },
    [queryClient],
  );
}
