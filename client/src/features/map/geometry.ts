import { PLOT } from "../demoPlot/config";

export const DEFAULT_PLOT_WIDTH_METERS = PLOT.widthMeters;
export const DEFAULT_PLOT_HEIGHT_METERS = PLOT.heightMeters;

/** Builds a stable 3:2 plot footprint from farm area, with demo dimensions as a safe fallback. */
export function plotDimensionsForArea(landAreaHa?: number | null): { widthMeters: number; heightMeters: number } {
  if (landAreaHa == null || !Number.isFinite(landAreaHa) || landAreaHa <= 0) {
    return { widthMeters: DEFAULT_PLOT_WIDTH_METERS, heightMeters: DEFAULT_PLOT_HEIGHT_METERS };
  }

  const areaMeters = landAreaHa * 10_000;
  const widthMeters = Math.sqrt(areaMeters * 1.5);
  return { widthMeters, heightMeters: areaMeters / widthMeters };
}

/**
 * Plot geometry, shared by every map.
 *
 * The farm's zones do not carry stored polygons yet — Phase 4 adds the drawing tool — so the map
 * places them on a grid inside the same plot the demo uses. Keeping the maths here rather than in
 * each map means the dashboard and the diagnostics view cannot drift apart on where a zone sits.
 *
 * `PLOT` still lives in the demo-plot config because that module owns the field's dimensions; when
 * the module is renamed, this import moves with it.
 */

/** Metres per degree of latitude. Constant enough for a 120 m field; not for a country. */
export const METERS_PER_DEGREE_LAT = 110_574;

/** Longitude degrees shrink towards the poles, so a metre of longitude is worth more degrees north. */
export function metersPerDegreeLng(latitude: number): number {
  return 111_320 * Math.cos((latitude * Math.PI) / 180);
}

export type LatLng = [number, number];

export interface ZoneRectangle {
  /** Row-major position, so callers can pair it with their own ordering. */
  index: number;
  /** Closed ring, clockwise from the north-west corner — the order a simple polygon needs. */
  ring: LatLng[];
}

/** Evenly spaced sensor layout positions along a zone's horizontal midpoint. */
export function sensorSlotPositions(rectangle: ZoneRectangle, count: number): LatLng[] {
  if (count <= 0) return [];
  const [northWest, northEast, , southWest] = rectangle.ring;
  return Array.from({ length: count }, (_, index) => {
    const fraction = (index + 1) / (count + 1);
    return [
      (northWest[0] + southWest[0]) / 2,
      northWest[1] + (northEast[1] - northWest[1]) * fraction,
    ] as LatLng;
  });
}

/**
 * Lays `count` zones out as equal rectangles, row-major, inside the plot bounds.
 *
 * Columns are chosen to keep the grid roughly square. Four zones become 2×2 rather than 1×4, which
 * would stretch each zone across the whole field and misrepresent its size.
 */
export function zoneRectangles(
  count: number,
  center: { lat: number; lng: number } = PLOT.center,
  dimensions: { widthMeters?: number; heightMeters?: number } = {},
): ZoneRectangle[] {
  if (count <= 0) return [];

  const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / columns));

  const widthMeters = dimensions.widthMeters ?? DEFAULT_PLOT_WIDTH_METERS;
  const heightMeters = dimensions.heightMeters ?? DEFAULT_PLOT_HEIGHT_METERS;
  const lngMetres = metersPerDegreeLng(center.lat);
  const dLat = heightMeters / rows / METERS_PER_DEGREE_LAT;
  const dLng = widthMeters / columns / lngMetres;
  const northEdge = center.lat + heightMeters / 2 / METERS_PER_DEGREE_LAT;
  const westEdge = center.lng - widthMeters / 2 / lngMetres;

  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;

    const north = northEdge - row * dLat;
    const south = north - dLat;
    const west = westEdge + column * dLng;
    const east = west + dLng;

    return {
      index,
      ring: [
        [north, west],
        [north, east],
        [south, east],
        [south, west],
      ],
    };
  });
}
