import { useTheme } from "../contexts/ThemeContext";
import type { Tokens } from "../theme/tokens";

/**
 * The active colour palette.
 *
 * Every page used to build its own `isDark ? {...} : {...}` object, which meant the same hex value
 * appeared seven times and a brand change meant seven edits. Use this instead:
 *
 *   const c = useTokens();
 *   <div style={{ background: c.card, border: `1px solid ${c.border}` }} />
 *
 * Tailwind classes still work for anything that has a `dark:` variant; this is for the inline
 * styles that cannot express one.
 */
export function useTokens(): Tokens {
  return useTheme().tokens;
}
