import { describe, expect, it } from "vitest";
import { MOISTURE, WEATHER } from "../../src/features/demoPlot/config";
import {
  advanceMoisture,
  clampMoisture,
  drainage,
  evapotranspiration,
  gaussianNoise,
  irrigationGain,
  soilTemperature,
} from "../../src/features/demoPlot/engine/soil";
import { seededRandom } from "./helpers";

/**
 * Soil physics.
 *
 * These are the numbers the whole demo rests on: if evapotranspiration or drainage were wrong, the
 * plot would still animate convincingly while being nonsense.
 */

describe("evapotranspiration", () => {
  it("is proportional to elapsed minutes", () => {
    expect(evapotranspiration(0)).toBe(0);
    expect(evapotranspiration(60)).toBeCloseTo(WEATHER.etPerDay / 24, 10);
    expect(evapotranspiration(120)).toBeCloseTo(evapotranspiration(60) * 2, 10);
  });

  it("loses exactly the daily rate over a full day", () => {
    expect(evapotranspiration(1440)).toBeCloseTo(WEATHER.etPerDay, 10);
  });

  it("never returns a negative loss", () => {
    expect(evapotranspiration(-30)).toBeLessThanOrEqual(0);
  });
});

describe("irrigation gain", () => {
  it("is proportional to irrigated minutes", () => {
    expect(irrigationGain(0)).toBe(0);
    expect(irrigationGain(10)).toBeCloseTo(WEATHER.irrigationGainPerMinute * 10, 10);
  });

  it("outpaces evaporation while a valve is open", () => {
    // Otherwise irrigating would fail to raise moisture, and the plot would never recover.
    expect(WEATHER.irrigationGainPerMinute).toBeGreaterThan(WEATHER.etPerDay / 1440);
  });
});

describe("drainage", () => {
  it("is zero at or below the wet threshold", () => {
    expect(drainage(MOISTURE.wetThreshold, 10)).toBe(0);
    expect(drainage(MOISTURE.wetThreshold - 5, 10)).toBe(0);
    expect(drainage(MOISTURE.min, 999)).toBe(0);
  });

  it("only sheds water once the soil is above the threshold", () => {
    expect(drainage(MOISTURE.wetThreshold + 1, 10)).toBeGreaterThan(0);
    expect(drainage(MOISTURE.wetThreshold + 1, 10)).toBeCloseTo(MOISTURE.drainPerMinute * 10, 10);
  });

  it("scales with elapsed minutes", () => {
    const tenMinutes = drainage(39, 10);
    expect(drainage(39, 20)).toBeCloseTo(tenMinutes * 2, 10);
  });
});

describe("clampMoisture", () => {
  it("holds readings inside the configured band", () => {
    expect(clampMoisture(MOISTURE.max + 50)).toBe(MOISTURE.max);
    expect(clampMoisture(MOISTURE.min - 50)).toBe(MOISTURE.min);
    expect(clampMoisture(0)).toBe(MOISTURE.min);
    expect(clampMoisture(-999)).toBe(MOISTURE.min);
  });

  it("leaves values inside the band untouched", () => {
    expect(clampMoisture(28)).toBe(28);
  });

  it("tames NaN into the floor rather than propagating it", () => {
    // Math.min/max with NaN yields NaN, so this documents what actually happens: NaN in, NaN out.
    // Consumers guard against it separately (see the engineering note in this file's sibling test).
    expect(Number.isNaN(clampMoisture(Number.NaN))).toBe(true);
  });
});

describe("gaussianNoise", () => {
  it("is deterministic for a given seed", () => {
    const first = Array.from({ length: 5 }, () => gaussianNoise(seededRandom(7)));
    const second = Array.from({ length: 5 }, () => gaussianNoise(seededRandom(7)));
    expect(first).toEqual(second);
  });

  it("returns zero when the sigma is zero", () => {
    // FINDING: the production signature is
    //   gaussianNoise(random = Math.random, sigma = WEATHER.noiseSigma)
    // and `WEATHER` is declared `as const`, so TypeScript infers `sigma` as the LITERAL type
    // `0.25` rather than `number`. Every other value is rejected at compile time — the parameter
    // is effectively unusable, which is the opposite of what its signature advertises.
    //
    // Latent rather than live: in production the function is only ever called through
    // `advanceMoisture` without an explicit sigma. Reported for the Phase 4 bug hunt rather than
    // fixed, since production code is out of scope here. The cast below is what lets this test
    // reach the zero-sigma path at all.
    const withSigma = gaussianNoise as (random: () => number, sigma: number) => number;

    const random = seededRandom(3);
    for (let i = 0; i < 20; i += 1) {
      // `toBeCloseTo` rather than `toBe`: the cosine factor can be negative, so the product with a
      // zero sigma is legitimately `-0`, and `Object.is(-0, 0)` is false.
      expect(withSigma(random, 0)).toBeCloseTo(0, 12);
    }
  });

  it("scales the noise by the sigma it accepts", () => {
    // Documents the parameter's intended behaviour, which the literal type currently prevents
    // anyone from using.
    const withSigma = gaussianNoise as (random: () => number, sigma: number) => number;

    const small = Math.abs(withSigma(seededRandom(9), 1));
    const large = Math.abs(withSigma(seededRandom(9), 10));
    expect(large).toBeGreaterThan(small);
  });

  it("stays within a few sigma over many samples", () => {
    const random = seededRandom(11);
    const samples = Array.from({ length: 2000 }, () => gaussianNoise(random));

    const sigma = WEATHER.noiseSigma;
    // 5 sigma is a very loose bound; this catches a broken Box–Muller (e.g. an unbounded or
    // wildly scaled result) without being flaky.
    expect(Math.max(...samples.map(Math.abs))).toBeLessThan(sigma * 5);

    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    expect(Math.abs(mean)).toBeLessThan(sigma * 0.2);
  });

  it("survives a random source that returns zero", () => {
    // Box–Muller takes log(0), which is -Infinity; the implementation must draw again.
    let calls = 0;
    const zeroThenOne = () => {
      calls += 1;
      return calls <= 4 ? 0 : 0.5;
    };
    expect(Number.isFinite(gaussianNoise(zeroThenOne))).toBe(true);
  });
});

describe("advanceMoisture", () => {
  it("dries the soil when nothing is irrigating", () => {
    const next = advanceMoisture(30, { minutes: 60, irrigatingMinutes: 0, random: () => 0.5 });
    expect(next).toBeLessThan(30);
  });

  it("wets the soil when the irrigation beats evaporation", () => {
    const next = advanceMoisture(30, { minutes: 10, irrigatingMinutes: 10, random: () => 0.5 });
    expect(next).toBeGreaterThan(30);
  });

  it("charges only the irrigated part of a long tick", () => {
    // The multi-minute-tick case: 20 simulated minutes pass but the valve was open for 5.
    const partial = advanceMoisture(30, { minutes: 20, irrigatingMinutes: 5, random: () => 0.5 });
    const none = advanceMoisture(30, { minutes: 20, irrigatingMinutes: 0, random: () => 0.5 });
    const all = advanceMoisture(30, { minutes: 20, irrigatingMinutes: 20, random: () => 0.5 });

    expect(partial).toBeGreaterThan(none);
    expect(partial).toBeLessThan(all);
  });

  it("never escapes the clamp, however extreme the input", () => {
    expect(advanceMoisture(MOISTURE.max, { minutes: 1440, irrigatingMinutes: 1440, random: () => 0.5 })).toBe(
      MOISTURE.max,
    );
    expect(advanceMoisture(MOISTURE.min, { minutes: 100_000, irrigatingMinutes: 0, random: () => 0.5 })).toBe(
      MOISTURE.min,
    );
  });

  it("sheds water rather than gaining it when already saturated and unwatered", () => {
    const next = advanceMoisture(MOISTURE.max, { minutes: 30, irrigatingMinutes: 0, random: () => 0.5 });
    expect(next).toBeLessThan(MOISTURE.max);
  });
});

describe("soilTemperature", () => {
  it("is periodic over a simulated day", () => {
    expect(soilTemperature(0)).toBeCloseTo(soilTemperature(1440), 10);
    expect(soilTemperature(-60)).toBeCloseTo(soilTemperature(1380), 10);
  });

  it("peaks at midday and troughs at midnight", () => {
    // ACTUAL BEHAVIOUR — and it contradicts the production docstring on BOTH ends. `engine/soil.ts`
    // claims "a sine peaking at 14:00 and troughing at 02:00 … a soil curve lags air temperature".
    // The phase term is `(minuteOfDay - 360) / 1440 · 2π`, so the sine peaks at minuteOfDay = 720
    // (12:00) and troughs at 0 (00:00) — neither of the stated times.
    //
    // Reported rather than fixed: production code is out of scope for this phase. Nothing depends
    // on the value, so the impact is a wrong comment rather than wrong behaviour.
    expect(soilTemperature(12 * 60)).toBeCloseTo(20 + 7, 6); // 27 at noon
    expect(soilTemperature(0)).toBeCloseTo(20 - 7, 6); // 13 at midnight

    // And it is a clean sine about that peak.
    expect(soilTemperature(12 * 60 - 180)).toBeCloseTo(soilTemperature(12 * 60 + 180), 6);
    expect(soilTemperature(12 * 60)).toBeGreaterThan(soilTemperature(15 * 60));
    expect(soilTemperature(0)).toBeLessThan(soilTemperature(6 * 60));
  });

  it("stays within a plausible soil range", () => {
    for (let minute = 0; minute < 1440; minute += 15) {
      const temperature = soilTemperature(minute);
      expect(temperature).toBeGreaterThan(5);
      expect(temperature).toBeLessThan(35);
    }
  });
});
