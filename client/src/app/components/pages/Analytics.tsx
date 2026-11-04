import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Download, FileText, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTheme } from "../../contexts/ThemeContext";
import { useTokens } from "../../hooks/useTokens";
import { useDebounced } from "../../hooks/useDebounced";
import { useChartWidth } from "../../hooks/useChartWidth";
import { SvgLineChart } from "../SvgLineChart";
import { analyticsApi, queryKeys } from "@/api";
import { useAuth } from "@/features/auth/AuthContext";
import { canExportData } from "@/features/auth/permissions";
import { toDryingRateChartPoints } from "../../../features/analytics/chartData";
import { useDryingRate, useIrrigationHeatmap } from "../../../features/analytics/useAnalytics";

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

/** `YYYY-MM-DD` shifted by whole days, for the default export window. */
function shiftDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** A `YYYY-MM-DD` picker value as the ISO instant the API expects, or null if it is incomplete. */
function toInstant(iso: string, endOfDay: boolean): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function Analytics() {
  const [date, setDate] = useState(todayIso);
  const [rainfall, setRainfall] = useState(0);

  // ── Export window ──────────────────────────────────────────────────────────
  // Defaults to the last 30 days, which is the range the old fixed export used.
  const [fromDate, setFromDate] = useState(() => shiftDays(todayIso(), -29));
  const [toDate, setToDate] = useState(todayIso);

  const { t, font } = useLanguage();
  const { user } = useAuth();
  const mayExport = canExportData(user);
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === "dark";
  const c = useTokens();
  const a = t.analytics;
  const [chartRef, chartWidth] = useChartWidth();

  // The slider reads the live value; the query only sees the settled one.
  const settledRainfall = useDebounced(rainfall, 300);

  const flow = useDryingRate(date, settledRainfall);
  const heatmap = useIrrigationHeatmap();

  const fromInstant = toInstant(fromDate, false);
  const toInstantValue = toInstant(toDate, true);
  const rangeValid =
    fromInstant !== null && toInstantValue !== null && fromInstant <= toInstantValue;

  // The server applies the what-if, so one definition of the model serves the chart and export.
  const points = toDryingRateChartPoints(flow.data ?? []);

  const maxRate = Math.max(1, ...points.map((point) => point.baselineRate));
  const step = Math.max(1, Math.ceil(maxRate / 4));

  // ── What-if readout ────────────────────────────────────────────────────────
  // The slider changes the curve, but a curve alone does not say how much the rain helped. These
  // two averages do: base is the modelled drying without the rain, adjusted is with it.
  const dryingSummary = useMemo(() => {
    const rows = flow.data ?? [];
    const base = mean(rows.map((row) => row.rate));
    const adjusted = mean(rows.map((row) => row.adjustedRate ?? row.rate));
    const reduction = base > 0 ? Math.round(((base - adjusted) / base) * 100) : 0;
    return { base, adjusted, reduction };
  }, [flow.data]);

  const RAINFALL_PRESETS = [0, 5, 10, 20, 30, 50] as const;

  const cells = heatmap.data?.cells ?? [];

  // ── The report ─────────────────────────────────────────────────────────────
  // Fetched only when the user asks to export, and rendered into a print-only block. The browser's
  // print-to-PDF keeps Arabic shaping and RTL correct without embedding a font, which a client-side
  // PDF writer would have to do by hand.
  const [reportRequested, setReportRequested] = useState(false);
  const report = useQuery({
    queryKey: queryKeys.analytics.moisture({ from: fromInstant, to: toInstantValue, report: true }),
    queryFn: () => analyticsApi.moisture({ from: fromInstant ?? undefined, to: toInstantValue ?? undefined }),
    enabled: reportRequested && rangeValid,
  });

  useEffect(() => {
    if (!reportRequested || !report.isSuccess) return;
    // A tick, so the report is painted before the print dialog snapshots the page.
    const id = window.setTimeout(() => {
      window.print();
      setReportRequested(false);
    }, 50);
    return () => window.clearTimeout(id);
  }, [reportRequested, report.isSuccess]);

  const reportRows = report.data ?? [];

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

  async function handleExportCsv() {
    if (!rangeValid) return;

    try {
      const blob = await analyticsApi.exportCsv({
        from: fromInstant ?? undefined,
        to: toInstantValue ?? undefined,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `semico-moisture-${fromDate}_${toDate}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed.");
    }
  }

  function handleExportPdf() {
    if (!rangeValid) return;
    setReportRequested(true);
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* ── Irrigation Heatmap ─────────────────────────── */}
        <div className="lg:col-span-5" style={cardStyle}>
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
        <div className="lg:col-span-7" style={cardStyle}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <p className="text-[13px]" style={{ fontFamily: font, color: c.sec }}>
              {a.soilDryingRate}
            </p>
            <p className="text-[11px]" style={{ fontFamily: "JetBrains Mono", color: c.sec }}>
              {a.rainfallImpact}: {rainfall} mm
            </p>
          </div>
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
                lines={[
                  { dataKey: "baselineRate", color: c.blue, name: a.baselineRate },
                  { dataKey: "simulatedRate", color: c.green, name: a.simulatedRate },
                ]}
                width={chartWidth}
                height={200}
                yTicks={[0, step, step * 2, step * 3, step * 4]}
                xTickEvery={8}
                tooltipLabels={{ baselineRate: "%", simulatedRate: "%" }}
                isDark={isDark}
              />
            )}
            {!flow.isLoading && !flow.isError && points.length === 0 && (
              <p className="text-[12px] py-8" style={{ fontFamily: font, color: c.sec }}>
                No readings for this day.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 mt-2 text-[11px]" role="list" aria-label={a.soilDryingRate}>
            {[
              { label: a.baselineRate, color: c.blue },
              { label: a.simulatedRate, color: c.green },
            ].map((item) => (
              <span key={item.label} className="inline-flex items-center gap-2" role="listitem">
                <span aria-hidden="true" className="inline-block w-3 h-[2px]" style={{ background: item.color }} />
                <span style={{ color: c.sec }}>{item.label}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── What-If Simulator ─────────────────────────────── */}
      <div style={cardStyle}>
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <p className="text-[13px]" style={{ fontFamily: font, color: c.sec }}>
            {a.whatIfSimulator}
          </p>
          <button
            type="button"
            onClick={() => setRainfall(0)}
            disabled={rainfall === 0}
            className="flex items-center gap-1 text-[12px] disabled:opacity-40"
            style={{ fontFamily: font, color: c.blue }}
          >
            <RotateCcw size={12} strokeWidth={1.5} aria-hidden="true" />
            {a.simulatorReset}
          </button>
        </div>

        <label
          htmlFor="rainfall"
          className="text-[12px] mb-2 block"
          style={{ fontFamily: font, color: c.sec }}
        >
          {a.simulateRainfall}
        </label>
        <div className="flex items-center gap-3">
          <input
            id="rainfall"
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

        {/* Presets: the useful amounts, one click away. A slider alone makes "10 mm" a fiddly
            drag and hides that the curve barely moves beyond a point. */}
        <div className="flex flex-wrap gap-2 mt-3">
          {RAINFALL_PRESETS.map((preset) => {
            const active = rainfall === preset;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => setRainfall(preset)}
                aria-pressed={active}
                className="px-3 py-1 rounded-full text-[12px] transition-colors"
                style={{
                  fontFamily: "JetBrains Mono",
                  border: `1px solid ${active ? c.green : c.border}`,
                  color: active ? c.green : c.sec,
                  background: active ? "color-mix(in srgb, " + c.green + " 12%, transparent)" : "transparent",
                }}
              >
                {preset} mm
              </button>
            );
          })}
        </div>

        {/* The effect, in numbers. Without this the slider is motion without meaning. */}
        <p className="text-[12px] mt-4" style={{ fontFamily: "JetBrains Mono", color: c.sec }}>
          {a.dryingNow}: {dryingSummary.base.toFixed(2)}% {a.vs} {dryingSummary.adjusted.toFixed(2)}%
          {rainfall > 0 && (
            <span style={{ color: c.green }}> (−{dryingSummary.reduction}%)</span>
          )}
        </p>
      </div>

      {/* ── Export ────────────────────────────────────────── */}
      <div style={cardStyle}>
        <p className="text-[13px] mb-4" style={{ fontFamily: font, color: c.sec }}>
          {a.exportRange}
        </p>

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="export-from" className="text-[11px]" style={{ fontFamily: font, color: c.sec }}>
              {a.fromDate}
            </label>
            <input
              id="export-from"
              type="date"
              value={fromDate}
              max={toDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="rounded-lg px-3 py-2 text-[13px] outline-none"
              style={inputStyle}
              dir="ltr"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="export-to" className="text-[11px]" style={{ fontFamily: font, color: c.sec }}>
              {a.toDate}
            </label>
            <input
              id="export-to"
              type="date"
              value={toDate}
              min={fromDate}
              onChange={(event) => setToDate(event.target.value)}
              className="rounded-lg px-3 py-2 text-[13px] outline-none"
              style={inputStyle}
              dir="ltr"
            />
          </div>

          {/* Export is an owner/engineer capability. An operator sees the same charts but not the
              controls — the server refuses the request too, so hiding them only avoids dead
              buttons. */}
          {mayExport && (
            <div className="flex flex-wrap gap-4 ms-auto">
              <button
                type="button"
                onClick={handleExportPdf}
                disabled={!rangeValid || reportRequested}
                className="flex items-center gap-1.5 text-[13px] hover:underline disabled:opacity-40"
                style={{ fontFamily: font, color: c.blue }}
              >
                <FileText size={14} strokeWidth={1.5} aria-hidden="true" /> {a.exportPDF}
              </button>

              <button
                type="button"
                onClick={handleExportCsv}
                disabled={!rangeValid}
                className="flex items-center gap-1.5 text-[13px] hover:underline disabled:opacity-40"
                style={{ fontFamily: font, color: c.blue }}
              >
                <Download size={14} strokeWidth={1.5} aria-hidden="true" /> {a.exportCsv}
              </button>
            </div>
          )}
        </div>

        {!rangeValid && (
          <p className="text-[12px] mt-3" style={{ fontFamily: font, color: c.crit }}>
            {a.fromDate} ≤ {a.toDate}
          </p>
        )}
      </div>

      {/* ── Print-only report ───────────────────────────────
          Hidden on screen; the @media print rule in index.css reveals it and hides the app chrome.
          It is always in the tree so the browser has something to print the instant the dialog
          opens, and so the values match the range the user selected. */}
      <section
        id="print-report"
        className="hidden print:block"
        style={{ color: "#111827", fontFamily: font }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>{a.reportTitle}</h1>
        <p style={{ fontSize: 12, fontFamily: "JetBrains Mono", marginBottom: 16, color: "#374151" }}>
          {fromDate} — {toDate} · {reportRows.length} {a.readings} · {a.reportGenerated}{" "}
          {new Date().toISOString().slice(0, 10)}
        </p>

        {reportRows.length > 0 && (
          <>
            <div style={{ display: "flex", gap: 24, marginBottom: 16, fontSize: 12 }}>
              <span>
                {a.average}:{" "}
                <strong>{mean(reportRows.map((row) => row.rootMoisture)).toFixed(1)}%</strong>
              </span>
              <span>
                {a.minimum}: <strong>{Math.min(...reportRows.map((r) => r.rootMoisture)).toFixed(1)}%</strong>
              </span>
              <span>
                {a.maximum}: <strong>{Math.max(...reportRows.map((r) => r.rootMoisture)).toFixed(1)}%</strong>
              </span>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  {[a.dateCol, a.rootCol, a.surfaceCol].map((label) => (
                    <th
                      key={label}
                      style={{ textAlign: "start", borderBottom: "1px solid #9CA3AF", padding: 6 }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reportRows.map((row) => (
                  <tr key={row.at}>
                    <td style={{ borderBottom: "1px solid #E5E7EB", padding: 6, fontFamily: "JetBrains Mono" }}>
                      {row.at.slice(0, 10)}
                    </td>
                    <td style={{ borderBottom: "1px solid #E5E7EB", padding: 6, fontFamily: "JetBrains Mono" }}>
                      {row.rootMoisture.toFixed(1)}%
                    </td>
                    <td style={{ borderBottom: "1px solid #E5E7EB", padding: 6, fontFamily: "JetBrains Mono" }}>
                      {row.surfaceMoisture === null ? "—" : `${row.surfaceMoisture.toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>
    </div>
  );
}
