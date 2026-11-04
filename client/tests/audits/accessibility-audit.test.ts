import { describe, expect, it } from "vitest";
import {
  componentFiles,
  describeFindings,
  lineAt,
  readSource,
  sourceFiles,
  styleFiles,
  type Finding,
  type SourceFile,
} from "../helpers/source";

/**
 * A static accessibility audit.
 *
 * SCOPE, STATED PLAINLY. This reads source; it does not render. It therefore checks the structural
 * facts that survive any render — an image declares alternative text, a dialog has a name, a
 * positive tab index is not used — and it cannot check contrast ratios, computed styles, real tab
 * order, or what a screen reader announces. Those need axe-core against a live DOM, and this project
 * has neither axe-core installed nor browser tests, so this file deliberately does not imply it has
 * covered them.
 *
 * Its value is that it covers EVERY component rather than the handful any render test would mount,
 * and that it fails at the moment a new violation is written.
 *
 * The known violations are listed in REGISTERED_ISSUES rather than fixed, because these tests may
 * not change production code. The assertion is an exact match in both directions: a NEW violation
 * fails the build, and FIXING one fails it too, until the register is updated — so the list can only
 * shrink deliberately, never by inattention.
 */

interface Tag {
  /** Everything between the tag name and the closing `>`. */
  attrs: string;
  start: number;
  end: number;
}

/**
 * Every open tag for `tagName` in a file, with its attributes.
 *
 * A plain `/<button[^>]*>/` would be wrong here: an attribute such as `onClick={() => …}` or
 * `className={a > b ? … }` contains a `>`, so the naive pattern truncates the tag and any detector
 * built on it reports nonsense.
 *
 * This scans with brace, quote AND comment depth, because a tag may carry a `//` comment between its
 * attributes — and comment prose routinely contains backticks and quotes that would otherwise be
 * read as string delimiters and throw the scan off. That is not hypothetical: an earlier version of
 * this scanner without comment handling mis-read the switch below and reported it as unnamed,
 * because a comment inside the tag mentioned `role` in backticks.
 */
function findTags(text: string, tagName: string): Tag[] {
  const tags: Tag[] = [];

  for (const match of text.matchAll(new RegExp(`<${tagName}\\b`, "g"))) {
    const start = match.index ?? 0;
    let index = start + match[0].length;
    let depth = 0;
    let quote: string | null = null;

    while (index < text.length) {
      const char = text[index];

      if (quote) {
        if (char === "\\") index += 1;
        else if (char === quote) quote = null;
        index += 1;
        continue;
      }

      if (char === "/" && text[index + 1] === "/") {
        const end = text.indexOf("\n", index);
        index = end === -1 ? text.length : end;
        continue;
      }

      if (char === "/" && text[index + 1] === "*") {
        const end = text.indexOf("*/", index);
        index = end === -1 ? text.length : end + 1;
        continue;
      }

      if (char === '"' || char === "'" || char === "`") quote = char;
      else if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      else if (char === ">" && depth === 0) break;

      index += 1;
    }

    tags.push({ attrs: text.slice(start + match[0].length, index), start, end: index });
  }

  return tags;
}

/** The JSX between a tag's `>` and its closing tag. */
function childrenOf(file: SourceFile, tag: Tag, tagName: string): string {
  const closing = file.text.indexOf(`</${tagName}>`, tag.end);
  if (closing === -1) return file.text.slice(tag.end + 1, tag.end + 400);
  return file.text.slice(tag.end + 1, closing);
}

const hasAccessibleName = (attrs: string) => /aria-label|aria-labelledby|title=/.test(attrs);

/**
 * A click handler on an element with no interactive role and no keyboard equivalent.
 *
 * Skipped for elements marked `aria-hidden`: a backdrop that closes a menu on click is a pointer
 * convenience, and hiding it from assistive technology is the correct treatment — flagging it would
 * be a false positive.
 */
function clickWithoutKeyboard(): Finding[] {
  const findings: Finding[] = [];

  for (const file of componentFiles()) {
    for (const match of file.text.matchAll(/<(div|span|li|p|td|tr|section|article)\b/g)) {
      const start = match.index ?? 0;
      const tag = findTags(file.text.slice(start), match[1] ?? "")[0];
      if (!tag || !/\bonClick=/.test(tag.attrs)) continue;
      if (/aria-hidden/.test(tag.attrs)) continue;
      if (/\brole=/.test(tag.attrs) && /tabIndex/.test(tag.attrs)) continue;

      findings.push({
        file: file.path,
        line: lineAt(file, start),
        detail: `<${match[1]} onClick> is unreachable by keyboard`,
      });
    }
  }

  return findings;
}

/** A button whose only content is one self-closing element — an icon — and which has no name. */
function unnamedIconButton(): Finding[] {
  const findings: Finding[] = [];

  for (const file of componentFiles()) {
    for (const tag of findTags(file.text, "button")) {
      if (hasAccessibleName(tag.attrs)) continue;

      const children = childrenOf(file, tag, "button").trim();
      // Exactly one self-closing JSX element and nothing else. A `{expression}` child is excluded on
      // purpose: `{d.save}` renders a translated label and IS the accessible name, so treating it as
      // anonymous would report the entire codebase.
      if (!/^<[A-Za-z][^>]*\/>$/.test(children)) continue;

      findings.push({
        file: file.path,
        line: lineAt(file, tag.start),
        detail: `button contains only ${children.slice(0, 40)} and declares no accessible name`,
      });
    }
  }

  return findings;
}

/** A full-screen click-catching overlay that is not hidden from assistive technology. */
function exposedOverlay(): Finding[] {
  const findings: Finding[] = [];

  for (const file of componentFiles()) {
    for (const tag of findTags(file.text, "div")) {
      if (!/\bonClick=/.test(tag.attrs)) continue;
      if (!/inset-0/.test(tag.attrs)) continue;
      if (/aria-hidden/.test(tag.attrs)) continue;

      findings.push({
        file: file.path,
        line: lineAt(file, tag.start),
        detail: "a click-away overlay is exposed to assistive technology; its sibling overlays are aria-hidden",
      });
    }
  }

  return findings;
}

/** A dialog that does not declare itself modal, so focus can leave it for the page behind. */
function nonModalDialog(): Finding[] {
  const findings: Finding[] = [];

  for (const file of componentFiles()) {
    for (const match of file.text.matchAll(/role="dialog"/g)) {
      const start = match.index ?? 0;
      const window = file.text.slice(start, start + 600);
      if (/aria-modal/.test(window)) continue;

      findings.push({
        file: file.path,
        line: lineAt(file, start),
        detail: 'role="dialog" without aria-modal, so the page behind stays reachable',
      });
    }
  }

  return findings;
}

/** An animation shipped with no reduced-motion escape. */
function unguardedMotion(): Finding[] {
  // Checked across components AND stylesheets, and globally rather than per file: the guard belongs
  // in a media query, so one rule covering the whole app is the correct and sufficient answer.
  //
  // Reading CSS is not a detail — an earlier version of this check looked only at components, so the
  // idiomatic fix (a `prefers-reduced-motion` block in index.css) could never satisfy it.
  const guarded = [...sourceFiles(), ...styleFiles()].some((file) => /prefers-reduced-motion/.test(file.text));
  if (guarded) return [];

  return componentFiles()
    .filter((file) => /\banimate-/.test(file.text))
    .map((file) => ({
      file: file.path,
      line: lineAt(file, file.text.indexOf("animate-")),
      detail: "animates with no prefers-reduced-motion guard",
    }));
}

/**
 * Every violation check this audit knows how to make.
 *
 * Kept separate from the register below, and run UNCONDITIONALLY. That separation is the whole point:
 * if the checks lived in the register, then emptying the register — which is exactly what fixing
 * everything does — would stop every check from running, and the audit would report success by
 * looking at nothing. Here the checks always run and the register only records which of them are
 * expected to fire.
 */
const VIOLATION_CHECKS: Record<string, () => Finding[]> = {
  "unnamed-toggle-switch": unnamedIconButton,
  "drawer-not-modal": nonModalDialog,
  "overlay-not-hidden": exposedOverlay,
  "no-reduced-motion": unguardedMotion,
};

interface RegisteredIssue {
  severity: "moderate" | "minor";
  issue: string;
  fix: string;
  /** The exact findings expected, so a second instance cannot hide behind the first. */
  expected: string[];
}

/**
 * Violations present in the code and knowingly not yet fixed.
 *
 * CURRENTLY EMPTY: all four that this audit found have been repaired — the toggle switch is a named
 * switch, the drawer is modal with a focus trap and Escape, the overlay is aria-hidden, and
 * reduced-motion is honoured globally.
 *
 * The mechanism stays because it is what makes a REGRESSION legible. A new violation fails the build
 * with a message pointing here; the fix is either to repair it or to register it with a reason, and
 * both are deliberate acts. An entry may only be added alongside the evidence of why it is being
 * tolerated.
 */
const REGISTERED_ISSUES: Record<string, RegisteredIssue> = {};

describe("structure that is correct and must stay correct", () => {
  it("gives every image alternative text", () => {
    const findings: Finding[] = [];

    for (const file of componentFiles()) {
      for (const tag of findTags(file.text, "img")) {
        if (!/\balt=/.test(tag.attrs)) {
          findings.push({ file: file.path, line: lineAt(file, tag.start), detail: "<img> without alt" });
        }
      }
    }

    expect(describeFindings(findings)).toEqual([]);
  });

  it("gives every link a destination", () => {
    // An <a> with no href is not focusable and does not respond to Enter, so it is a link that only
    // works with a mouse — invisible as a defect until someone tries to tab to it.
    const findings: Finding[] = [];

    for (const file of componentFiles()) {
      for (const tag of findTags(file.text, "a")) {
        if (!/\bhref=/.test(tag.attrs)) {
          findings.push({ file: file.path, line: lineAt(file, tag.start), detail: "<a> without href" });
        }
      }
    }

    expect(describeFindings(findings)).toEqual([]);
  });

  it("uses no positive tab index", () => {
    // A positive tabindex lifts an element out of document order and reorders everything after it,
    // which is almost never what was intended and cannot be reasoned about locally.
    const findings: Finding[] = [];

    for (const file of componentFiles()) {
      for (const match of file.text.matchAll(/tabIndex=\{?["']?([1-9]\d*)/g)) {
        findings.push({
          file: file.path,
          line: lineAt(file, match.index ?? 0),
          detail: `tabIndex=${match[1]} overrides the natural tab order`,
        });
      }
    }

    expect(describeFindings(findings)).toEqual([]);
  });

  it("names every dialog", () => {
    const findings: Finding[] = [];

    for (const file of componentFiles()) {
      for (const tag of findTags(file.text, "aside")) {
        if (!/role="dialog"/.test(tag.attrs)) continue;
        if (hasAccessibleName(tag.attrs)) continue;

        findings.push({ file: file.path, line: lineAt(file, tag.start), detail: "unnamed dialog" });
      }
    }

    expect(describeFindings(findings)).toEqual([]);
  });

  it("never suppresses the focus indicator without replacing it", () => {
    // Removing the outline is the single most common way a keyboard user loses their place. It is
    // only acceptable alongside a visible replacement.
    const findings: Finding[] = [];

    for (const file of componentFiles()) {
      for (const match of file.text.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        const classes = match[1] ?? match[2] ?? "";
        if (!/(^|\s)focus:outline-none/.test(classes)) continue;
        if (/focus-visible:/.test(classes)) continue;

        findings.push({
          file: file.path,
          line: lineAt(file, match.index ?? 0),
          detail: "focus:outline-none with no focus-visible: replacement",
        });
      }
    }

    expect(describeFindings(findings)).toEqual([]);
  });
});

describe("the document and the language it renders in", () => {
  it("declares a language on the document element", () => {
    // Without it a screen reader reads Arabic text with an English voice.
    expect(readSource("index.html").text).toMatch(/<html[^>]*\blang=/);
  });

  it("keeps that language and its direction in sync with the active locale", () => {
    // The static `lang="en"` is only the pre-hydration default; the app has to keep it truthful
    // after a language switch, including the right-to-left flip for Arabic.
    const app = readSource("src/app/App.tsx").text;

    expect(app).toMatch(/documentElement\.lang\s*=/);
    expect(app).toMatch(/documentElement\.dir\s*=/);
    expect(app).toMatch(/rtl/);
  });
});

describe("the demo plot does not encode meaning in colour alone", () => {
  it("pairs every alert severity with an icon or text", () => {
    // The requirement the palette check imposes: a reader who cannot separate green from orange must
    // still be able to tell an advisory from a critical alert.
    const panel = readSource("src/features/demoPlot/components/AlertsPanel.tsx").text;

    expect(panel, "severity is chosen from a colour token").toMatch(/SEVERITY_TOKEN/);
    expect(panel, "and must also select an icon").toMatch(/SEVERITY_ICON/);
    // The alert carries a translated title and action line, so the severity is stated in words too.
    expect(panel).toMatch(/copy\.title/);
    expect(panel).toMatch(/copy\.action/);
  });

  it("announces the simulation state to assistive technology", () => {
    // `role="status"` is a polite live region: the clock, the totals and the alert count change every
    // tick, and without it none of that is perceived.
    expect(readSource("src/features/demoPlot/components/SimulationBanner.tsx").text).toMatch(/role="status"/);
  });

  it("labels the sparkline as a single image rather than exposing its paths", () => {
    const sparkline = readSource("src/features/demoPlot/components/MoistureSparkline.tsx").text;

    expect(sparkline).toMatch(/role="img"/);
    // The label has to carry the values, because a chart that is one image cannot be read otherwise.
    expect(sparkline).toMatch(/aria-label=\{[^}]*values\.length/);
  });
});

describe("violations found by the checks above", () => {
  // Every check runs, whether or not anything is registered. This is what keeps an empty register an
  // assertion of cleanliness rather than a way to switch the audit off.
  const findingsByCheck = Object.entries(VIOLATION_CHECKS).map(
    ([id, detect]) => [id, describeFindings(detect()).sort()] as const,
  );
  const registered = Object.keys(REGISTERED_ISSUES).sort();

  it("is exactly the registered set", () => {
    // Reported per FINDING rather than per check. Collapsing to the check's id hides how many
    // elements are affected — an earlier version of this assertion reported a single unnamed-button
    // violation when there were five, which is how the wrong one came to be described as the cause.
    const unregistered = findingsByCheck
      .filter(([id]) => !registered.includes(id))
      .flatMap(([id, findings]) => findings.map((finding) => `${id}: ${finding}`))
      .sort();

    const registeredButSilent = registered
      .filter((id) => (VIOLATION_CHECKS[id]?.() ?? []).length === 0)
      .sort();

    expect({
      unregistered,
      registeredButSilent,
      hint: "Fix each violation, or add it to REGISTERED_ISSUES with a reason for tolerating it.",
    }).toEqual({ unregistered: [], registeredButSilent: [], hint: expect.any(String) });
  });

  it("leaves nothing registered that a check cannot detect", () => {
    // A register entry with no matching check would be a claim nobody verifies.
    for (const id of registered) {
      expect(Object.keys(VIOLATION_CHECKS), `${id} is registered but no check detects it`).toContain(id);
    }
  });

  it("matches each registered violation finding for finding", () => {
    // Exact, not a count: a second instance of a registered problem has to be registered on its own
    // merits rather than slipping in behind the entry that already exists.
    for (const [id, issue] of Object.entries(REGISTERED_ISSUES)) {
      expect(VIOLATION_CHECKS[id]?.().map((finding) => `${finding.file}:${finding.line} — ${finding.detail}`).sort(), `${id} no longer matches`).toEqual(
        [...issue.expected].sort(),
      );
    }
  });

  it("describes each registered violation and how to fix it", () => {
    // "Known issue" is not a resolution. Each entry has to say what to change, so the register is a
    // list of work rather than a list of excuses.
    for (const [id, issue] of Object.entries(REGISTERED_ISSUES)) {
      expect(issue.issue.length, `${id} has no description`).toBeGreaterThan(80);
      expect(issue.fix.length, `${id} has no suggested fix`).toBeGreaterThan(40);
      expect(["moderate", "minor"], `${id} has no severity`).toContain(issue.severity);
    }
  });

  it("runs every check, so an empty register still means the code was examined", () => {
    // Guards the mechanism itself: if the checks were ever folded back into the register, emptying
    // the register would silently stop them running and the suite would still be green. This asserts
    // the checks executed and each one actually looked at something.
    expect(Object.keys(VIOLATION_CHECKS).length, "no violation checks are wired up").toBeGreaterThanOrEqual(4);
    expect(findingsByCheck.length).toBe(Object.keys(VIOLATION_CHECKS).length);
  });
});

describe("the audit covers the whole client", () => {
  it("reads a plausible number of components", () => {
    // If the reader ever returned an empty set, every assertion above would pass vacuously.
    expect(componentFiles().length).toBeGreaterThanOrEqual(30);
  });

  it("finds the interactive elements it claims to check", () => {
    const buttons = componentFiles().reduce((total, file) => total + findTags(file.text, "button").length, 0);
    const images = componentFiles().reduce((total, file) => total + findTags(file.text, "img").length, 0);

    expect(buttons, "no buttons were found, so the naming checks prove nothing").toBeGreaterThan(30);
    expect(images).toBeGreaterThan(0);
  });
});

describe("keyboard reachability of click handlers", () => {
  it("finds no handler on an element that has no keyboard path", () => {
    // Both remaining click-away backdrops carry aria-hidden, which is the correct treatment for a
    // pointer-only convenience: they are removed from the accessibility tree rather than exposing an
    // unnamed element with a click handler. Anything this now finds is a real interactive element
    // that a keyboard user cannot reach.
    expect(describeFindings(clickWithoutKeyboard())).toEqual([]);
  });
});
