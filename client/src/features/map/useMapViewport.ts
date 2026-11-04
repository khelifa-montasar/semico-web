import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { LatLng } from "./geometry";

export interface MapViewport {
  center: LatLng;
  zoom: number;
}

export function mapViewportQueryKey(farmId: string | undefined) {
  return ["farm-map-viewport", farmId ?? "default"] as const;
}

export function mapViewportQueryOptions(farmId: string | undefined, initialCenter: LatLng, initialZoom: number) {
  return {
    queryKey: mapViewportQueryKey(farmId),
    queryFn: async (): Promise<MapViewport> => ({ center: initialCenter, zoom: initialZoom }),
    initialData: { center: initialCenter, zoom: initialZoom },
    staleTime: Infinity,
    // Keep the last pan/zoom for as long as this app session is open, even after long route gaps.
    gcTime: Infinity,
  };
}

/** Keeps the last map position in the React Query cache across dashboard/diagnostics navigation. */
export function useMapViewport(farmId: string | undefined, initialCenter: LatLng, initialZoom: number) {
  const queryClient = useQueryClient();
  const options = mapViewportQueryOptions(farmId, initialCenter, initialZoom);
  const key = options.queryKey;
  const query = useQuery<MapViewport>(options);

  return {
    viewport: query.data,
    saveViewport(next: MapViewport) {
      queryClient.setQueryData<MapViewport>(key, (current) => {
        if (
          current &&
          Math.abs(current.center[0] - next.center[0]) < 0.000001 &&
          Math.abs(current.center[1] - next.center[1]) < 0.000001 &&
          current.zoom === next.zoom
        ) return current;
        return next;
      });
    },
  };
}
