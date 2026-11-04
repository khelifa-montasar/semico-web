import { BMC } from "../config";

/**
 * Water savings against traditional flood irrigation.
 *
 * The comparison is the one the project's Business Model Canvas claims: drip irrigation uses 50 %
 * of the water flood irrigation would, for the same plot and the same irrigation events. It is a
 * MODEL, not a measurement — there is no flow meter behind it — and the module says so on screen
 * rather than presenting the figure as a reading.
 */

/** Litres a single zone-event consumes under drip, derived from the BMC saving. */
export const LITRES_PER_DRIP_EVENT =
  BMC.traditionalLitresPerZonePerEvent * (1 - BMC.waterSavingPercent / 100);

export interface SavingsTotals {
  /** Litres this plot has actually used. */
  dripLitres: number;
  /** What flood irrigation would have used for the same events. */
  traditionalLitres: number;
  /** The difference — the number the KPI shows. */
  savedLitres: number;
  /** Saved as a share of traditional, 0–100. */
  savedPercent: number;
}

/**
 * Totals for a number of completed irrigation events.
 *
 * Derived from the event count rather than accumulated per tick, so the figures can never drift
 * away from the events that caused them.
 */
export function savingsTotals(events: number): SavingsTotals {
  const traditionalLitres = events * BMC.traditionalLitresPerZonePerEvent;
  const dripLitres = events * LITRES_PER_DRIP_EVENT;
  const savedLitres = traditionalLitres - dripLitres;

  return {
    dripLitres,
    traditionalLitres,
    savedLitres,
    // Guard the degenerate case rather than emitting NaN into the KPI.
    savedPercent: traditionalLitres === 0 ? 0 : Math.round((savedLitres / traditionalLitres) * 100),
  };
}
