import { FARM_TIMEZONE } from "@semico/shared";
import type { Language } from "../app/i18n/translations";

/**
 * Farm-local formatting for the client.
 *
 * Mirrors `server/src/lib/time.ts`. Everything the user sees is expressed in Africa/Algiers
 * (UTC+1, no DST) rather than the viewer's own zone — a farmer in Algiers and a worker checking in
 * from France must see the same timestamp for the same valve opening.
 *
 * Uses `Intl.DateTimeFormat`, which is built into every browser and already knows the IANA rules,
 * so there is no date library to carry.
 */

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: FARM_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const dayFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: FARM_TIMEZONE,
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** `HH:mm:ss` — the timestamp format the activity table uses. */
export function farmTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : timeFormatter.format(date);
}

/** `19 Apr, 06:00` — for anywhere a full moment is needed. */
export function farmDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : dayFormatter.format(date);
}

/**
 * `2026-04` → `April 2026` / `أبريل 2026`.
 *
 * Formatted from the month key the API returns rather than a hardcoded label, so the calendar
 * heading follows the data instead of being pinned to one month.
 */
export function farmMonthLabel(monthKey: string, lang: Language): string {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) return monthKey;

  return new Intl.DateTimeFormat(lang === "ar" ? "ar" : "en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC", // the key is already a farm-local calendar month; don't shift it again
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/**
 * How many blank cells precede the 1st in a Monday-first grid.
 *
 * The Activity calendar's day letters start on Monday, so Sunday belongs at index 6 rather than 0.
 */
export function firstWeekdayOffset(monthKey: string): number {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) return 0;
  const sundayFirst = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return (sundayFirst + 6) % 7;
}

/**
 * The same, for a Sunday-first grid.
 *
 * The booking widget's letters run SUN…SAT, so it needs Sunday at index 0 — the opposite of the
 * Activity calendar. Two grids, two conventions; keeping both here stops the difference from being
 * rediscovered as an off-by-one.
 */
export function firstWeekdayOffsetSunday(monthKey: string): number {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) return 0;
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
}

/**
 * `2026-04-23` → `23 April 2026` / `23 أبريل 2026`.
 *
 * The key is already a farm-local calendar date, so it is formatted as UTC — passing it through the
 * local timezone would shift it a day for anyone west of Algiers.
 */
export function farmDayLabelLong(dateKey: string, lang: Language): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;

  return new Intl.DateTimeFormat(lang === "ar" ? "ar" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** Geo label for a manual override's tooltip, or null when the row carried no fix. */
export function geoLabel(lat: number | null, lng: number | null): string | null {
  if (lat === null || lng === null) return null;
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}°${ns}, ${Math.abs(lng).toFixed(4)}°${ew}`;
}

/**
 * `Sun, 19 Apr 2026` in the active language — the dashboard header's date.
 *
 * Previously this string was hardcoded, so the page claimed it was 19 April 2026 forever.
 */
export function farmDateLabel(date: Date, lang: Language): string {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: FARM_TIMEZONE,
  }).format(date);
}
