import type { Localized } from "@semico/shared";

/**
 * Bilingual field helpers.
 *
 * Content rows store `*En` / `*Ar` columns (SQLite has no Json scalar, and explicit columns stay
 * queryable). The API always returns BOTH languages as a `Localized` pair, and the client picks
 * with `pickLocalized(item, lang)` — which is what lets the language toggle repaint instantly
 * without refetching every list.
 */

export function loc(en: string | null | undefined, ar: string | null | undefined): Localized {
  // Falling back to the other language beats rendering an empty string in a half-translated row.
  return { en: en ?? ar ?? "", ar: ar ?? en ?? "" };
}

/** Returns null when neither language has content, so the client can hide the field entirely. */
export function locOrNull(
  en: string | null | undefined,
  ar: string | null | undefined,
): Localized | null {
  if (!en && !ar) return null;
  return loc(en, ar);
}

/** Picks one language from a pair — the client-side counterpart, mirrored here for the server. */
export function pick(localized: Localized | null | undefined, lang: keyof Localized): string {
  if (!localized) return "";
  return localized[lang] || localized.en;
}
