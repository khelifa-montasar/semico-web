import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * A source reader for the client's static audits.
 *
 * The client audits inspect the source rather than render it. That is a deliberate trade, not a
 * convenience: the checks they perform are structural facts about the code (`does every image
 * declare alternative text`, `is every page loaded through a dynamic import`) that hold regardless
 * of what any particular render produces — and they hold for components that no test happens to
 * mount, which is most of them.
 *
 * What this CANNOT see is equally worth stating: computed styles, contrast ratios, real focus
 * order, or what a screen reader actually announces. Those need axe-core against a live DOM. This
 * project has neither installed, so the audits here are deliberately limited to claims a static
 * read can support, and say so rather than implying broader coverage.
 */

export const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const srcRoot = path.join(clientRoot, "src");

/** Every file under `src`, recursive. */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

export interface SourceFile {
  /** Path relative to the client root, e.g. `src/app/routes.tsx`. */
  path: string;
  text: string;
  /** Every line, so a finding can be reported with the line that caused it. */
  lines: string[];
}

function toSourceFile(absolute: string): SourceFile {
  const text = readFileSync(absolute, "utf8");
  return { path: path.relative(clientRoot, absolute), text, lines: text.split("\n") };
}

/** All `.ts` and `.tsx` files under `src`. */
export function sourceFiles(): SourceFile[] {
  return walk(srcRoot)
    .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
    .map(toSourceFile)
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** Only the components — what the accessibility audit cares about. */
export function componentFiles(): SourceFile[] {
  return sourceFiles().filter((file) => file.path.endsWith(".tsx"));
}

/**
 * Every stylesheet under `src`.
 *
 * Needed because some facts are only true in CSS: a `prefers-reduced-motion` guard belongs in a
 * media query, not in a component, and a dependency imported by `@import` in a stylesheet is used
 * even though no TypeScript file mentions it. An audit that read only `.ts`/`.tsx` would report both
 * as missing no matter how correctly they were done.
 */
export function styleFiles(): SourceFile[] {
  return walk(srcRoot)
    .filter((file) => file.endsWith(".css"))
    .map(toSourceFile)
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** One file by its path relative to the client root. */
export function readSource(relativePath: string): SourceFile {
  return toSourceFile(path.join(clientRoot, relativePath));
}

/** The 1-based line number of a character offset, for reporting a finding in place. */
export function lineAt(file: SourceFile, index: number): number {
  return file.text.slice(0, index).split("\n").length;
}

export interface Finding {
  file: string;
  line: number;
  detail: string;
}

/** Renders findings as `file:line — detail`, for a readable assertion message. */
export function describeFindings(findings: Finding[]): string[] {
  return findings.map((finding) => `${finding.file}:${finding.line} — ${finding.detail}`);
}
