/**
 * Semico design tokens — the single source of truth for colour.
 *
 * Light mode is the original Semico palette; dark mode follows the GitHub Dark aesthetic
 * (github.com/primer/primitives).
 *
 * WHY THIS FILE EXISTS: seven pages used to each declare their own inline palette object, so the
 * same colour was written out seven times and a change to the brand green meant seven edits. Read
 * these through `useTokens()` instead of building a local object.
 *
 * `Tokens` is deliberately a single interface rather than a union of the two palettes. That way
 * both palettes must define every key, so referencing a colour that only exists in one mode is a
 * compile error here — instead of an `undefined` that renders as a transparent element at runtime.
 */

export interface Tokens {
  // Surfaces
  bg: string;
  card: string;
  border: string;
  text: string;
  sec: string;
  /** Alias kept because DashboardLayout reads `textSec`; same value as `sec`. */
  textSec: string;

  // Chart furniture
  track: string;
  gridLine: string;
  divider: string;

  // Semantic colour
  green: string;
  greenPress: string;
  warn: string;
  crit: string;
  blue: string;

  // Component-specific surfaces
  adviceBg: string;
  adviceText: string;
  tooltipBg: string;
  fabBg: string;
  fabBorder: string;
  dropletBg: string;
  checkBg: string;

  // App chrome — sidebar, header, content
  layoutBg: string;
  sidebarBg: string;
  headerBg: string;
  contentBg: string;
  hoverBg: string;
  activeBg: string;
  activeText: string;
  avatarBg: string;
  chatBg: string;
  chatBorder: string;

  // Tables and inputs
  thead: string;
  inputBg: string;
  dotBg: string;
}

// ─── GitHub Dark ─────────────────────────────────────────────────────────────
export const GH: Tokens = {
  bg: "#0D1117",
  card: "#161B22",
  border: "#30363D",
  text: "#FFFFFF",
  sec: "#C9D1D9",
  textSec: "#C9D1D9",

  track: "#30363D",
  gridLine: "#30363D",
  divider: "#30363D",

  green: "#3FB950",
  greenPress: "#2EA043",
  warn: "#D29922",
  crit: "#F85149",
  blue: "#58A6FF",

  adviceBg: "rgba(63,185,80,0.10)",
  adviceText: "#C9D1D9",
  tooltipBg: "rgba(22,27,34,0.96)",
  fabBg: "#161B22",
  fabBorder: "#30363D",
  dropletBg: "rgba(88,166,255,0.10)",
  checkBg: "rgba(63,185,80,0.10)",

  layoutBg: "#0D1117",
  sidebarBg: "#161B22",
  headerBg: "#161B22",
  contentBg: "#0D1117",
  hoverBg: "rgba(255,255,255,0.04)",
  activeBg: "rgba(63,185,80,0.12)",
  activeText: "#FFFFFF",
  avatarBg: "#3FB950",
  chatBg: "#161B22",
  chatBorder: "#30363D",

  thead: "#0D1117",
  inputBg: "#0D1117",
  dotBg: "transparent",
};

// ─── Semico Light ────────────────────────────────────────────────────────────
export const LT: Tokens = {
  bg: "#FAFAFA",
  card: "#FFFFFF",
  border: "#EAECF0",
  text: "#1A1A1A",
  sec: "#9CA3AF",
  textSec: "#6B7280",

  track: "#EAECF0",
  gridLine: "#EAECF0",
  divider: "#EAECF0",

  green: "#00A859",
  greenPress: "#008F47",
  warn: "#FF6B35",
  crit: "#FF6B35",
  blue: "#0077B6",

  adviceBg: "rgba(0,168,89,0.07)",
  adviceText: "#166534",
  tooltipBg: "rgba(255,255,255,0.96)",
  fabBg: "#FFFFFF",
  fabBorder: "#EAECF0",
  dropletBg: "rgba(0,119,182,0.08)",
  checkBg: "rgba(0,168,89,0.08)",

  layoutBg: "#FAFAFA",
  sidebarBg: "#FFFFFF",
  headerBg: "#FFFFFF",
  contentBg: "#FAFAFA",
  hoverBg: "#F9FAFB",
  activeBg: "#F0FDF4",
  activeText: "#00A859",
  avatarBg: "#00A859",
  chatBg: "#FFFFFF",
  chatBorder: "#EAECF0",

  thead: "#FAFAFA",
  inputBg: "#FFFFFF",
  dotBg: "transparent",
};

/** Returns the active palette. Prefer `useTokens()` in components — this is for non-React code. */
export function tok(isDark: boolean): Tokens {
  return isDark ? GH : LT;
}
