import { useState } from "react";
import { Leaf, Cloud, CloudRain, Droplets, History, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTheme } from "../../contexts/ThemeContext";
import { useChartWidth } from "../../hooks/useChartWidth";
import { SvgLineChart } from "../SvgLineChart";
import { LivingWaveGauge } from "../LivingWaveGauge";
import { tok } from "../../theme/tokens";
import { farmDateLabel } from "../../../lib/time";
import { useActivityFeed } from "../../../features/activity/useActivity";
import { useSystemHealth } from "../../../features/systemHealth/useSystemHealth";
import {
  useIrrigate,
  useLatestTelemetry,
  useMoistureSeries,
  useTodaySaving,
} from "../../../features/dashboard/useDashboard";

/**
 * Shared palette — see theme/tokens.ts. This page's inline copy was the last of seven duplicated
 * palettes in the app.
 */
function palette(isDark: boolean) {
  return tok(isDark);
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────
function Card({
  children,
  style,
  className = "",
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div className={`rounded-lg p-6 ${className}`} style={{ border: "1px solid", ...style }}>
      {children}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function Dashboard() {
  const { t, lang, isRTL, font } = useLanguage();
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === "dark";
  const d = t.dashboard;
  const c = palette(isDark);

  const [duration, setDuration] = useState(10);
  const [chartRef, chartWidth] = useChartWidth();

  const latest = useLatestTelemetry();
  const series = useMoistureSeries({ interval: "day", range: "7d" });
  const saving = useTodaySaving();
  const health = useSystemHealth();
  const feed = useActivityFeed({ pageSize: 20 });
  const irrigate = useIrrigate();

  // The chart's axis labels come from the server, already bucketed in the farm timezone.
  const weekData = (series.data ?? []).map((point) => ({
    day: point.label,
    moisture: point.rootMoisture,
  }));

  const currentMoisture = latest.data?.rootMoisture ?? 0;

  const valveIsOpen = latest.data?.valveState === "OPEN";
  const valveLabel = valveIsOpen ? d.valveOpen : d.valveClosed;

  // The most recent irrigation in the feed — an OPEN or a scheduled completion.
  const lastIrrigation = (feed.data?.data ?? []).find(
    (entry) => entry.kind === "VALVE_OPEN" || entry.kind === "SCHEDULED_IRRIGATION",
  );

  function handleIrrigate() {
    irrigate.mutate(duration, {
      onSuccess: (command) => {
        toast.success(
          isRTL
            ? `تم فتح الصمام في ${command.zoneName} لمدة ${duration} ${d.minLabel}.`
            : `Valve opened for ${command.zoneName} — ${duration} ${d.minLabel}.`,
        );
      },
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : "Could not start irrigation.");
      },
    });
  }

  const cardStyle: React.CSSProperties = {
    background: c.card,
    borderColor: c.border,
  };

  return (
    <div style={{ fontFamily: font, position: "relative" }}>
      {/* ── Page Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-[22px]" style={{ fontWeight: 500, color: c.text }}>
          {d.pageTitle}
        </h1>
        <span className="text-[12px]" style={{ fontFamily: "JetBrains Mono", color: c.sec }}>
          {/* Previously the literal string "Sun, 19 Apr 2026", which the page would have claimed
              forever. */}
          {farmDateLabel(new Date(), lang)}
        </span>
      </div>

      {/* ── Two-column layout ─────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-[7fr_3fr] gap-6">
        {/* ════════════════════════════════
            MAIN COLUMN
        ════════════════════════════════ */}
        <div className="flex flex-col gap-6">
          {/* ── Top Row: Gauge + Savings ──────────────────── */}
          <div className="grid sm:grid-cols-[2fr_1fr] gap-6">
            {/* Card A — Moisture Gauge */}
            <Card style={cardStyle} className="flex flex-col items-center justify-center py-8">
              {latest.isLoading ? (
                <div style={{ height: 160, display: "flex", alignItems: "center" }}>
                  <span className="text-[13px]" style={{ color: c.sec }}>
                    …
                  </span>
                </div>
              ) : (
                <LivingWaveGauge value={currentMoisture} isDark={isDark} size={160} />
              )}
              <p
                className="mt-4 text-[12px] tracking-wider"
                style={{
                  fontFamily: "JetBrains Mono",
                  color: c.sec,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                {d.rootMoisture}
              </p>
            </Card>

            {/* Card B — Daily Savings */}
            <Card style={cardStyle} className="flex flex-col items-center justify-center py-8 gap-3">
              <div className="flex items-end gap-2">
                <Leaf size={22} strokeWidth={1.5} style={{ color: c.green, marginBottom: 4 }} />
                <span
                  style={{ fontFamily: "JetBrains Mono", fontSize: 42, color: c.green, lineHeight: 1 }}
                >
                  {saving.data ? saving.data.waterSavedDzd.toLocaleString() : "—"}
                </span>
                <span
                  style={{
                    fontFamily: "JetBrains Mono",
                    fontSize: 18,
                    color: c.green,
                    marginBottom: 4,
                  }}
                >
                  {d.savedTodayCurrency}
                </span>
              </div>
              <p
                className="text-[13px] text-center max-w-[160px]"
                style={{ color: c.sec, fontFamily: font, lineHeight: 1.5 }}
              >
                {d.savedTodayLabel}
              </p>
              {/* These figures are modelled from a per-event estimate, not measured. Saying so is
                  better than letting a headline number read as a meter reading. */}
              <span
                className="text-[10px]"
                style={{ fontFamily: "JetBrains Mono", color: c.sec, opacity: 0.75 }}
              >
                {d.estimateNote}
              </span>
            </Card>
          </div>

          {/* ── 7-day Trend Chart ─────────────────────────── */}
          <Card style={cardStyle}>
            <h2 className="text-[16px] mb-6" style={{ fontWeight: 500, color: c.text }}>
              {d.moistureTrend}
            </h2>

            <div ref={chartRef} style={{ width: "100%", height: 280 }}>
              {series.isError && (
                <p className="text-[12px]" style={{ color: c.crit }}>
                  {series.error instanceof Error ? series.error.message : d.noReadings}
                </p>
              )}
              {chartWidth > 0 && weekData.length > 0 && (
                <SvgLineChart
                  data={weekData}
                  xKey="day"
                  lines={[
                    {
                      dataKey: "moisture",
                      color: c.green,
                      areaFill: isDark ? "rgba(63,185,80,0.10)" : "rgba(0,168,89,0.08)",
                    },
                  ]}
                  width={chartWidth}
                  height={280}
                  yDomain={[0, 100]}
                  yTicks={[0, 25, 50, 75, 100]}
                  xTickEvery={1}
                  showGrid={false}
                  refLines={[{ y: 40, stroke: c.crit, dash: "4 4" }]}
                  tooltipLabels={{ moisture: "%" }}
                  isDark={isDark}
                />
              )}
              {!series.isLoading && !series.isError && weekData.length === 0 && (
                <p className="text-[12px] py-16 text-center" style={{ color: c.sec }}>
                  {d.noReadings}
                </p>
              )}
            </div>

            {/* Threshold legend */}
            <div className="flex items-center gap-2 mt-3">
              <svg width={24} height={10}>
                <line
                  x1={0}
                  y1={5}
                  x2={24}
                  y2={5}
                  stroke={c.crit}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
              </svg>
              <span className="text-[11px]" style={{ fontFamily: "JetBrains Mono", color: c.crit }}>
                {d.thresholdLabel}
              </span>
            </div>
          </Card>
        </div>

        {/* ════════════════════════════════
            SIDEBAR
        ════════════════════════════════ */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-1 gap-6 lg:content-start">
          {/* Card C — Weather Forecast */}
          <Card style={cardStyle}>
            <div className="flex items-center gap-2 mb-5">
              <Cloud size={16} strokeWidth={1.5} style={{ color: c.sec }} />
              <h3 className="text-[14px]" style={{ fontWeight: 500, color: c.text }}>
                {d.weatherTitle}
              </h3>
            </div>

            {/*
              No forecast provider is integrated.
              This card previously rendered "26°C / Partly cloudy / Rain expected tomorrow. No
              irrigation needed." — all static strings from `translations.ts`, presented as a live
              forecast. That is the most dangerous kind of placeholder on this screen: a farmer could
              skip a watering on the strength of a prediction that came from a translation file.
              Until a provider is wired in, the card says so instead of inventing weather.
            */}
            <div className="flex flex-col items-center justify-center gap-2 py-7 text-center">
              <CloudRain size={28} strokeWidth={1.5} style={{ color: c.sec, opacity: 0.55 }} />
              <p
                className="text-[12px] max-w-[200px]"
                style={{ fontFamily: font, color: c.sec, lineHeight: 1.5 }}
              >
                {d.weatherUnavailable}
              </p>
            </div>

            {/* Valve status — real, from the latest reading. */}
            <div className="pt-3" style={{ borderTop: `1px solid ${c.divider}` }}>
              <span
                className="text-[11px] tracking-wider"
                style={{
                  fontFamily: "JetBrains Mono",
                  color: c.sec,
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                }}
              >
                {d.valveLabel}:{" "}
                <span style={{ color: valveIsOpen ? c.green : c.sec }}>{valveLabel}</span>
              </span>
            </div>
          </Card>

          {/* Card D — Last Activity */}
          <Card style={cardStyle}>
            <div className="flex items-center gap-2 mb-5">
              <History size={16} strokeWidth={1.5} style={{ color: c.sec }} />
              <h3 className="text-[14px]" style={{ fontWeight: 500, color: c.text }}>
                {d.lastActivityTitle}
              </h3>
            </div>

            {/* Last irrigation — from the activity feed, not a fixed string. */}
            <div
              className="flex items-start gap-3 py-3"
              style={{ borderBottom: `1px solid ${c.divider}` }}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ background: c.dropletBg }}
              >
                <Droplets size={15} strokeWidth={1.5} style={{ color: c.blue }} />
              </div>
              <div>
                <p
                  className="text-[13px] mb-0.5"
                  style={{ color: c.text, fontFamily: font, fontWeight: 500 }}
                >
                  {d.lastIrrigationLabel}
                </p>
                <span className="text-[11px]" style={{ fontFamily: "JetBrains Mono", color: c.sec }}>
                  {lastIrrigation ? farmDateLabel(new Date(lastIrrigation.occurredAt), lang) : d.noIrrigationYet}
                </span>
              </div>
            </div>

            {/* System check — derived from the diagnostic summary. */}
            <div className="flex items-start gap-3 pt-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ background: c.checkBg }}
              >
                <CheckCircle2 size={15} strokeWidth={1.5} style={{ color: c.green }} />
              </div>
              <div>
                <p
                  className="text-[13px] mb-0.5"
                  style={{ color: c.text, fontFamily: font, fontWeight: 500 }}
                >
                  {d.systemCheckLabel}
                </p>
                <span
                  className="text-[11px]"
                  style={{ fontFamily: font, color: health.data?.online ? c.green : c.warn }}
                >
                  {health.data?.online === false ? d.systemAttention : d.systemOnline}
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* ════════════════════════════════
          FLOATING ACTION BUTTON
      ════════════════════════════════ */}
      <div
        className="fixed z-40 bottom-[96px] md:bottom-8 left-1/2 -translate-x-1/2"
        style={{
          background: c.fabBg,
          border: `1px solid ${c.fabBorder}`,
          borderRadius: 40,
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          boxShadow: isDark ? "0 4px 24px rgba(0,0,0,0.5)" : "0 4px 24px rgba(0,0,0,0.10)",
        }}
      >
        <button
          onClick={() => setDuration((v) => Math.max(1, v - 1))}
          disabled={irrigate.isPending}
          className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
          style={{
            border: `1px solid ${c.border}`,
            color: c.text,
            background: "transparent",
            fontSize: 18,
            lineHeight: 1,
          }}
          aria-label="Decrease duration"
        >
          −
        </button>

        <span
          style={{
            fontFamily: "JetBrains Mono",
            fontSize: 18,
            color: c.text,
            minWidth: 72,
            textAlign: "center",
          }}
        >
          {duration} {d.minLabel}
        </span>

        <button
          onClick={() => setDuration((v) => Math.min(120, v + 1))}
          disabled={irrigate.isPending}
          className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
          style={{
            border: `1px solid ${c.border}`,
            color: c.text,
            background: "transparent",
            fontSize: 18,
            lineHeight: 1,
          }}
          aria-label="Increase duration"
        >
          +
        </button>

        <div className="w-px h-6 mx-1" style={{ background: c.border }} />

        {/* The real command. The server enforces the valve-control capability, so a worker without
            it gets a 403 here even though the button is rendered. */}
        <button
          onClick={handleIrrigate}
          disabled={irrigate.isPending}
          className="px-5 py-2 rounded-full text-[14px] transition-all"
          style={{
            background: irrigate.isPending ? c.greenPress : c.green,
            color: "#FFFFFF",
            fontFamily: font,
            fontWeight: 500,
            opacity: irrigate.isPending ? 0.85 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {irrigate.isPending ? d.irrigating : d.irrigateNow}
        </button>
      </div>
    </div>
  );
}
