import { useState, type CSSProperties } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTheme } from "../../contexts/ThemeContext";
import { useTokens } from "../../hooks/useTokens";
import { useDebounced } from "../../hooks/useDebounced";
import { useChartWidth } from "../../hooks/useChartWidth";
import { SvgLineChart } from "../SvgLineChart";
import { analyticsApi } from "@/api";
import {
  useDryingRate,
  useIrrigationHeatmap,
} from "../../../features/analytics/useAnalytics";

/**
 * The heat scale is defined here rather than in theme/tokens.ts: it is a four-step sequential ramp
 * for one chart, not a general UI colour, and putting it in the shared palette would imply other
 * surfaces should use it.
 */
function heatColor(value: number, isDark: boolean): string {
  if (isDark) {
    if (value < 0.2) return "#161B22";
    if (value < 0.4) return "#1A2F1C";
    if (value < 0.7) return "#236E2A";
    return "#3FB950";
  }
  if (value < 0.2) return "#F3F4F6";
  if (value < 0.4) return "#D1FAE5";
  if (value < 0.7) return "#6EE7B7";
  return "#00A859";
}

/** Today's date in farm-local terms, as `YYYY-MM-DD` — the flow endpoint's expected format. */
function todayIso(): string {
  const now = new Date();
  const farm = new Date(now.getTime() + 60 * 60 * 1000); // UTC+1, no DST
  return farm.toISOString().slice(0, 10);
}

export function Analytics() {
  const [date, setDate] = useState(todayIso);
  const [rainfall, setRainfall] = useState(0);
  const { t, font } = useLanguage();
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === "dark";
  const c = useTokens();
  const a = t.analytics;
  const [chartRef, chartWidth] = useChartWidth();

  // The slider reads the live value; the query only sees the settled one.
  const settledRainfall = useDebounced(rainfall, 300);

  const flow = useDryingRate(date, settledRainfall);
  const heatmap = useIrrigationHeatmap();

  const points = (flow.data ?? []).map((point) => ({
    hour: point.hour,
    // The server applies the what-if, so one definition of the model serves both the chart and
    // the exported CSV.
    rate: point.adjustedRate ?? point.rate,
  }));

  const maxRate = Math.max(1, ...points.map((p) => p.rate));
  const step = Math.max(1, Math.ceil(maxRate / 4));

  const cells = heatmap.data?.cells ?? [];

  const cardStyle: CSSProperties = {
    border: `1px solid ${c.border}`,
    background: c.card,
    borderRadius: 8,
    padding: 24,
  };

  const inputStyle: CSSProperties = {
    border: `1px solid ${c.border}`,
    background: c.inputBg,
    color: c.text,
    fontFamily: "JetBrains Mono",
  };

  async function handleExport() {
    try {
      const blob = await analyticsApi.exportCsv({ range: "30d" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "semico-moisture.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed.");
    }
  }

  return (
    <div className="flex flex-col gap-8" style={{ fontFamily: font }}>
      {/* Day selector — the drying curve is a single day's hourly detail. */}
      <div className="flex flex-wrap gap-3 items-center">
        <label className="text-[12px]" style={{ fontFamily: font, color: c.sec }}>
          {a.viewDay}
        </label>
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="rounded-lg px-3 py-2 text-[13px] outline-none"
          style={inputStyle}
          dir="ltr"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* ── Irrigation Heatmap ─────────────────────────── */}
        <div style={cardStyle}>
          <p className="text-[13px] mb-4" style={{ fontFamily: font, color: c.sec }}>
            {a.irrigationHeatmap}
          </p>
          {cells.length === 0 ? (
            <p className="text-[12px]" style={{ fontFamily: font, color: c.sec }}>
              {heatmap.isLoading ? "…" : "No irrigation recorded this month."}
            </p>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {cells.map((cell) => (
                <div
                  key={cell.index}
                  className="aspect-square rounded-sm"
                  style={{ backgroundColor: heatColor(cell.value, isDark) }}
                  title={`${cell.label} · ${cell.value}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Soil Drying Rate ───────────────────────────── */}
        <div style={cardStyle}>
          <p className="text-[13px] mb-4" style={{ fontFamily: font, color: c.sec }}>
            {a.soilDryingRate}
          </p>
          <div ref={chartRef} style={{ width: "100%", height: 200 }}>
            {flow.isError && (
              <p className="text-[12px]" style={{ fontFamily: font, color: c.crit }}>
                {flow.error instanceof Error ? flow.error.message : "Could not load the curve."}
              </p>
            )}
            {chartWidth > 0 && points.length > 0 && (
              <SvgLineChart
                data={points}
                xKey="hour"
                lines={[{ dataKey: "rate", color: c.green, name: a.soilDryingRate }]}
                width={chartWidth}
                height={200}
                yTicks={[0, step, step * 2, step * 3, step * 4]}
                xTickEvery={8}
                tooltipLabels={{ rate: "%" }}
                isDark={isDark}
              />
            )}
            {!flow.isLoading && !flow.isError && points.length === 0 && (
              <p className="text-[12px] py-8" style={{ fontFamily: font, color: c.sec }}>
                No readings for this day.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── What-If Simulator ─────────────────────────────── */}
      <div style={cardStyle}>
        <p className="text-[13px] mb-3" style={{ fontFamily: font, color: c.sec }}>
          {a.whatIfSimulator}
        </p>
        <label className="text-[12px] mb-2 block" style={{ fontFamily: font, color: c.sec }}>
          {a.simulateRainfall}
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={50}
            value={rainfall}
            onChange={(event) => setRainfall(Number(event.target.value))}
            className="w-full max-w-[400px]"
            style={{ accentColor: c.green }}
            dir="ltr"
          />
          <span className="text-[14px]" style={{ fontFamily: "JetBrains Mono", color: c.text }}>
            {rainfall} mm
          </span>
        </div>
      </div>

      {/* ── Export ────────────────────────────────────────── */}
      {/*
        One working button rather than two inert ones. The design called for PDF and Excel; the API
        exports CSV, so offering "Export PDF" would be a control that does nothing. Adding a real
        CSV export and dropping the two placeholders is the honest version.
      */}
      <div className="flex gap-4">
        <button
          type="button"
          onClick={handleExport}
          className="flex items-center gap-1.5 text-[13px] hover:underline"
          style={{ fontFamily: font, color: c.blue }}
        >
          <Download size={14} strokeWidth={1.5} /> {a.exportCsv}
        </button>
      </div>
    </div>
  );
}
