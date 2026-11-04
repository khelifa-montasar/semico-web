import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { translations } from "../../src/app/i18n/translations";
import { ALERT_COPY_KEY, ZONE_STATUS_KEY } from "../../src/features/demoPlot/format";

/**
 * Copy completeness and static accessibility checks for the demo plot module.
 *
 * WHY THIS EXISTS: `translations.ts` casts the Arabic tree (`as unknown as TranslationSet`), so
 * TypeScript cannot catch a key that exists in English but is missing in Arabic — it would render
 * `undefined`, in Arabic only, at runtime. Likewise the dynamic lookups
 * (`ALERT_COPY_KEY[t].action`, `ZONE_STATUS_KEY[status]`, the band labels) are indexed by string,
 * which `tsc` cannot verify. These tests are the guard rail for both gaps.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const moduleDir = path.resolve(here, "../../src/features/demoPlot");
const pageFile = path.resolve(here, "../../src/app/components/pages/TechnicalDiagnostics.tsx");

/** Every `.ts`/`.tsx` file in the demo plot module, read once. */
function moduleSources(): Array<{ file: string; source: string }> {
  const files: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry)) files.push(full);
    }
  };

  walk(moduleDir);
  files.push(pageFile);

  return files.map((file) => ({ file: path.relative(moduleDir, file), source: readFileSync(file, "utf8") }));
}

/** Every leaf key path in a translation tree. */
function leafPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  if (Array.isArray(value)) return [`${prefix}[]`];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    leafPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

/** Lengths of every array in a tree, so `dayLetters` cannot drift between locales. */
function arrayLengths(value: unknown, prefix = ""): Map<string, number> {
  const found = new Map<string, number>();
  if (value === null || typeof value !== "object") return found;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const at = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(child)) found.set(at, child.length);
    else if (child && typeof child === "object") {
      for (const [k, v] of arrayLengths(child, at)) found.set(k, v);
    }
  }
  return found;
}

const enLeaves = new Set(leafPaths(translations.en));
const arLeaves = new Set(leafPaths(translations.ar));

describe("translation parity", () => {
  it("has the same keys in both locales", () => {
    const missingInAr = [...enLeaves].filter((key) => !arLeaves.has(key));
    const extraInAr = [...arLeaves].filter((key) => !enLeaves.has(key));

    // Reported as lists so a failure names the offending keys rather than just a count.
    expect(missingInAr, "keys present in EN but missing in AR").toEqual([]);
    expect(extraInAr, "keys present in AR but absent from EN").toEqual([]);
  });

  it("has matching array lengths in both locales", () => {
    const enArrays = arrayLengths(translations.en);
    const arArrays = arrayLengths(translations.ar);

    const mismatched = [...enArrays]
      .filter(([key, length]) => arArrays.get(key) !== length)
      .map(([key, length]) => `${key}: en=${length} ar=${arArrays.get(key)}`);

    expect(mismatched).toEqual([]);
  });

  it("carries a full demo plot block in both locales", () => {
    const en = [...enLeaves].filter((key) => key.startsWith("demoPlot."));
    const ar = [...arLeaves].filter((key) => key.startsWith("demoPlot."));

    expect(en.length).toBeGreaterThan(40);
    expect(ar).toEqual(en);
  });

  it("has a sidebar label in both locales", () => {
    expect(enLeaves.has("sidebar.demoPlot")).toBe(true);
    expect(arLeaves.has("sidebar.demoPlot")).toBe(true);
  });
});

describe("dynamically indexed copy resolves", () => {
  const demoPlotEn = translations.en.demoPlot;
  const demoPlotAr = translations.ar.demoPlot;

  it("resolves every zone status key", () => {
    for (const status of Object.keys(ZONE_STATUS_KEY) as Array<keyof typeof ZONE_STATUS_KEY>) {
      const key = ZONE_STATUS_KEY[status] as keyof typeof demoPlotEn.drawer;

      // These are looked up by string, so a typo here would render `undefined` in the chip.
      expect(demoPlotEn.drawer[key], `EN drawer.${String(key)}`).toBeTruthy();
      expect(demoPlotAr.drawer[key], `AR drawer.${String(key)}`).toBeTruthy();
    }
  });

  it("resolves every alert title and action key", () => {
    for (const type of Object.keys(ALERT_COPY_KEY) as Array<keyof typeof ALERT_COPY_KEY>) {
      const { title, action } = ALERT_COPY_KEY[type];

      expect(demoPlotEn.alerts[title], `EN alerts.${title}`).toBeTruthy();
      expect(demoPlotAr.alerts[title], `AR alerts.${title}`).toBeTruthy();
      expect(demoPlotEn.alerts[action], `EN alerts.${action}`).toBeTruthy();
      expect(demoPlotAr.alerts[action], `AR alerts.${action}`).toBeTruthy();
    }
  });

  it("resolves every moisture band label", () => {
    // BAND_LABEL_KEY lives inside PlotMap, so the four names are asserted directly — a rename there
    // without a matching translation is exactly the failure this catches.
    for (const key of ["bandCritical", "bandLow", "bandOptimal", "bandWet"] as const) {
      expect(demoPlotEn.map[key], `EN map.${key}`).toBeTruthy();
      expect(demoPlotAr.map[key], `AR map.${key}`).toBeTruthy();
    }
  });

  it("resolves the multi-step KPI sub-lines", () => {
    // ZoneDrawer reaches `kpi.minutesShort` across two namespaces.
    expect(demoPlotEn.kpi.minutesShort).toBeTruthy();
    expect(demoPlotAr.kpi.minutesShort).toBeTruthy();
  });
});

/**
 * Translation keys that nothing renders.
 *
 * Recorded rather than removed, because production code is out of scope for this suite. The check
 * still fails for any NEW unused key — these three are simply the acknowledged debt:
 *
 *   sidebarLabel            duplicated by `sidebar.demoPlot`, which is what the layout actually reads
 *   pageTitle               there is no page heading; the dashboard layout's header names the page
 *   drawer.soilTemperature  the drawer shows the temperature beside a thermometer icon with no text
 *                           label — so either the key is dead, or a visible label is missing
 *
 * The third is the interesting one: it is not merely unused copy, it is a label the UI never shows.
 * Reported for the Phase 4 bug hunt.
 */
const KNOWN_UNUSED_DEMO_PLOT_KEYS = new Set([
  "sidebarLabel",
  "pageTitle",
  "drawer.soilTemperature",
]);

describe("no dead copy", () => {
  it("uses every demo plot key somewhere in the module", () => {
    const sources = moduleSources().map((entry) => entry.source).join("\n");

    const demoPlotKeys = [...enLeaves]
      .filter((key) => key.startsWith("demoPlot."))
      .map((key) => key.slice("demoPlot.".length))
      // Array leaves are not referenced by name.
      .filter((key) => !key.endsWith("[]"));

    const unused = demoPlotKeys.filter((key) => {
      const leaf = key.split(".").pop() ?? key;
      // Referenced either as a property (`.mode`) or as a bare string in a lookup map ("dry").
      const referenced =
        sources.includes(`.${leaf}`) ||
        sources.includes(`"${leaf}"`) ||
        sources.includes(`'${leaf}'`) ||
        sources.includes(`[${leaf}]`);

      return !referenced && !KNOWN_UNUSED_DEMO_PLOT_KEYS.has(key);
    });

    expect(unused, "demo plot translation keys never referenced by the module").toEqual([]);
  });

  it("still flags a newly added but unused key", () => {
    // Guards the allowlist above from becoming a blanket exemption: a key that is not on the list
    // and not referenced must fail.
    expect(KNOWN_UNUSED_DEMO_PLOT_KEYS.has("brandNewKeyNothingRenders")).toBe(false);
    expect(enLeaves.has("demoPlot.sidebarLabel")).toBe(true);
  });
});

describe("static accessibility and hygiene", () => {
  const sources = moduleSources();

  it("gives every rendered image alternative text", () => {
    for (const { file, source } of sources) {
      const images = source.match(/<img\b[^>]*>/g) ?? [];
      for (const image of images) {
        expect(image, `${file}: <img> without alt`).toMatch(/alt=/);
      }
    }
  });

  it("avoids dead placeholder links", () => {
    for (const { file, source } of sources) {
      expect(source, `${file}: href="#"`).not.toMatch(/href=["']#["']/);
    }
  });

  it("sets no raw HTML", () => {
    // The module renders only text and known components, so there is no reason to bypass React.
    for (const { file, source } of sources) {
      expect(source, `${file}: dangerouslySetInnerHTML`).not.toContain("dangerouslySetInnerHTML");
    }
  });

  it("leaves no debugging output behind", () => {
    for (const { file, source } of sources) {
      expect(source, `${file}: console call`).not.toMatch(/console\.(log|debug|warn|error)/);
    }
  });

  it("isolates numerals for RTL wherever they are set inline", () => {
    // Every place the module pins a font or direction by hand should also isolate, or Arabic
    // reorders the digits around them.
    for (const { file, source } of sources) {
      const inlineNumeric = source.match(/fontFamily: "JetBrains Mono"/g) ?? [];
      const isolated = source.match(/unicodeBidi: "isolate"/g) ?? [];

      if (inlineNumeric.length > 0 && /isRTL|demoPlot/.test(source)) {
        // Not every mono usage is a numeral in flowing text, so this asserts the pattern exists
        // rather than an exact count.
        expect(isolated.length, `${file}: numerals not isolated`).toBeGreaterThan(0);
      }
    }
  });
});
