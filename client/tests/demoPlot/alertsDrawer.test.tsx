import { describe, expect, it } from "vitest";
import { ALERT_RULES, IRRIGATION, MOISTURE } from "../../src/features/demoPlot/config";
import { evaluateAlerts } from "../../src/features/demoPlot/engine/alerts";
import { createInitialState } from "../../src/features/demoPlot/engine/step";
import { AlertsPanel } from "../../src/features/demoPlot/components/AlertsPanel";
import { ZoneDrawer } from "../../src/features/demoPlot/components/ZoneDrawer";
import type { Alert, SimulationState, Zone } from "../../src/features/demoPlot/types";
import { ariaLabels, has, render, textOf } from "./render";

/**
 * The alerts panel and the zone drawer, rendered with `react-dom/server`.
 *
 * Fixtures come from the real engine rather than hand-written literals, so a rule change that alters
 * what an alert looks like is reflected here automatically.
 */

/** A settled plot: sensors reporting, given zone conditions applied, alerts evaluated. */
function scenario(minute: number, conditions: Record<string, Partial<Zone>> = {}): SimulationState {
  const base = createInitialState();

  const withFreshSensors: SimulationState = {
    ...base,
    min: minute,
    sensors: base.sensors.map((sensor) => ({ ...sensor, lastReportMinute: minute })),
  };

  const withConditions: SimulationState = {
    ...withFreshSensors,
    zones: withFreshSensors.zones.map((zone) =>
      conditions[zone.id] ? { ...zone, ...conditions[zone.id] } : zone,
    ),
  };

  return { ...withConditions, alerts: evaluateAlerts(withConditions) };
}

const DRY: Partial<Zone> = { consecutiveDry: ALERT_RULES.dryConsecutive, moisture: MOISTURE.redBelow - 1 };
const OVERDUE: Partial<Zone> = { pendingStartMinutes: IRRIGATION.pendingStartGraceMinutes };

const zones = (state: SimulationState) => state.zones.map((z) => ({ id: z.id, label: z.label }));

describe("AlertsPanel", () => {
  it("shows the empty state when nothing is wrong", () => {
    const state = scenario(500);
    const html = render(<AlertsPanel alerts={state.alerts} zones={zones(state)} />);

    expect(has(html, "No alerts. All zones are normal.")).toBe(true);
  });

  it("renders an alert with its title, zone, time and action", () => {
    const state = scenario(60, { Z1: DRY });
    const html = render(<AlertsPanel alerts={state.alerts} zones={zones(state)} />);
    const text = textOf(html);

    expect(text).toContain("Low soil moisture");
    expect(text).toContain("Z1");
    expect(text).toContain("01:00"); // minute 60 on the simulated clock
    // The action line is what makes an alert actionable rather than merely informative.
    expect(text).toContain("Irrigate this zone");
  });

  it("carries the action line for every alert type", () => {
    const cases: Array<[Partial<Zone>, string]> = [
      [DRY, "Irrigate this zone"],
      [{ consecutiveWet: ALERT_RULES.wetConsecutive }, "Check drainage"],
      [OVERDUE, "Check the schedule"],
    ];

    for (const [condition, action] of cases) {
      const state = scenario(100, { Z2: condition });
      expect(textOf(render(<AlertsPanel alerts={state.alerts} zones={zones(state)} />))).toContain(action);
    }
  });

  it("lists a critical alert before a newer warning", () => {
    // Sorted by severity first: an irrigation failure must not be buried under a later cosmetic
    // warning, which is the whole reason the sort exists.
    const warning = scenario(100, { Z1: DRY });
    const critical = scenario(200, { Z5: OVERDUE });

    const merged: Alert[] = [...warning.alerts, ...critical.alerts];
    const state = scenario(200);
    const html = render(<AlertsPanel alerts={merged} zones={zones(state)} />);
    const text = textOf(html);

    expect(text.indexOf("Irrigation did not start")).toBeLessThan(text.indexOf("Low soil moisture"));
  });

  it("excludes resolved alerts from the panel", () => {
    const state = scenario(60, { Z1: DRY });
    const resolved = state.alerts.map((alert) => ({ ...alert, active: false }));

    const html = render(<AlertsPanel alerts={resolved} zones={zones(state)} />);
    expect(has(html, "No alerts. All zones are normal.")).toBe(true);
  });

  it("falls back to the raw id for an unknown zone rather than rendering nothing", () => {
    const state = scenario(60, { Z1: DRY });
    // A zone list that does not include the alert's zone — the row must still be readable.
    const html = render(<AlertsPanel alerts={state.alerts} zones={[]} />);

    expect(textOf(html)).toContain("Z1");
  });
});

describe("ZoneDrawer", () => {
  const state = scenario(300, { Z1: DRY });
  const zone = state.zones[0] as Zone;

  it("renders exactly the five specified blocks", () => {
    const html = render(
      <ZoneDrawer zone={zone} alerts={state.alerts} highlightedSensorId={null} onClose={() => {}} />,
    );
    const text = textOf(html);

    for (const block of [
      "Soil moisture",
      "Last irrigation",
      "Last 24 hours",
      "Alerts for this zone",
    ]) {
      expect(text).toContain(block);
    }
    // The header is the fifth block: zone id plus a status chip.
    expect(text).toContain(zone.label);
    expect(text).toMatch(/Optimal|Low|Critical/);
  });

  it("shows the live moisture and soil temperature", () => {
    const html = render(
      <ZoneDrawer zone={zone} alerts={[]} highlightedSensorId={null} onClose={() => {}} />,
    );

    expect(has(html, `${zone.moisture.toFixed(1)}%`)).toBe(true);
    expect(has(html, `${zone.soilTempC.toFixed(1)} °C`)).toBe(true);
  });

  it("reports a dry zone as Critical", () => {
    const html = render(
      <ZoneDrawer zone={zone} alerts={[]} highlightedSensorId={null} onClose={() => {}} />,
    );
    // This zone is below the dry threshold, so the chip must not say Optimal.
    expect(textOf(html)).toContain("Critical");
  });

  it("names the sensor that was clicked, without adding a sixth block", () => {
    const withOne = render(
      <ZoneDrawer zone={zone} alerts={[]} highlightedSensorId="Z1-S2" onClose={() => {}} />,
    );
    const without = render(
      <ZoneDrawer zone={zone} alerts={[]} highlightedSensorId={null} onClose={() => {}} />,
    );

    expect(textOf(withOne)).toContain("Z1-S2");
    expect(textOf(without)).not.toContain("Z1-S2");
  });

  it("says so when a zone has never been irrigated", () => {
    const fresh = createInitialState().zones[0] as Zone;
    const html = render(
      <ZoneDrawer zone={fresh} alerts={[]} highlightedSensorId={null} onClose={() => {}} />,
    );

    expect(textOf(html)).toContain("Not irrigated yet");
  });

  it("shows the last irrigation time and duration once one has happened", () => {
    const irrigated: Zone = {
      ...zone,
      lastIrrigation: { atMinute: 120, durationMinutes: IRRIGATION.durationMinutes },
    };
    const text = textOf(
      render(<ZoneDrawer zone={irrigated} alerts={[]} highlightedSensorId={null} onClose={() => {}} />),
    );

    expect(text).toContain("02:00");
    expect(text).toContain(String(IRRIGATION.durationMinutes));
  });

  it("lists this zone's alerts and no other zone's", () => {
    const both = scenario(300, { Z1: DRY, Z3: DRY });
    const html = render(
      <ZoneDrawer
        zone={(both.zones.find((z) => z.id === "Z1") as Zone)}
        alerts={both.alerts}
        highlightedSensorId={null}
        onClose={() => {}}
      />,
    );
    const text = textOf(html);

    expect(text).toContain("Low soil moisture");
    // The drawer is zone-scoped, so it must not reach into another zone's history.
    expect(text).not.toContain("No alerts for this zone.");
  });

  it("says so when a zone has no alerts of its own", () => {
    const onlyOtherZone = scenario(300, { Z3: DRY });
    const html = render(
      <ZoneDrawer
        zone={(onlyOtherZone.zones.find((z) => z.id === "Z1") as Zone)}
        alerts={onlyOtherZone.alerts}
        highlightedSensorId={null}
        onClose={() => {}}
      />,
    );

    expect(textOf(html)).toContain("No alerts for this zone.");
  });

  it("names its close control for screen readers", () => {
    const html = render(
      <ZoneDrawer zone={zone} alerts={[]} highlightedSensorId={null} onClose={() => {}} />,
    );
    expect(ariaLabels(html)).toContain("Close");
  });

  it("shows a placeholder rather than a misleading flat line when there is no history", () => {
    // A zone with fewer than two samples has no trend to draw. Drawing a flat line would look like
    // "moisture is stable", which is a different claim from "we have no readings".
    const noHistory: Zone = { ...zone, history: [] };
    const withHistory: Zone = { ...zone, history: [30, 29, 28] };

    const placeholder = textOf(
      render(<ZoneDrawer zone={noHistory} alerts={[]} highlightedSensorId={null} onClose={() => {}} />),
    );
    const charted = textOf(
      render(<ZoneDrawer zone={withHistory} alerts={[]} highlightedSensorId={null} onClose={() => {}} />),
    );

    expect(placeholder).toContain("Last 24 hours");
    expect(placeholder).toContain("—");
    expect(charted).not.toContain("—");

    // NOTE: the chart's own SVG cannot be asserted here. `useChartWidth` returns 0 without a DOM
    // (it measures in an effect), and the sparkline only draws when width > 0 — so under server
    // rendering the chart area is always empty, whatever the history. Asserting the chart itself
    // needs a real browser; see the limitation noted at the top of this file.
  });

  it("uses a logical inset so the drawer mirrors under RTL", () => {
    const html = render(
      <ZoneDrawer zone={zone} alerts={[]} highlightedSensorId={null} onClose={() => {}} />,
    );

    // `insetInlineEnd` rather than `right`, so Arabic puts the drawer on the other edge for free.
    expect(has(html, "inset-inline-end")).toBe(true);
    expect(has(html, "right:0")).toBe(false);
  });
});
