import { useCallback, useEffect, useMemo, useState } from "react";
import { SIMULATION } from "./config";
import { createInitialState, step, toKpis } from "./engine/step";
import type { KpiSnapshot, SimulationControls, SimulationState } from "./types";

/**
 * Drives the demo plot simulation.
 *
 * The whole model lives in `engine/step.ts` as a pure function; this hook only owns the timer and
 * the controls. Nothing is written to storage and nothing is sent to the server — the simulation is
 * deliberately ephemeral, so a reload starts a fresh plot rather than resuming a stale one.
 */

export interface Simulation extends SimulationControls {
  state: SimulationState;
  kpis: KpiSnapshot;
}

export function useSimulation(): Simulation {
  const [state, setState] = useState<SimulationState>(createInitialState);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState<number>(
    () => SIMULATION.speeds[SIMULATION.defaultSpeedIndex] ?? 1,
  );

  useEffect(() => {
    // Pausing simply does not start a timer — there is no "paused" tick to filter out later.
    // Re-creating the interval when speed changes is cheap and avoids a ref the tick would have to
    // read on every fire.
    if (!running) return;

    const timer = setInterval(() => {
      setState((previous) => step(previous, speed));
    }, SIMULATION.tickMs);

    return () => clearInterval(timer);
  }, [running, speed]);

  const pause = useCallback(() => setRunning(false), []);
  const resume = useCallback(() => setRunning(true), []);
  const toggle = useCallback(() => setRunning((value) => !value), []);

  const reset = useCallback(() => {
    setState(createInitialState());
    setRunning(true);
  }, []);

  // Derived rather than stored, so a KPI can never disagree with the state it summarises.
  const kpis = useMemo(() => toKpis(state), [state]);

  return { state, kpis, running, speed, pause, resume, toggle, setSpeed, reset };
}
