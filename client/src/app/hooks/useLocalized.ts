import { useLanguage } from "../contexts/LanguageContext";
import { localizedPicker } from "../../lib/localized";

/**
 * Returns a function that resolves a `{ en, ar }` pair to the active language.
 *
 *   const L = useLocalized();
 *   <h2>{L(post.title)}</h2>
 *
 * The pair arrives from the API already carrying both languages, so switching language is a
 * re-render rather than a refetch.
 */
export function useLocalized(): (value: { en: string; ar: string } | null | undefined) => string {
  const { lang } = useLanguage();
  return localizedPicker(lang);
}
