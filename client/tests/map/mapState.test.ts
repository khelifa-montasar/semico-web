import { afterEach, describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { SensorZoneGroup, Zone } from "@semico/shared";
import { toFarmMapData } from "../../src/features/map/mapData";
import { plotDimensionsForArea, sensorSlotPositions, zoneRectangles } from "../../src/features/map/geometry";
import {
  mapViewportQueryKey,
  mapViewportQueryOptions,
  type MapViewport,
} from "../../src/features/map/useMapViewport";

const queryClients: QueryClient[] = [];

function createQueryClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClients.push(client);
  return client;
}

afterEach(() => {
  queryClients.splice(0).forEach((client) => client.clear());
});

describe("shared farm map state", () => {
  it("restores pan and zoom across map remounts for the same farm", async () => {
    const client = createQueryClient();
    const initialCenter: [number, number] = [36.75, 3.05];
    const initial = mapViewportQueryOptions("farm-a", initialCenter, 12);
    await client.ensureQueryData(initial);

    const moved: MapViewport = { center: [36.8, 3.1], zoom: 15 };
    client.setQueryData(initial.queryKey, moved);

    // A second page/map mounting with the same app-wide QueryClient observes the saved viewport,
    // rather than its own initial center and zoom.
    const remounted = mapViewportQueryOptions("farm-a", [36.7, 3], 10);
    expect(await client.ensureQueryData(remounted)).toEqual(moved);
    expect(client.getQueryCache().find({ queryKey: remounted.queryKey })?.options.gcTime).toBe(Infinity);
  });

  it("keeps viewports isolated by farm", async () => {
    const client = createQueryClient();
    const farmA = mapViewportQueryOptions("farm-a", [36.75, 3.05], 12);
    const farmB = mapViewportQueryOptions("farm-b", [35.7, 4.1], 9);
    await client.ensureQueryData(farmA);
    await client.ensureQueryData(farmB);

    client.setQueryData(farmA.queryKey, { center: [36.8, 3.1], zoom: 15 });

    expect(client.getQueryData(farmB.queryKey)).toEqual({ center: [35.7, 4.1], zoom: 9 });
    expect(mapViewportQueryKey("farm-a")).not.toEqual(mapViewportQueryKey("farm-b"));
  });

  it("generates farm-sized zone polygons and configured sensor slots", () => {
    expect(plotDimensionsForArea(null)).toEqual({ widthMeters: 120, heightMeters: 80 });
    const dimensions = plotDimensionsForArea(1.5);
    expect(dimensions.widthMeters * dimensions.heightMeters).toBeCloseTo(15_000);

    const zones = zoneRectangles(4, { lat: 36.75, lng: 3.05 }, dimensions);
    expect(zones).toHaveLength(4);
    expect(zones[0].ring).not.toEqual(zoneRectangles(4)[0].ring);
    expect(sensorSlotPositions(zones[0], 3)).toHaveLength(3);
    expect(sensorSlotPositions(zones[0], 0)).toEqual([]);
  });

  it("projects shared live zone and sensor results identically for both farm maps", () => {
    const zones: Zone[] = [{
      id: "zone-1",
      name: "North",
      latestMoisture: 31.5,
      valveState: "CLOSED",
      sortOrder: 0,
    }];
    const sensorGroups: SensorZoneGroup[] = [{
      zoneId: "zone-1",
      zoneName: "North",
      sensors: [{
        id: "sensor-1",
        key: "N-1",
        zoneId: "zone-1",
        zoneName: "North",
        connection: "ONLINE",
        lastSeenAt: "2026-10-25T12:00:00.000Z",
        batteryPct: 92,
      }],
      onlineCount: 1,
      offlineCount: 0,
    }];

    expect(toFarmMapData(zones, sensorGroups)).toEqual({
      zones: [{ id: "zone-1", name: "North", moisture: 31.5, valveState: "CLOSED" }],
      sensors: [{ id: "sensor-1", key: "N-1", zoneId: "zone-1", connection: "ONLINE" }],
    });
  });
});
