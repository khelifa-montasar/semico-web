import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  zoneAreaSquareMeters,
  zoneBoundarySchema,
  type FarmSettings,
} from "@semico/shared";
import { FarmMap } from "../../src/features/map/FarmMap";
import {
  boundaryDimensions,
  sensorSlotPositions,
  zoneRectangles,
  zoneShapes,
  type LatLng,
} from "../../src/features/map/geometry";
import { translations } from "../../src/app/i18n/translations";
import { tok } from "../../src/app/theme/tokens";
import { queryKeys } from "../../src/api/queryKeys";
import { setActiveFarmId } from "../../src/lib/api/http";
import { applyFarmSettings } from "../../src/features/farms/activeFarmScope";

const mocks = vi.hoisted(() => ({ polygons: vi.fn(), markers: vi.fn() }));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  Polygon: (props: { children?: ReactNode; positions: LatLng[] }) => {
    mocks.polygons(props);
    return <div data-zone="true">{props.children}</div>;
  },
  CircleMarker: (props: { children?: ReactNode; center: LatLng }) => {
    mocks.markers(props);
    return <div data-sensor="true">{props.children}</div>;
  },
  Tooltip: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  TileLayer: () => null,
  useMap: () => ({}),
  useMapEvents: () => ({}),
}));
vi.mock("../../src/app/contexts/LanguageContext", () => ({
  useLanguage: () => ({ t: translations.en }),
}));
vi.mock("../../src/app/hooks/useTokens", () => ({
  useTokens: () => tok(false),
}));

const clients: QueryClient[] = [];
function client() {
  const value = new QueryClient();
  clients.push(value);
  return value;
}
beforeEach(() => {
  vi.clearAllMocks();
  setActiveFarmId(null);
});
afterEach(() => {
  clients.splice(0).forEach((value) => value.clear());
  setActiveFarmId(null);
});

function inside(point: LatLng, polygon: LatLng[]): boolean {
  let result = false;
  polygon.forEach((start, index) => {
    const end = polygon[(index + 1) % polygon.length];
    if (
      start[0] > point[0] !== end[0] > point[0] &&
      point[1] <
        start[1] +
          ((point[0] - start[0]) * (end[1] - start[1])) / (end[0] - start[0])
    )
      result = !result;
  });
  return result;
}

describe("saved map counts", () => {
  it("draws one zone and one sensor even if cached registered data contains extras", () => {
    renderToStaticMarkup(
      <QueryClientProvider client={client()}>
        <FarmMap
          farmId="farm"
          zoneCount={1}
          sensorsPerZone={1}
          zones={[
            { id: "one", name: "One", moisture: 35, valveState: "CLOSED" },
            { id: "two", name: "Two", moisture: 40, valveState: "CLOSED" },
          ]}
          sensors={[
            { id: "sensor-a", key: "A", zoneId: "one", connection: "ONLINE" },
            { id: "sensor-b", key: "B", zoneId: "one", connection: "ONLINE" },
            { id: "sensor-c", key: "C", zoneId: "two", connection: "ONLINE" },
          ]}
        />
      </QueryClientProvider>,
    );
    expect(mocks.polygons).toHaveBeenCalledTimes(1);
    expect(mocks.markers).toHaveBeenCalledTimes(1);
  });

  it("uses each saved polygon instead of a generated rectangle", () => {
    const boundary: LatLng[] = [
      [36.75, 3.04],
      [36.751, 3.041],
      [36.749, 3.042],
    ];
    const shapes = zoneShapes([{ boundary }, {}], 2, [36.75, 3.04], 1);
    expect(shapes[0].ring).toEqual(boundary);
    expect(shapes[1].ring).toEqual(
      zoneRectangles(
        2,
        { lat: 36.75, lng: 3.04 },
        {
          widthMeters: Math.sqrt(15000),
          heightMeters: 10000 / Math.sqrt(15000),
        },
      )[1].ring,
    );
  });

  it.each([1, 2, 5, 16])(
    "keeps all %i sensor dots inside a concave zone",
    (count) => {
      const ring: LatLng[] = [
        [4, 0],
        [4, 1],
        [1, 1],
        [1, 3],
        [4, 3],
        [4, 4],
        [0, 4],
        [0, 0],
      ];
      const positions = sensorSlotPositions({ index: 0, ring }, count);
      expect(positions).toHaveLength(count);
      expect(positions.every((point) => inside(point, ring))).toBe(true);
      expect(new Set(positions.map((point) => point.join(","))).size).toBe(
        count,
      );
    },
  );
});

describe("zone dimensions and validation", () => {
  it("converts width and height in metres into the correct stored area", () => {
    const shape = zoneRectangles(
      1,
      { lat: 36.75, lng: 3.04 },
      { widthMeters: 50, heightMeters: 30 },
    )[0];
    expect(boundaryDimensions(shape.ring).widthMeters).toBeCloseTo(50, 5);
    expect(boundaryDimensions(shape.ring).heightMeters).toBeCloseTo(30, 5);
    expect(zoneAreaSquareMeters(shape.ring)).toBeCloseTo(1500, 3);
    expect(zoneBoundarySchema.parse([...shape.ring, shape.ring[0]])).toEqual(
      shape.ring,
    );
  });

  it("rejects crossing edges, zero area, and invalid coordinates", () => {
    for (const boundary of [
      [
        [0, 0],
        [2, 2],
        [0, 3],
        [3, 0],
      ],
      [
        [1, 1],
        [2, 2],
        [3, 3],
      ],
      [
        [91, 2],
        [30, 2],
        [30, 3],
      ],
    ]) {
      expect(zoneBoundarySchema.safeParse(boundary).success).toBe(false);
    }
  });
});

describe("farm-scoped settings cache", () => {
  const settings = (farmId: string, zoneCount: number): FarmSettings => ({
    farmId,
    zoneCount,
    sensorsPerZone: 1,
    moistureThreshold: 40,
    autoIrrigation: false,
    pushNotifications: false,
    timezone: "Africa/Algiers",
  });
  it("does not overwrite another farm when an earlier save finishes after a switch", async () => {
    const cache = client();
    cache.setQueryData(
      queryKeys.farm.settings("farm-a"),
      settings("farm-a", 3),
    );
    cache.setQueryData(
      queryKeys.farm.settings("farm-b"),
      settings("farm-b", 5),
    );
    cache.setQueryData(queryKeys.farm.settings(), settings("farm-b", 5));
    setActiveFarmId("farm-b");
    await applyFarmSettings(cache, settings("farm-a", 1));
    expect(cache.getQueryData(queryKeys.farm.settings("farm-a"))).toMatchObject(
      { zoneCount: 1 },
    );
    expect(cache.getQueryData(queryKeys.farm.settings("farm-b"))).toMatchObject(
      { zoneCount: 5 },
    );
    expect(cache.getQueryData(queryKeys.farm.settings())).toMatchObject({
      farmId: "farm-b",
      zoneCount: 5,
    });
  });
});
