import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { FieldHistory } from "@semico/shared";
import type {
  LeafletEvent,
  LeafletKeyboardEvent,
  LeafletMouseEvent,
} from "leaflet";
import { translations } from "../../src/app/i18n/translations";
import { tok } from "../../src/app/theme/tokens";
import { telemetryApi } from "../../src/api/telemetry";
import {
  FieldHistoryContent,
  FieldHistoryDialog,
} from "../../src/features/fieldHistory/FieldHistoryDialog";
import {
  HistoryChart,
  moistureSegments,
} from "../../src/features/fieldHistory/HistoryChart";
import {
  fieldHistoryQueryOptions,
  type FieldHistorySelection,
} from "../../src/features/fieldHistory/useFieldHistory";
import { selectionHandlers } from "../../src/features/map/selectionHandlers";

const mocks = vi.hoisted(() => ({ language: vi.fn(), history: vi.fn() }));
vi.mock("../../src/app/contexts/LanguageContext", () => ({
  useLanguage: mocks.language,
}));
vi.mock("../../src/app/hooks/useTokens", () => ({
  useTokens: () => tok(false),
}));
vi.mock(
  "../../src/features/fieldHistory/useFieldHistory",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../src/features/fieldHistory/useFieldHistory")
    >()),
    useFieldHistory: mocks.history,
  }),
);

const selection: FieldHistorySelection = {
  userId: "owner",
  farmId: "farm-a",
  headerFarmId: null,
  kind: "sensor",
  id: "sensor-a",
  zoneId: "zone-a",
};
const data: FieldHistory = {
  farmId: "farm-a",
  window: { from: "2026-11-04T12:30:00.000Z", to: "2026-11-05T12:30:00.000Z" },
  zone: { id: "zone-a", name: "North field", valveState: "CLOSED" },
  sensor: {
    id: "sensor-a",
    key: "NORTH-1",
    zoneId: "zone-a",
    zoneName: "North field",
    connection: "ONLINE",
    batteryPct: 0,
    lastSeenAt: "2026-11-05T12:00:00.000Z",
  },
  sensors: [],
  telemetryScope: "sensor",
  latestMoisture: { value: 0, recordedAt: "2026-11-05T12:00:00.000Z" },
  lastWatering: {
    commandId: "executed",
    executedAt: "2026-11-05T10:00:00.000Z",
    durationMin: 8,
  },
  points: [
    { at: "2026-11-05T09:00:00.000Z", moisture: 30, samples: 2 },
    { at: "2026-11-05T10:00:00.000Z", moisture: null, samples: 0 },
    { at: "2026-11-05T11:00:00.000Z", moisture: 0, samples: 1 },
  ],
  warnings: [
    {
      id: "warning",
      occurredAt: "2026-11-05T11:00:00.000Z",
      component: "MOISTURE_LOW",
      componentName: { en: "Moisture", ar: "الرطوبة" },
      message: { en: "Saved low-moisture warning", ar: "تحذير رطوبة محفوظ" },
      action: null,
      location: {
        zoneId: "zone-a",
        zoneName: "North field",
        sensorKey: "NORTH-1",
      },
    },
  ],
  warningCount: 1,
};

beforeEach(() => {
  vi.restoreAllMocks();
  mocks.language.mockReturnValue({
    t: translations.en,
    lang: "en",
    isRTL: false,
    font: "sans-serif",
  });
  mocks.history.mockReturnValue({
    data,
    isPending: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  });
});

describe("field history display", () => {
  it("shows actual zero values, confirmed watering, timestamps, and recorded warnings", () => {
    const html = renderToStaticMarkup(
      <FieldHistoryContent data={data} onSelectSensor={vi.fn()} />,
    );
    expect(html).toMatch(/Sensor battery<\/h3><p[^>]*>0%<\/p>/);
    expect(html).toContain("Last confirmed watering");
    expect(html).toContain("8 min");
    expect(html).toContain("Saved low-moisture warning");
    expect(html).toContain("Africa/Algiers");
    expect(html).toContain(
      "A command receipt is not confirmation of watering.",
    );
  });

  it("labels missing data without converting it to zero or claiming irrigation", () => {
    const html = renderToStaticMarkup(
      <FieldHistoryContent
        data={{
          ...data,
          latestMoisture: null,
          lastWatering: null,
          sensor: { ...data.sensor!, batteryPct: null },
          warnings: [],
          warningCount: 0,
        }}
        onSelectSensor={vi.fn()}
      />,
    );
    expect(html).toContain("No confirmed watering recorded.");
    expect(html).toContain("No measurement recorded.");
    expect(html).toContain("No warnings recorded in this period.");
    expect(html).toMatch(/Sensor battery<\/h3><p[^>]*>—<\/p>/);
  });

  it("explicitly labels the legacy zone fallback", () => {
    const html = renderToStaticMarkup(
      <FieldHistoryContent
        data={{ ...data, telemetryScope: "zone" }}
        onSelectSensor={vi.fn()}
      />,
    );
    expect(html).toContain("Latest zone soil moisture");
    expect(html).toContain("not an individual sensor measurement");
  });

  it("renders translated warnings and RTL dialog semantics", () => {
    mocks.language.mockReturnValue({
      t: translations.ar,
      lang: "ar",
      isRTL: true,
      font: "sans-serif",
    });
    const html = renderToStaticMarkup(
      <FieldHistoryDialog
        selection={selection}
        onClose={vi.fn()}
        onSelectSensor={vi.fn()}
      />,
    );
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("aria-labelledby=");
    expect(html).toContain('aria-label="إغلاق"');
    expect(html).toContain("تحذير رطوبة محفوظ");
    expect(html).not.toContain("Saved low-moisture warning");
  });

  it("discloses truncated warning lists", () => {
    const html = renderToStaticMarkup(
      <FieldHistoryContent
        data={{ ...data, warningCount: 103 }}
        onSelectSensor={vi.fn()}
      />,
    );
    expect(html).toContain("Showing the latest 1 of 103 warnings.");
  });

  it("handles loading and errors without showing another selection's data", () => {
    mocks.history.mockReturnValue({
      isPending: true,
      isFetching: true,
      isError: false,
      refetch: vi.fn(),
    });
    expect(
      renderToStaticMarkup(
        <FieldHistoryDialog
          selection={selection}
          onClose={vi.fn()}
          onSelectSensor={vi.fn()}
        />,
      ),
    ).toContain("Loading field history");
    mocks.history.mockReturnValue({
      isPending: false,
      isFetching: false,
      isError: true,
      refetch: vi.fn(),
    });
    expect(
      renderToStaticMarkup(
        <FieldHistoryDialog
          selection={selection}
          onClose={vi.fn()}
          onSelectSensor={vi.fn()}
        />,
      ),
    ).toContain("Unable to load details");
    mocks.history.mockReturnValue({
      data: { ...data, farmId: "other-farm" },
      isPending: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    });
    expect(
      renderToStaticMarkup(
        <FieldHistoryDialog
          selection={selection}
          onClose={vi.fn()}
          onSelectSensor={vi.fn()}
        />,
      ),
    ).not.toContain("Saved low-moisture warning");
  });

  it("keeps gaps separate and treats zero moisture as a real sample", () => {
    expect(moistureSegments(data.points)).toEqual([
      [{ index: 0, value: 30 }],
      [{ index: 2, value: 0 }],
    ]);
    const html = renderToStaticMarkup(
      <HistoryChart
        points={data.points.map((point) => ({
          ...point,
          moisture: null,
          samples: 0,
        }))}
      />,
    );
    expect(html).toContain(
      "No moisture readings recorded in the last 24 hours.",
    );
    expect(html).not.toContain("<svg");
  });
});

describe("history query isolation", () => {
  it("separates users, farms, entity types, and entity IDs in the cache", () => {
    const initial = fieldHistoryQueryOptions(selection).queryKey;
    for (const changed of [
      { userId: "other" },
      { farmId: "other" },
      { kind: "zone" as const },
      { id: "other" },
    ]) {
      expect(
        fieldHistoryQueryOptions({ ...selection, ...changed }).queryKey,
      ).not.toEqual(initial);
    }
    expect(initial.slice(0, 1)).toEqual(["telemetry"]);
  });

  it("pins the request to the selected farm and forwards cancellation", async () => {
    const history = vi.spyOn(telemetryApi, "history").mockResolvedValue(data);
    const controller = new AbortController();
    await fieldHistoryQueryOptions(selection).queryFn({
      signal: controller.signal,
    });
    expect(history).toHaveBeenCalledWith(
      "farm-a",
      "sensor",
      "sensor-a",
      controller.signal,
    );
    expect(fieldHistoryQueryOptions(selection).refetchInterval).toBe(30_000);
  });
});

describe("map selection accessibility", () => {
  it("adds a named keyboard-focusable dialog trigger", () => {
    const setAttribute = vi.fn();
    selectionHandlers("Sensor details", vi.fn()).add?.({
      target: { getElement: () => ({ setAttribute }) },
    } as unknown as LeafletEvent);
    expect(setAttribute).toHaveBeenCalledWith("tabindex", "0");
    expect(setAttribute).toHaveBeenCalledWith("aria-label", "Sensor details");
    expect(setAttribute).toHaveBeenCalledWith("aria-haspopup", "dialog");
  });

  it("opens only the clicked feature and supports Enter and Space", () => {
    const select = vi.fn();
    const stopPropagation = vi.fn();
    const preventDefault = vi.fn();
    const handlers = selectionHandlers("Details", select);
    handlers.click?.({
      originalEvent: { stopPropagation },
    } as unknown as LeafletMouseEvent);
    for (const key of ["Enter", " ", "Escape"])
      handlers.keydown?.({
        originalEvent: { key, stopPropagation, preventDefault },
      } as unknown as LeafletKeyboardEvent);
    expect(select).toHaveBeenCalledTimes(3);
    expect(stopPropagation).toHaveBeenCalledTimes(3);
    expect(preventDefault).toHaveBeenCalledTimes(2);
  });
});
