import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { LanguageProvider } from "../../src/app/contexts/LanguageContext";

/**
 * Render helpers for the component tests.
 *
 * `renderToStaticMarkup` comes from `react-dom`, which is already installed, and server rendering
 * never runs `useEffect` — which is where the only browser APIs in this tree live (`ResizeEngineer`
 * inside `useChartWidth`). So components can be rendered for real with no jsdom and no Testing
 * Library, and the vitest environment stays `node`.
 *
 * What this CANNOT catch, and it is worth being blunt about: layout, CSS, and anything that only
 * happens after mount — event handlers, effects, Leaflet actually drawing tiles. It asserts
 * structure and content, not appearance.
 */

interface RenderOptions {
  /** Render inside the Arabic locale. Defaults to English. */
  lang?: "en" | "ar";
}

/**
 * Renders a component to static HTML inside the providers it needs.
 *
 * `MemoryRouter` supplies the router context without a DOM, which components containing `<Link>`
 * require. `LanguageProvider` is included because a couple of components read copy through it.
 */
export function render(node: ReactNode, options: RenderOptions = {}): string {
  const stubbed = options.lang === "ar";

  if (stubbed) {
    // `LanguageProvider` reads `localStorage` inside a try/catch, so under Node it silently falls
    // back to English and the Arabic branch is never exercised. Stubbing the one method it uses is
    // enough to reach that branch — no DOM, no storage library.
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => "ar",
      setItem: () => {},
      removeItem: () => {},
    };
  }

  try {
    return renderToStaticMarkup(
      <MemoryRouter>
        <LanguageProvider>{node}</LanguageProvider>
      </MemoryRouter>,
    );
  } finally {
    if (stubbed) delete (globalThis as { localStorage?: unknown }).localStorage;
  }
}

/** Strips tags so assertions can be made against visible text rather than markup. */
export function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when `needle` appears anywhere in the rendered markup. */
export function has(html: string, needle: string): boolean {
  return html.includes(needle);
}

/** Every `href` in the markup, for link assertions. */
export function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1] ?? "");
}

/** Every `aria-label` in the markup — used to assert icon-only controls are named. */
export function ariaLabels(html: string): string[] {
  return [...html.matchAll(/aria-label="([^"]*)"/g)].map((match) => match[1] ?? "");
}
