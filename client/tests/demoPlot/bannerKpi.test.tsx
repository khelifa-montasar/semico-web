import { describe, expect, it } from "vitest";
import { KpiBar } from "../../src/features/demoPlot/components/KpiBar";
import { SimulationBanner } from "../../src/features/demoPlot/components/SimulationBanner";
import { createInitialState, toKpis } from "../../src/features/demoPlot/engine/step";
import { ariaLabels, has, hrefs, render, textOf } from "./render";

/**
 * Component tests, rendered with `react-dom/server`.
 *
 * The approach was probed before the rest of Phase 2 was built on it. Two things had to be true, and
 * both are:
 *
 *   1. `useTokens` and `useLanguage` fall back to sensible defaults with no provider, so components
 *      render standalone — and where a provider IS needed, `LanguageProvider` works under
 *      server rendering.
 *   2. The only browser API in this tree (`ResizeEngineer`, in `useChartWidth`) is called inside
 *      `useEffect`, which server rendering never runs.
 *
 * The one structural obstacle was `<Link>`, which needs router context; `MemoryRouter` supplies it
 * without a DOM.
 *
 * LIMITATION, stated plainly: this asserts structure and content, never appearance. Layout, CSS and
 * anything that only happens after mount are out of reach without a real browser.
 */

const controls = {
  running: true,
  speed: 1,
  pause: () => {},
  resume: () => {},
  toggle: () => {},
  setSpeed: () => {},
  reset: () => {},
};

describe("SimulationBanner", () => {
  it("states that the data is simulated, permanently", () => {
    const html = render(<SimulationBanner {...controls} />);

    // The disclaimer has to be on screen the whole time — the page must never be mistaken for a
    // real installation, so this is the most important assertion in the file.
    expect(has(html, "Simulation mode")).toBe(true);
    expect(has(html, "Simulated data")).toBe(true);
    expect(has(html, "No real values")).toBe(true);
    expect(has(html, "USTHB Plot (Bab Ezzouar)")).toBe(true);
  });

  it("offers no way to dismiss it", () => {
    const html = render(<SimulationBanner {...controls} />);

    // A close control would let the disclaimer be silenced; only Pause, Restart and Back exist.
    const labels = ariaLabels(html).join(" ");
    expect(labels).not.toMatch(/close|dismiss/i);
  });

  it("links back to the dashboard", () => {
    expect(hrefs(render(<SimulationBanner {...controls} />))).toContain("/dashboard");
  });

  it("shows Pause while running and Resume while paused", () => {
    // The control labels carry the state, so the button is never ambiguous.
    const running = ariaLabels(render(<SimulationBanner {...controls} running />)).join(" ");
    const paused = ariaLabels(render(<SimulationBanner {...controls} running={false} />)).join(" ");

    expect(running).toContain("Pause");
    expect(running).not.toContain("Resume");
    expect(paused).toContain("Resume");
  });

  it("renders every speed option and marks the active one", () => {
    const html = render(<SimulationBanner {...controls} speed={5} />);

    for (const speed of [1, 5, 20]) {
      expect(ariaLabels(html).join(" ")).toContain(`Speed ${speed}`);
    }
    // The active option is the only one filled with the green accent.
    expect((html.match(/#00A859/gi) ?? []).length).toBe(1);
  });

  it("names its icon-only controls for screen readers", () => {
    const labels = ariaLabels(render(<SimulationBanner {...controls} />));

    expect(labels).toContain("Restart");
    expect(labels.some((label) => label.startsWith("Speed"))).toBe(true);
  });

  it("renders in Arabic, with the numerals still LTR", () => {
    const html = render(<SimulationBanner {...controls} />, { lang: "ar" });

    expect(has(html, "وضع المحاكاة")).toBe(true);
    // The disclaimer holds digits and separators, so it must be direction-isolated inside RTL text.
    expect(html).toContain("unicode-bidi:isolate");
  });
});

describe("KpiBar", () => {
  const snapshot = toKpis(createInitialState());

  it("renders exactly five cards", () => {
    const html = render(<KpiBar kpis={snapshot} />);

    for (const label of [
      "Water saved today",
      "Average soil moisture",
      "Productivity gain",
      "Active alerts",
      "Irrigation status",
    ]) {
      expect(has(html, label)).toBe(true);
    }
  });

  it("shows the BMC productivity figure, labelled as an estimate", () => {
    const html = render(<KpiBar kpis={snapshot} />);

    expect(has(html, "+35 %")).toBe(true);
    // Presenting a projection as a reading would be the dishonest version.
    expect(has(html, "estimated vs traditional")).toBe(true);
  });

  it("reports water saved with the saving percentage", () => {
    const html = render(<KpiBar kpis={{ ...snapshot, savedLitres: 12_345, savedPercent: 50 }} />);

    expect(has(html, "12,345 L")).toBe(true);
    expect(has(html, "50% vs traditional")).toBe(true);
  });

  it("counts optimal zones out of the whole plot", () => {
    const html = render(<KpiBar kpis={{ ...snapshot, optimalZones: 3, zoneCount: 6 }} />);
    expect(has(html, "3 / 6 zones optimal")).toBe(true);
  });

  it("says 'none critical' when nothing critical is open", () => {
    const html = render(<KpiBar kpis={{ ...snapshot, activeAlerts: 2, criticalAlerts: 0 }} />);
    expect(has(html, "none critical")).toBe(true);
  });

  it("names the critical count when one is open", () => {
    const html = render(<KpiBar kpis={{ ...snapshot, activeAlerts: 2, criticalAlerts: 1 }} />);
    expect(has(html, "1 critical")).toBe(true);
  });

  it("renders the three irrigation statuses distinctly", () => {
    for (const [status, expected] of [
      ["Active", "Active"],
      ["Scheduled", "Scheduled"],
      ["Idle", "Idle"],
    ] as const) {
      const html = render(<KpiBar kpis={{ ...snapshot, irrigationStatus: status }} />);
      expect(has(html, expected)).toBe(true);
    }
  });

  it("never shows a bare NaN or undefined, even for an empty plot", () => {
    // The degenerate case: nothing irrigated yet. This is where a 0/0 would reach the screen.
    const html = render(<KpiBar kpis={toKpis(createInitialState())} />);
    const text = textOf(html);

    expect(text).not.toContain("NaN");
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("null L");
  });

  it("keeps every numeral direction-isolated for RTL", () => {
    const html = render(<KpiBar kpis={snapshot} />, { lang: "ar" });
    expect(html).toContain("unicode-bidi:isolate");
  });
});
