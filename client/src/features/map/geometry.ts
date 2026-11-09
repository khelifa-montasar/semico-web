import { PLOT } from "../demoPlot/config";
import { openBoundary } from "@semico/shared";

export const DEFAULT_PLOT_WIDTH_METERS = PLOT.widthMeters;
export const DEFAULT_PLOT_HEIGHT_METERS = PLOT.heightMeters;

/** Builds a stable 3:2 plot footprint from farm area, with demo dimensions as a safe fallback. */
export function plotDimensionsForArea(landAreaHa?: number | null): {
  widthMeters: number;
  heightMeters: number;
} {
  if (landAreaHa == null || !Number.isFinite(landAreaHa) || landAreaHa <= 0) {
    return {
      widthMeters: DEFAULT_PLOT_WIDTH_METERS,
      heightMeters: DEFAULT_PLOT_HEIGHT_METERS,
    };
  }

  const areaMeters = landAreaHa * 10_000;
  const widthMeters = Math.sqrt(areaMeters * 1.5);
  return { widthMeters, heightMeters: areaMeters / widthMeters };
}

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
export function sensorSlotPositions(
  rectangle: ZoneRectangle,
  count: number,
): LatLng[] {
  if (!Number.isFinite(count) || count <= 0 || rectangle.ring.length < 3)
    return [];
  const ring = openBoundary(rectangle.ring);
  const latitudes = [...new Set(ring.map((point) => point[0]))].sort(
    (left, right) => left - right,
  );
  const levels = [
    (latitudes[0] + latitudes[latitudes.length - 1]) / 2,
    ...latitudes
      .slice(1)
      .map((latitude, index) => (latitude + latitudes[index]) / 2),
  ];
  let best: {
    latitude: number;
    spans: Array<[number, number]>;
    width: number;
  } | null = null;
  for (const latitude of levels) {
    const intersections: number[] = [];
    ring.forEach((start, index) => {
      const end = ring[(index + 1) % ring.length];
      if (start[0] > latitude !== end[0] > latitude)
        intersections.push(
          start[1] +
            ((latitude - start[0]) * (end[1] - start[1])) / (end[0] - start[0]),
        );
    });
    intersections.sort((left, right) => left - right);
    const spans: Array<[number, number]> = [];
    for (let index = 0; index + 1 < intersections.length; index += 2) {
      const inset = (intersections[index + 1] - intersections[index]) * 0.04;
      if (inset > 0)
        spans.push([
          intersections[index] + inset,
          intersections[index + 1] - inset,
        ]);
    }
    const width = spans.reduce((sum, span) => sum + span[1] - span[0], 0);
    if (width > 0 && (!best || width > best.width + 1e-12))
      best = { latitude, spans, width };
  }
  if (!best) return [];
  const line = best;
  return Array.from({ length: Math.floor(count) }, (_, index) => {
    let distance = (line.width * (index + 1)) / (Math.floor(count) + 1);
    for (const span of line.spans) {
      const width = span[1] - span[0];
      if (distance <= width)
        return [line.latitude, span[0] + distance] as LatLng;
      distance -= width;
    }
    return [line.latitude, line.spans[line.spans.length - 1][1]] as LatLng;
  });
}

export function farmMapCenter(
  center?: LatLng,
  boundary?: LatLng[] | null,
): LatLng {
  if (center) return center;
  if (boundary?.length)
    return [
      boundary.reduce((sum, point) => sum + point[0], 0) / boundary.length,
      boundary.reduce((sum, point) => sum + point[1], 0) / boundary.length,
    ];
  return [PLOT.center.lat, PLOT.center.lng];
}

export function zoneShapes(
  zones: Array<{ boundary?: LatLng[] | null }>,
  count: number,
  center: LatLng,
  landAreaHa?: number | null,
): ZoneRectangle[] {
  return zoneRectangles(
    count,
    { lat: center[0], lng: center[1] },
    plotDimensionsForArea(landAreaHa),
  ).map((rectangle, index) => {
    const boundary = zones[index]?.boundary;
    return boundary && boundary.length >= 3
      ? { index, ring: openBoundary(boundary) }
      : rectangle;
  });
}

export function boundaryDimensions(boundary: LatLng[]): {
  widthMeters: number;
  heightMeters: number;
} {
  if (!boundary.length) return { widthMeters: 50, heightMeters: 30 };
  const north = Math.max(...boundary.map((point) => point[0]));
  const south = Math.min(...boundary.map((point) => point[0]));
  const east = Math.max(...boundary.map((point) => point[1]));
  const west = Math.min(...boundary.map((point) => point[1]));
  return {
    widthMeters: (east - west) * metersPerDegreeLng((north + south) / 2),
    heightMeters: (north - south) * METERS_PER_DEGREE_LAT,
  };
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
