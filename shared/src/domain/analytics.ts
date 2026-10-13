import { z } from "zod";

/**
 * Analytics contracts.
 *
 * The page currently fabricates these with deterministic formulas (`Math.sin(i/3)` for the
 * drying curve, a 28-cell sine for the heatmap). The shapes here are deliberately identical so
 * the swap to real aggregates is invisible to the chart code.
 */

export const analyticsRangeSchema = z.object({
  range: z.enum(["24h", "7d", "30d", "90d"]).default("7d"),
  zoneId: z.string().trim().optional(),
});

export const analyticsDateSchema = z.object({
  /** `YYYY-MM-DD` in farm time. Defaults to today. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must look like 2026-04-19")
    .optional(),
});

export const analyticsMonthSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Month must look like 2026-04")
    .optional(),
});

/** The rainfall "what-if" slider on the Analytics page, 0–50 mm. */
export const whatIfSchema = analyticsRangeSchema.extend({
  rainfallMm: z.coerce.number().min(0).max(50).default(0),
});

export type AnalyticsRangeQuery = z.infer<typeof analyticsRangeSchema>;
export type WhatIfQuery = z.infer<typeof whatIfSchema>;

export interface AnalyticsOverview {
  /** DZD saved versus traditional irrigation over the range. */
  waterSavedDzd: number;
  litersSaved: number;
  autoIrrigations: number;
  manualOverrides: number;
  alertsRaised: number;
  averageRootMoisture: number;
  averageSurfaceMoisture: number | null;
  /**
   * Share of the farm's diagnostic components currently reporting healthy, 0–100.
   *
   * Deliberately NOT called "uptime": there is no device heartbeat in this system, so uptime cannot
   * be measured. The earlier `uptimePercent` name invited a UI to present this as uptime, which
   * would have been a claim the data does not support.
   */
  healthyComponentPercent: number;
  rangeLabel: { en: string; ar: string };
}

/** One point of the 48-hour drying-rate curve. */
export interface DryingRatePoint {
  hour: number;
  label: string;
  rate: number;
  /** Present only when the what-if rainfall slider is applied. */
  adjustedRate?: number;
}

/** A cell in the moisture-distribution heatmap (28 cells, matching the current grid). */
export interface HeatmapCell {
  index: number;
  /** Normalised 0–1 intensity. */
  value: number;
  label: string;
}

export interface AnalyticsHeatmap {
  month: string;
  cells: HeatmapCell[];
  peakIndex: number;
  averageValue: number;
}

export const EXPORT_FORMATS = ["csv", "json"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const exportQuerySchema = analyticsRangeSchema.extend({
  format: z.enum(EXPORT_FORMATS).default("csv"),
});
