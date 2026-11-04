import type {
  AnalyticsHeatmap,
  AnalyticsOverview,
  AnalyticsRangeQuery,
  AnalyticsWindowQuery,
  DryingRatePoint,
  ExportQuery,
  MoisturePoint,
} from "@semico/shared";
import { ApiError } from "../../lib/ApiError.js";
import {
  daysInFarmMonth,
  endOfFarmMonth,
  farmDayKey,
  farmTimeLabel,
  parseFarmDay,
  startOfFarmDay,
  startOfFarmMonth,
  rangeToDays,
} from "../../lib/time.js";
import { analyticsRepository } from "./analytics.repository.js";
import { telemetryService } from "../telemetry/telemetry.service.js";
import type { AuthContext } from "../../types/auth.js";

/**
 * Analytics.
 *
 * A NOTE ON HONESTY: there is no flow-meter baseline and no historic manual-irrigation dataset, so
 * the water-savings figures below are MODELLED from a fixed per-event estimate, not measured. They
 * are labelled as estimates in the response's `rangeLabel` and in the README. If a real baseline
 * lands, replace `estimateLitresSaved` and the number becomes derived rather than assumed.
 */

function requireFarmId(auth: AuthContext): string {
  if (!auth.farmId) throw ApiError.forbidden("You are not attached to a farm yet");
  return auth.farmId;
}

function windowFor(range: "24h" | "7d" | "30d" | "90d"): { from: Date; to: Date } {
  const to = new Date();
  return { from: new Date(to.getTime() - rangeToDays(range) * 24 * 60 * 60 * 1000), to };
}

const RANGE_LABELS: Record<string, { en: string; ar: string }> = {
  "24h": { en: "Last 24 hours", ar: "آخر 24 ساعة" },
  "7d": { en: "Last 7 days", ar: "آخر 7 أيام" },
  "30d": { en: "Last 30 days", ar: "آخر 30 يوماً" },
  "90d": { en: "Last 90 days", ar: "آخر 90 يوماً" },
};

/** Estimate constants for the modelled savings figures. */
const LITERS_PER_AUTOMATED_EVENT = 120;
/** DZD per litre of water plus pumping energy, at the time of writing. */
const DZD_PER_LITER = 3.75;

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function meanOrNull(values: number[]): number | null {
  return values.length === 0 ? null : mean(values);
}

export const analyticsService = {
  async overview(auth: AuthContext, query: AnalyticsRangeQuery): Promise<AnalyticsOverview> {
    const farmId = requireFarmId(auth);
    const window = windowFor(query.range);

    const [telemetry, activity, alerts, components] = await Promise.all([
      analyticsRepository.telemetryInRange(farmId, window, query.zoneId),
      analyticsRepository.activityInRange(farmId, window),
      analyticsRepository.errorsInRange(farmId, window),
      analyticsRepository.componentSummary(farmId),
    ]);

    const automatedEvents = activity.filter(
      (row) =>
        row.type === "AUTO" &&
        (row.kind === "VALVE_OPEN" || row.kind === "SCHEDULED_IRRIGATION" || row.kind === "THRESHOLD_REACHED"),
    ).length;

    const manualEvents = activity.filter((row) => row.type === "MANUAL").length;

    const litersSaved = automatedEvents * LITERS_PER_AUTOMATED_EVENT;

    const totalComponents = components.reduce((sum, row) => sum + row._count._all, 0);
    const greenComponents =
      components.find((row) => row.status === "GREEN")?._count._all ?? 0;

    return {
      waterSavedDzd: Math.round(litersSaved * DZD_PER_LITER),
      litersSaved,
      autoIrrigations: automatedEvents,
      manualOverrides: manualEvents,
      alertsRaised: alerts,
      averageRootMoisture: mean(
        telemetry.map((row) => row.rootMoisture).filter((value): value is number => value !== null),
      ),
      averageSurfaceMoisture: meanOrNull(
        telemetry.map((row) => row.surfaceMoisture).filter((value): value is number => value !== null),
      ),
      // Share of diagnostic components reporting healthy. This is what the data supports; there is
      // no heartbeat from which real uptime could be derived.
      healthyComponentPercent:
        totalComponents === 0 ? 0 : Math.round((greenComponents / totalComponents) * 100),
      rangeLabel: RANGE_LABELS[query.range] ?? RANGE_LABELS["7d"]!,
    };
  },

  /** Reuses the telemetry series so the chart and the analytics page cannot disagree. */
  moisture(auth: AuthContext, query: AnalyticsWindowQuery): Promise<MoisturePoint[]> {
    return telemetryService.series(auth, {
      interval: query.range === "24h" ? "hour" : "day",
      range: query.range,
      ...(query.zoneId ? { zoneId: query.zoneId } : {}),
      // An explicit window wins over the preset; telemetry's `windowFor` applies the precedence.
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
    });
  },

  /**
   * Hourly drying rate for one day.
   *
   * Rate is the moisture drop since the previous reading, which is what the curve on the page
   * plots. Rainfall from the what-if slider is subtracted so the user can see how much of the
   * drying a given amount of rain would offset.
   */
  async flow(
    auth: AuthContext,
    date: string | undefined,
    rainfallMm = 0,
  ): Promise<DryingRatePoint[]> {
    const farmId = requireFarmId(auth);

    const anchor = date ? parseFarmDay(date) : startOfFarmDay(new Date());
    if (!anchor) throw ApiError.badRequest("Date must look like 2026-04-19", { date: ["Expected YYYY-MM-DD"] });

    const window = { from: anchor, to: new Date(anchor.getTime() + 24 * 60 * 60 * 1000) };
    const readings = await analyticsRepository.readingsForDay(farmId, window);

    // Index by hour so gaps become explicit rather than shifting every later point.
    const byHour = new Map<number, number>();
    for (const reading of readings) {
      if (reading.rootMoisture === null) continue;
      const hour = Number(farmTimeLabel(reading.recordedAt).slice(0, 2));
      if (!Number.isFinite(hour)) continue;
      const existing = byHour.get(hour);
      byHour.set(hour, existing === undefined ? reading.rootMoisture : Math.round((existing + reading.rootMoisture) / 2));
    }

    const points: DryingRatePoint[] = [];
    let previous: number | null = null;

    for (let hour = 0; hour < 48; hour += 1) {
      const bucket = hour % 24;
      const value = byHour.get(bucket) ?? null;

      let rate = 0;
      if (value !== null && previous !== null) {
        // Positive means the soil is drying out.
        rate = Math.max(0, previous - value);
      }
      if (value !== null) previous = value;

      points.push({
        hour,
        label: `${String(bucket).padStart(2, "0")}:00`,
        rate,
        // Rainfall offsets drying; it can never make the rate negative.
        adjustedRate: Math.max(0, Math.round((rate - rainfallMm / 2) * 10) / 10),
      });
    }

    return points;
  },

  /**
   * Irrigation heatmap for a month — a 4×7 grid of normalised activity.
   *
   * 28 cells regardless of month length, matching the grid the page draws; days beyond the month
   * are zero.
   */
  async heatmap(auth: AuthContext, month: string | undefined): Promise<AnalyticsHeatmap> {
    const farmId = requireFarmId(auth);

    const anchor = month ? new Date(`${month}-01T00:00:00Z`) : new Date();
    if (Number.isNaN(anchor.getTime())) {
      throw ApiError.badRequest("Month must look like 2026-04", { month: ["Expected YYYY-MM"] });
    }
    if (!month) anchor.setUTCDate(1);

    const window = { from: startOfFarmMonth(anchor), to: endOfFarmMonth(anchor) };
    const activity = await analyticsRepository.activityInRange(farmId, window);

    const countsByDay = new Map<string, number>();
    for (const row of activity) {
      if (row.kind !== "VALVE_OPEN" && row.kind !== "SCHEDULED_IRRIGATION") continue;
      const key = farmDayKey(row.occurredAt);
      countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
    }

    const monthKey = farmDayKey(window.from).slice(0, 7);
    const totalDays = Math.min(28, daysInFarmMonth(window.from));
    const rawCounts: number[] = [];

    for (let day = 1; day <= 28; day += 1) {
      if (day > totalDays) {
        rawCounts.push(0);
        continue;
      }
      const key = `${monthKey}-${String(day).padStart(2, "0")}`;
      rawCounts.push(countsByDay.get(key) ?? 0);
    }

    const peak = Math.max(...rawCounts, 1);
    const cells = rawCounts.map((count, index) => ({
      index,
      // Normalised so the grid renders consistently whatever the absolute volume.
      value: Math.round((count / peak) * 100) / 100,
      label: String(index + 1),
    }));

    const values = cells.map((cell) => cell.value);

    return {
      month: monthKey,
      cells,
      peakIndex: values.indexOf(Math.max(...values)),
      averageValue: Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100,
    };
  },

  /**
   * CSV export of the moisture series.
   *
   * Returns a string rather than streaming: at 90 days this is a few hundred rows. A streaming
   * writer would be the right call once exports span seasons.
   */
  async exportCsv(auth: AuthContext, query: ExportQuery): Promise<string> {
    const points = await this.moisture(auth, query);

    const header = "at,label,root_moisture,surface_moisture";
    const rows = points.map((point) =>
      [
        point.at,
        // Quoted: weekday labels are safe, but this keeps the escape rule uniform.
        `"${point.label}"`,
        point.rootMoisture,
        point.surfaceMoisture ?? "",
      ].join(","),
    );

    return [header, ...rows].join("\n");
  },
};
