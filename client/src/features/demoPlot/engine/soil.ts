import { MOISTURE, WEATHER } from "../config";

/**
 * Soil moisture physics.
 *
 * Every function is pure and takes durations in simulated minutes, so the whole model can be
 * reasoned about (and tested) without a clock, a React tree or a running interval.
 */

/** Percentage points lost to evapotranspiration over `minutes`. */
export function evapotranspiration(minutes: number): number {
  return (WEATHER.etPerDay / 1440) * minutes;
}

/** Percentage points gained while irrigating for `minutes`. */
export function irrigationGain(minutes: number): number {
  return WEATHER.irrigationGainPerMinute * minutes;
}

/**
 * Percentage points lost to drainage.
 *
 * Water only drains away above `wetThreshold` — below it, soil holds what it has. Modelling this as
 * unconditional loss would dry the plot out for no reason at all.
 */
export function drainage(moisture: number, minutes: number): number {
  if (moisture <= MOISTURE.wetThreshold) return 0;
  return MOISTURE.drainPerMinute * minutes;
}

export function clampMoisture(value: number): number {
  return Math.min(MOISTURE.max, Math.max(MOISTURE.min, value));
}

/**
 * One standard-normal sample, via Box–Muller.
 *
 * Gaussian rather than a flat random jitter, because a uniform offset makes readings wander
 * unnaturally evenly. `random` is injectable so the engine can be tested deterministically.
 */
export function gaussianNoise(random: () => number = Math.random, sigma = WEATHER.noiseSigma): number {
  let u = 0;
  let v = 0;
  // log(0) is -Infinity, so neither uniform may be exactly zero.
  while (u === 0) u = random();
  while (v === 0) v = random();

  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sigma;
}

export interface AdvanceOptions {
  /** Simulated minutes in this tick. */
  minutes: number;
  /** How many of those minutes had this zone's valve open — may be less than `minutes`. */
  irrigatingMinutes: number;
  random?: () => number;
}

/**
 * Advances one zone's moisture by one tick.
 *
 * `irrigatingMinutes` is separate from `minutes` because at 20× speed a single tick can be longer
 * than an entire irrigation; charging a full tick of irrigation time would soak the zone, and
 * charging none would ignore the watering completely.
 */
export function advanceMoisture(moisture: number, options: AdvanceOptions): number {
  const { minutes, irrigatingMinutes, random } = options;

  const next =
    moisture -
    evapotranspiration(minutes) +
    irrigationGain(irrigatingMinutes) -
    drainage(moisture, minutes) +
    gaussianNoise(random);

  return clampMoisture(next);
}

/**
 * Soil temperature over the simulated day, in °C.
 *
 * A sine peaking at 14:00 and troughing at 02:00 — a soil curve lags air temperature, which is why
 * the peak is not at midday. Cosmetic: nothing depends on it, but a static number next to live
 * moisture would look wrong.
 */
export function soilTemperature(minute: number): number {
  const minuteOfDay = ((minute % 1440) + 1440) % 1440;
  // Shifted so the peak lands at 14:00 rather than 06:00.
  const phase = ((minuteOfDay - 360) / 1440) * 2 * Math.PI;
  return 20 + 7 * Math.sin(phase);
}
