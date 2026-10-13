import { FARM_TIMEZONE } from "@semico/shared";

/**
 * Farm-local time.
 *
 * Everything the user sees is bucketed in Africa/Algiers (UTC+1, no DST), not the server's local
 * zone. Getting this wrong shifts the whole daily chart by an hour or more, so the conversion
 * lives in one place rather than being re-derived at each call site.
 *
 * Implementation note: rather than pulling in a date library for one timezone, we use
 * `Intl.DateTimeFormat`, which is built into Node and already knows the IANA rules.
 */

const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: FARM_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dayLabelFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: FARM_TIMEZONE,
  weekday: "short",
});

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: FARM_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** `YYYY-MM-DD` in farm-local time. `en-CA` is used because it formats as ISO by default. */
export function farmDayKey(date: Date): string {
  return dayKeyFormatter.format(date);
}

/** Short weekday label, e.g. "Mon" — what the 7-day chart puts on the axis. */
export function farmDayLabel(date: Date): string {
  return dayLabelFormatter.format(date);
}

/** `HH:mm` in farm-local time. */
export function farmTimeLabel(date: Date): string {
  return timeFormatter.format(date);
}

/** `YYYY-MM` in farm-local time. */
export function farmMonthKey(date: Date): string {
  return farmDayKey(date).slice(0, 7);
}

/**
 * Start of the farm-local day, returned as a UTC instant.
 *
 * Built by parsing the local date string back through `Date.UTC` and then subtracting the zone
 * offset, so "today" means the same thing to the database and to the user.
 */
export function startOfFarmDay(date: Date): Date {
  const [year, month, day] = farmDayKey(date).split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
}

export function startOfFarmMonth(date: Date): Date {
  const [year, month] = farmMonthKey(date).split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, 1));
}

export function endOfFarmMonth(date: Date): Date {
  const [year, month] = farmMonthKey(date).split("-").map(Number);
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year ?? 1970, month ?? 1, 0, 23, 59, 59, 999));
}

export function daysInFarmMonth(date: Date): number {
  const [year, month] = farmMonthKey(date).split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, month ?? 1, 0)).getUTCDate();
}

/** Parses a `YYYY-MM-DD` string as the start of that day. Returns null when malformed. */
export function parseFarmDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

/** Parses a `YYYY-MM` string as the start of that month. Returns null when malformed. */
export function parseFarmMonth(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, 1));
}

/** Resolves the `range` shorthand used by the analytics and telemetry endpoints. */
export function rangeToDays(range: "24h" | "7d" | "30d" | "90d"): number {
  switch (range) {
    case "24h":
      return 1;
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "90d":
      return 90;
  }
}
