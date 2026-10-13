import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { LT, tok, type Tokens } from "../theme/tokens";

export type ThemePreference = "light" | "dark" | "system";

interface ThemeContextType {
  theme: ThemePreference;
  setTheme: (t: ThemePreference) => void;
  effectiveTheme: "light" | "dark";
  /** The active palette. Read this via `useTokens()` rather than importing it directly. */
  tokens: Tokens;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  setTheme: () => {},
  effectiveTheme: "light",
  tokens: LT,
});

function getSystemDark() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function applyTheme(pref: ThemePreference) {
  const html = document.documentElement;
  const isDark = pref === "dark" || (pref === "system" && getSystemDark());
  html.classList.toggle("dark", isDark);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(() => {
    try {
      return (localStorage.getItem("semico-theme") as ThemePreference) || "light";
    } catch {
      return "light";
    }
  });

  // Derived, not stored: "system" has to re-resolve when the OS preference flips.
  const [systemDark, setSystemDark] = useState(getSystemDark);

  const effectiveTheme: "light" | "dark" =
    theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Only subscribe when the preference actually depends on the OS setting.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      setSystemDark(mq.matches);
      applyTheme("system");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = (t: ThemePreference) => {
    setThemeState(t);
    try {
      localStorage.setItem("semico-theme", t);
    } catch {}
  };

  // Memoised so the palette object identity is stable — it is a dependency of chart effects.
  const tokens = useMemo(() => tok(effectiveTheme === "dark"), [effectiveTheme]);

  const value = useMemo(
    () => ({ theme, setTheme, effectiveTheme, tokens }),
    [theme, effectiveTheme, tokens],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
