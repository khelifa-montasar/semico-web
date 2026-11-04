import { createInitialState, step } from "../../src/features/demoPlot/engine/step";
import type { SimulationState } from "../../src/features/demoPlot/types";

/**
 * Test helpers for the demo plot engine.
 *
 * The engine takes `random` as an injectable parameter precisely so tests can be deterministic — a
 * real `Math.random` would make every assertion about moisture values flaky.
 */

/**
 * A seeded linear congruential generator.
 *
 * Not a good RNG (it is the classic glibc one) but perfectly adequate here: it is deterministic,
 * uniform enough for noise, and needs no dependency.
 */
export function seededRandom(seed = 42): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/** Advances a state `count` times by `tick` simulated minutes each. */
export function run(
  state: SimulationState,
  count: number,
  tick = 1,
  random: () => number = seededRandom(),
): SimulationState {
  let next = state;
  for (let i = 0; i < count; i += 1) next = step(next, tick, random);
  return next;
}

/** A fresh state with a deterministic RNG attached. */
export function freshState(): SimulationState {
  return createInitialState();
}

/** Every moisture value in a state, for whole-plot assertions. */
export function allMoisture(state: SimulationState): number[] {
  return state.zones.map((zone) => zone.moisture);
}
