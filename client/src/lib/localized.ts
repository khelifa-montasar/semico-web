import type { Localized } from "@semico/shared";
import type { Language } from "../app/i18n/translations";

/**
 * Bilingual content helpers.
 *
 * The API returns every translatable field as a `{ en, ar }` pair rather than picking a language
 * server-side. That is what lets the language toggle repaint the page instantly without refetching
 * every list — the other language is already in the cache.
 */

/** Picks one language, falling back to the other rather than rendering an empty string. */
export function pickLocalized(value: Localized | null | undefined, lang: Language): string {
  if (!value) return "";
  return value[lang] || value.en;
}

/**
 * Returns a small accessor bound to a language.
 *
 *   const L = useLocalized();
 *   <h2>{L(post.title)}</h2>
 *
 * Saves threading `lang` through every call site.
 */
export function localizedPicker(lang: Language) {
  return (value: Localized | null | undefined) => pickLocalized(value, lang);
}
