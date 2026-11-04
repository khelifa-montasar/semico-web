import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  clientRoot,
  describeFindings,
  lineAt,
  readSource,
  sourceFiles,
  styleFiles,
  type Finding,
} from "../helpers/source";

/**
 * A bundle-size audit, run against the source rather than against a build.
 *
 * WHY NOT MEASURE `dist/`: the numbers that matter are already measured — `npm run build` runs in CI
 * on every push and prints every chunk. What a build cannot tell you is WHY a chunk is the size it
 * is, or stop the next commit from doubling it. That is what this file does: it asserts the
 * structural properties that keep the entry chunk small, and it fails at the moment one is broken
 * rather than at the next release when someone reads the build log.
 *
 * The budget checks that CAN be measured without building are measured for real — the static assets
 * are read off disk in bytes, and the dependency list is read from package.json.
 *
 * THE BASELINE, for reference (`vite build`, this commit):
 *
 *   index.js          350.6 kB raw   112.9 kB gzip   ← the shell: React, react-router, TanStack Query
 *   DemoPlot.js       182.2 kB raw    54.5 kB gzip   ← the plot route, leaflet included, correctly split
 *   Settings.js        40.5 kB raw     9.3 kB gzip
 *   everything else    < 13 kB raw each
 *
 * The split is doing its job: a visitor reading the blog downloads 113 kB of gzip, not 167 kB, and
 * never touches leaflet.
 */

const MAX_ASSET_BYTES = 64 * 1024;

/** Files that make up the initial load: nothing here may pull in a page or a leaflet. */
const ENTRY_PATH = [
  "src/main.tsx",
  "src/app/App.tsx",
  "src/app/components/PublicLayout.tsx",
  "src/app/components/DashboardLayout.tsx",
  "src/app/components/AdminLayout.tsx",
  "src/features/auth/RequireAuth.tsx",
  "src/features/auth/RequireSuperAdmin.tsx",
  "src/features/auth/RequireDiagnosticsRoute.tsx",
];

/** Rendered once and shared by every route, so a static import here costs every visitor. */
const SHELL_COMPONENTS = new Set([
  "PublicLayout",
  "DashboardLayout",
  "AdminLayout",
  "RequireAuth",
  "RequireSuperAdmin",
  "RequireDiagnosticsRoute",
]);

const routes = readSource("src/app/routes.tsx");

/** `const Home = lazy(() => import("…"))` → identifier to module path. */
function lazyBindings(): Map<string, string> {
  const bindings = new Map<string, string>();

  for (const match of routes.text.matchAll(/const\s+(\w+)\s*=\s*lazy\(\s*\(\)\s*=>\s*import\("([^"]+)"\)/g)) {
    bindings.set(match[1] ?? "", match[2] ?? "");
  }

  return bindings;
}

function registeredPages(): string[] {
  return [...routes.text.matchAll(/Component:\s*(\w+)/g)].map((match) => match[1] ?? "");
}

/** A route page that is statically imported somewhere, which defeats code splitting. */
function staticallyImportedPage(): Finding[] {
  const findings: Finding[] = [];

  for (const file of sourceFiles()) {
    for (const match of file.text.matchAll(/from\s+["'][^"']*components\/pages\/[^"']*["']/g)) {
      findings.push({
        file: file.path,
        line: lineAt(file, match.index ?? 0),
        detail: "statically imports a page, which pulls it into whichever chunk imports this file",
      });
    }
  }

  return findings;
}

/** A library heavy enough that an accidental static import would be visible in the entry chunk. */
function heavyLibraryOutsideLazyRoute(): Finding[] {
  const findings: Finding[] = [];

  // The components that legitimately draw a map: everything in features/map, plus the diagnostics
  // plot. All are reachable only from lazily-loaded pages, which is the property that matters —
  // asserted separately below.
  const MAP_OWNER_PATHS = ["src/features/map/"];
  const MAP_OWNER_FILES = ["src/features/demoPlot/components/PlotMap.tsx"];

  for (const file of sourceFiles()) {
    if (!/(leaflet)/.test(file.text)) continue;

    const allowed =
      MAP_OWNER_FILES.includes(file.path) || MAP_OWNER_PATHS.some((prefix) => file.path.startsWith(prefix));
    if (allowed) continue;

    findings.push({
      file: file.path,
      line: lineAt(file, file.text.indexOf("leaflet")),
      detail: "imports leaflet outside the map components, which would add ~150 kB to the first load",
    });
  }

  return findings;
}

/** An import of a whole module namespace, which defeats tree shaking for that module. */
function namespaceImport(): Finding[] {
  const findings: Finding[] = [];

  for (const file of sourceFiles()) {
    for (const match of file.text.matchAll(/^import\s+\*\s+as\s+\w+\s+from\s+["']([^"']+)["']/gm)) {
      findings.push({
        file: file.path,
        line: lineAt(file, match.index ?? 0),
        detail: `namespace import of "${match[1]}" keeps the whole module in the bundle`,
      });
    }
  }

  return findings;
}

/** A static asset large enough to matter on the critical path. */
function oversizedAsset(): Finding[] {
  const assetsDir = path.join(clientRoot, "src/assets");
  const findings: Finding[] = [];

  for (const entry of readdirSync(assetsDir)) {
    const full = path.join(assetsDir, entry);
    if (!statSync(full).isFile()) continue;

    const bytes = statSync(full).size;
    if (bytes <= MAX_ASSET_BYTES) continue;

    findings.push({
      file: `src/assets/${entry}`,
      line: 1,
      detail: `${(bytes / 1024).toFixed(1)} kB, over the ${MAX_ASSET_BYTES / 1024} kB budget`,
    });
  }

  return findings;
}

/** A declared runtime dependency nothing imports: install weight and supply-chain surface for nothing. */
function unusedDependency(): Finding[] {
  const manifest = JSON.parse(readSource("package.json").text) as { dependencies?: Record<string, string> };

  // Stylesheets count. A dependency can be pulled in only for its CSS — `@import "pkg/dist/x.css"` —
  // and a check that read only TypeScript would call that unused and delete a package the app needs.
  const haystack = [...sourceFiles(), ...styleFiles()].map((file) => file.text).join("\n");
  const findings: Finding[] = [];

  for (const name of Object.keys(manifest.dependencies ?? {})) {
    const escaped = name.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&");
    // Covers `from "pkg"`, `from "pkg/sub"`, `import "pkg/sub.css"` and `@import "pkg/sub.css"`.
    const referenced = new RegExp(`(from\\s+|import\\s*\\(?\\s*|@import\\s+)["']${escaped}(/[^"']*)?["']`).test(haystack);
    if (referenced) continue;

    findings.push({ file: "package.json", line: 1, detail: `${name} is declared but never imported` });
  }

  // Deliberately NOT checked: devDependencies. Most of them exist for their binaries and config
  // entry points (vite, typescript, tailwindcss) rather than for an import, so an import-based check
  // would report nearly all of them. That is a different question from the one this audit asks.
  return findings;
}

/**
 * Every weight check this audit knows how to make.
 *
 * Kept separate from the register below, and run UNCONDITIONALLY: if the checks lived in the
 * register, then emptying the register — which is what fixing everything does — would stop the
 * checks running, and the audit would report success by examining nothing.
 */
const WEIGHT_CHECKS: Record<string, () => Finding[]> = {
  "oversized-asset": oversizedAsset,
  "unused-dependency": unusedDependency,
  "statically-imported-page": staticallyImportedPage,
  "heavy-library-outside-lazy-route": heavyLibraryOutsideLazyRoute,
  "namespace-import": namespaceImport,
};

interface RegisteredIssue {
  severity: "moderate" | "minor";
  issue: string;
  fix: string;
  /** The exact findings expected, so a second instance cannot hide behind the first. */
  expected: string[];
}

/**
 * Weight problems present in the code and knowingly tolerated.
 *
 * CURRENTLY EMPTY: both that this audit found have been repaired — the logo is now a 5.8 kB PNG
 * sized for its display, and the two unused dependencies are gone.
 *
 * The mechanism stays because it is what makes a REGRESSION legible: a new problem fails the build
 * with the offending file named, and the fix is either to repair it or to register it with a reason.
 */
const REGISTERED_ISSUES: Record<string, RegisteredIssue> = {};

describe("every page is split out of the entry chunk", () => {
  it("binds every routed page to a dynamic import", () => {
    const bindings = lazyBindings();
    const pages = registeredPages();

    expect(pages.length, "the router registers no components, so this check proves nothing").toBeGreaterThan(10);

    const staticallyBundled = pages.filter((name) => !SHELL_COMPONENTS.has(name) && !bindings.has(name));

    expect(
      staticallyBundled,
      "These components are used by the router but are not loaded through lazy(), so they are bundled into the entry chunk.",
    ).toEqual([]);
  });

  it("lazy-loads each page from a module under components/pages", () => {
    const bindings = lazyBindings();

    expect(bindings.size).toBeGreaterThanOrEqual(12);
    for (const [identifier, modulePath] of bindings) {
      expect(modulePath, `${identifier} is lazily loaded from outside the pages directory`).toMatch(
        /^\.\/components\/pages\//,
      );
    }
  });

  it("gives each routed page its own binding", () => {
    // Two routes sharing one binding would be fine; a binding nothing routes to is dead weight that
    // still gets built.
    const bindings = new Set(lazyBindings().keys());
    for (const page of registeredPages()) {
      if (SHELL_COMPONENTS.has(page)) continue;
      expect(bindings.has(page), `the router uses ${page}, which no lazy() binding defines`).toBe(true);
    }
  });

  it("never statically imports a page", () => {
    expect(describeFindings(staticallyImportedPage())).toEqual([]);
  });

  it("imports only the shell from the entry point", () => {
    for (const entry of ENTRY_PATH) {
      const file = readSource(entry);
      expect(file.text, `${entry} pulls in a page`).not.toMatch(/from\s+["'][^"']*components\/pages\//);
      expect(file.text, `${entry} pulls in leaflet`).not.toMatch(/from\s+["'](react-)?leaflet["']/);
    }
  });

  it("wraps the split routes in a Suspense boundary inside each layout", () => {
    // Both layouts, and not the router: a boundary around the router would blank the navbar and the
    // sidebar on every slow navigation instead of swapping just the content area.
    for (const layout of ["src/app/components/PublicLayout.tsx", "src/app/components/DashboardLayout.tsx"]) {
      const file = readSource(layout);
      expect(file.text, `${layout} has no Suspense boundary`).toMatch(/<Suspense\b/);
    }

    expect(routes.text, "the router itself should not own the boundary").not.toMatch(/<Suspense\b/);
  });
});

describe("nothing heavy can reach the first paint", () => {
  it("keeps leaflet inside the lazily-loaded plot route", () => {
    // leaflet and react-leaflet are by far the heaviest dependencies. They are only acceptable
    // because the single route that needs them is itself behind a dynamic import.
    expect(describeFindings(heavyLibraryOutsideLazyRoute())).toEqual([]);
  });

  it("does not import the retired simulator plot map", () => {
    const importers = sourceFiles()
      .filter((file) => /from\s+["'][^"']*demoPlot\/components\/PlotMap["']/.test(file.text))
      .map((file) => file.path);

    expect(importers).toEqual([]);
  });

  it("keeps the shared farm map behind its lazy routes", () => {
    const importers = sourceFiles()
      .filter((file) => /from\s+["'][^"']*features\/map\/FarmMap["']/.test(file.text))
      .map((file) => file.path)
      .sort();

    expect(importers).toEqual([
      "src/app/components/pages/Dashboard.tsx",
      "src/app/components/pages/TechnicalDiagnostics.tsx",
    ]);
    for (const page of ["Dashboard", "TechnicalDiagnostics"]) {
      expect(lazyBindings().get(page)).toBe(`./components/pages/${page}`);
    }
  });

  it("keeps simulation state and controls out of Technical Diagnostics", () => {
    const diagnostics = readSource("src/app/components/pages/TechnicalDiagnostics.tsx").text;

    expect(diagnostics).toMatch(/useZones/);
    expect(diagnostics).toMatch(/useSensors/);
    expect(diagnostics).toMatch(/useLatestTelemetry/);
    expect(diagnostics).toMatch(/features\/map\/FarmMap/);
    expect(diagnostics).not.toMatch(/features\/demoPlot\/(?:useSimulation|components\/SimulationBanner|engine)/);
    expect(diagnostics).not.toMatch(/SimulationBanner|useSimulation|createInitialState/);
  });

  it("uses no namespace imports", () => {
    expect(describeFindings(namespaceImport())).toEqual([]);
  });

  it("imports lucide icons by name so unused ones are dropped", () => {
    // The codebase draws every icon from lucide-react. A single `import * as Icons` would put the
    // entire icon set in the bundle; named imports keep only what is referenced.
    const iconFiles = sourceFiles().filter((file) => /from\s+["']lucide-react["']/.test(file.text));
    expect(iconFiles.length).toBeGreaterThan(5);

    for (const file of iconFiles) {
      for (const match of file.text.matchAll(/from\s+["']lucide-react["']/g)) {
        const statement = file.text.slice(Math.max(0, file.text.lastIndexOf("import", match.index)), match.index);
        expect(statement, `${file.path} does not use a named import`).toMatch(/\{[\s\S]*\}\s*$/);
      }
    }
  });
});

describe("measured weight", () => {
  it("has no weight problem that is unaccounted for", () => {
    // Reported per FINDING rather than per check, so the failure names every offending file instead
    // of collapsing them to one label.
    const unregistered = Object.entries(WEIGHT_CHECKS)
      .filter(([id]) => !(id in REGISTERED_ISSUES))
      .flatMap(([id, detect]) => describeFindings(detect()).map((finding) => `${id}: ${finding}`))
      .sort();

    const registeredButSilent = Object.keys(REGISTERED_ISSUES)
      .filter((id) => (WEIGHT_CHECKS[id]?.() ?? []).length === 0)
      .sort();

    expect({
      unregistered,
      registeredButSilent,
      hint: "Fix each problem, or register it in REGISTERED_ISSUES with a reason for tolerating it.",
    }).toEqual({ unregistered: [], registeredButSilent: [], hint: expect.any(String) });
  });

  it("matches each registered problem finding for finding", () => {
    for (const [id, issue] of Object.entries(REGISTERED_ISSUES)) {
      expect(
        describeFindings(WEIGHT_CHECKS[id]?.() ?? []).sort(),
        `${id} no longer matches its registration`,
      ).toEqual([...issue.expected].sort());
    }
  });

  it("documents what to change for each registered problem", () => {
    for (const [id, issue] of Object.entries(REGISTERED_ISSUES)) {
      expect(issue.issue.length, `${id} has no description`).toBeGreaterThan(80);
      expect(issue.fix.length, `${id} has no suggested fix`).toBeGreaterThan(40);
    }
  });

  it("holds every static asset to a budget", () => {
    // Enforced on ALL assets, so a new one is measured the moment it is added. The register can
    // excuse a specific file; it cannot lower the bar for the others.
    const assetsDir = path.join(clientRoot, "src/assets");
    const oversized = readdirSync(assetsDir)
      .filter((entry) => statSync(path.join(assetsDir, entry)).isFile())
      .filter((entry) => statSync(path.join(assetsDir, entry)).size > MAX_ASSET_BYTES)
      .sort();

    expect(oversized).toEqual([]);
  });

  it("ships a logo sized for where it is displayed", () => {
    // The regression guard for the specific fix. SemicoLogo's largest use is 36px tall, and a source
    // under 4x that keeps it sharp on any current display without paying for pixels nobody sees.
    const logo = path.join(clientRoot, "src/assets/semico1.png");
    const bytes = statSync(logo).size;

    expect(bytes, "the logo has grown back toward its original 135 kB").toBeLessThan(24 * 1024);
  });
});

describe("the audit is reading a real application", () => {
  it("finds the modules it makes claims about", () => {
    expect(routes.text).toMatch(/createBrowserRouter/);
    expect(sourceFiles().length).toBeGreaterThanOrEqual(70);
    expect(lazyBindings().size).toBeGreaterThanOrEqual(12);
  });
});
