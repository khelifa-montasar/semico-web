import { z } from "zod";

export type ZoneBoundary = Array<[number, number]>;
export const MAX_ZONE_DIMENSION_METERS = 20_000;

export function openBoundary(points: ZoneBoundary): ZoneBoundary {
  const first = points[0];
  const last = points.at(-1);
  return first &&
    last &&
    points.length > 1 &&
    first[0] === last[0] &&
    first[1] === last[1]
    ? points.slice(0, -1)
    : points;
}

export function zoneAreaSquareMeters(points: ZoneBoundary): number {
  const ring = openBoundary(points);
  if (ring.length < 3) return 0;
  const origin = ring[0];
  const latitude = ring.reduce((sum, point) => sum + point[0], 0) / ring.length;
  const longitudeScale = 111_320 * Math.cos((latitude * Math.PI) / 180);
  let area = 0;
  for (let index = 0; index < ring.length; index++) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    area +=
      (current[1] - origin[1]) * (next[0] - origin[0]) -
      (next[1] - origin[1]) * (current[0] - origin[0]);
  }
  return (Math.abs(area) * longitudeScale * 110_574) / 2;
}

function intersects(
  first: [number, number],
  second: [number, number],
  third: [number, number],
  fourth: [number, number],
): boolean {
  const cross = (
    origin: [number, number],
    end: [number, number],
    point: [number, number],
  ) =>
    (end[0] - origin[0]) * (point[1] - origin[1]) -
    (end[1] - origin[1]) * (point[0] - origin[0]);
  const within = (
    point: [number, number],
    start: [number, number],
    end: [number, number],
  ) =>
    point[0] >= Math.min(start[0], end[0]) &&
    point[0] <= Math.max(start[0], end[0]) &&
    point[1] >= Math.min(start[1], end[1]) &&
    point[1] <= Math.max(start[1], end[1]);
  const firstSide = cross(first, second, third);
  const secondSide = cross(first, second, fourth);
  const thirdSide = cross(third, fourth, first);
  const fourthSide = cross(third, fourth, second);
  if (firstSide * secondSide < 0 && thirdSide * fourthSide < 0) return true;
  return (
    (Math.abs(firstSide) < 1e-14 && within(third, first, second)) ||
    (Math.abs(secondSide) < 1e-14 && within(fourth, first, second)) ||
    (Math.abs(thirdSide) < 1e-14 && within(first, third, fourth)) ||
    (Math.abs(fourthSide) < 1e-14 && within(second, third, fourth))
  );
}

export const zoneBoundarySchema = z
  .array(z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]))
  .min(3)
  .max(65)
  .transform(openBoundary)
  .superRefine((ring, context) => {
    if (
      ring.length < 3 ||
      ring.length > 64 ||
      new Set(ring.map((point) => point.join(","))).size !== ring.length ||
      zoneAreaSquareMeters(ring) < 0.25
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Draw a non-empty zone with 3–64 distinct corners",
      });
      return;
    }
    for (let firstIndex = 0; firstIndex < ring.length; firstIndex++) {
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < ring.length;
        secondIndex++
      ) {
        if (
          secondIndex === firstIndex + 1 ||
          (firstIndex === 0 && secondIndex === ring.length - 1)
        )
          continue;
        if (
          intersects(
            ring[firstIndex],
            ring[(firstIndex + 1) % ring.length],
            ring[secondIndex],
            ring[(secondIndex + 1) % ring.length],
          )
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Zone edges must not cross",
          });
          return;
        }
      }
    }
  });
