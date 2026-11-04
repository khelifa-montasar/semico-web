import { useState } from "react";
import { MapPin } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTokens } from "../../hooks/useTokens";
import { useLocalized } from "../../hooks/useLocalized";
import { useChartWidth } from "../../hooks/useChartWidth";
import { useTheme } from "../../contexts/ThemeContext";
import { SvgLineChart } from "../SvgLineChart";
import { farmMonthLabel, farmTime, firstWeekdayOffset, geoLabel } from "../../../lib/time";
import { useActivityCalendar, useActivityFeed } from "../../../features/activity/useActivity";
import { useMoistureSeries } from "../../../features/dashboard/useDashboard";
import type { ActivityFilters } from "@/api";

type FilterKey = "all" | "auto" | "manual";
type DateSelectionMode = "day" | "range";

function dateBoundary(date: string, endOfDay: boolean): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  return new Date(`${date}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+01:00`).toISOString();
}

export function Activity() {
  const { t, lang, font } = useLanguage();
  const L = useLocalized();
  const c = useTokens();
  const a = t.activity;
  const [filter, setFilter] = useState<FilterKey>("all");
  const [dateMode, setDateMode] = useState<DateSelectionMode>("day");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);

  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === "dark";
  const [chartRef, chartWidth] = useChartWidth();

  // The 7-day trend, moved here from the dashboard: it belongs with the log it explains, not on
  // the overview where it competed with the field itself.
  const series = useMoistureSeries({ interval: "day", range: "7d" });
  const weekData = (series.data ?? []).map((point) => ({
    day: point.label,
    moisture: point.rootMoisture,
  }));

  // The server filters; the client only decides which type to ask for.
  const typeFilter: ActivityFilters["type"] =
    filter === "all" ? undefined : filter === "auto" ? "AUTO" : "MANUAL";
  const selectedFrom = fromDate && toDate && fromDate > toDate ? toDate : fromDate;
  const selectedTo = fromDate && toDate && fromDate > toDate ? fromDate : toDate;

  const feed = useActivityFeed({
    type: typeFilter,
    from: dateBoundary(selectedFrom, false),
    to: dateBoundary(selectedTo, true),
    pageSize: 50,
  });
  const calendar = useActivityCalendar();

  const entries = feed.data?.data ?? [];
  const total = feed.data?.meta?.total ?? entries.length;

  const filters: { key: FilterKey; label: string }[] = [
    { key: "all", label: a.all },
    { key: "auto", label: a.automatic },
    { key: "manual", label: a.manual },
  ];

  const monthKey = calendar.data?.month ?? "";
  const daysInMonth = calendar.data?.daysInMonth ?? 30;
  const irrigationDays = calendar.data?.irrigationDays ?? [];
  const offset = monthKey ? firstWeekdayOffset(monthKey) : 0;

  function selectCalendarDate(day: number) {
    if (!monthKey) return;
    const selected = `${monthKey}-${String(day).padStart(2, "0")}`;
    if (dateMode === "day") {
      setFromDate(selected);
      setToDate(selected);
      setRangeAnchor(null);
      return;
    }

    if (!rangeAnchor) {
      setRangeAnchor(selected);
      setFromDate(selected);
      setToDate(selected);
      return;
    }

    setFromDate(selected < rangeAnchor ? selected : rangeAnchor);
    setToDate(selected < rangeAnchor ? rangeAnchor : selected);
    setRangeAnchor(null);
  }

  return (
    <div className="flex flex-col gap-8" style={{ fontFamily: font }}>
      {/* ── Soil moisture trend ───────────────────────────────────────────── */}
      <div className="rounded-lg p-6" style={{ border: `1px solid ${c.border}`, background: c.card }}>
        <h2 className="text-[16px] mb-6" style={{ fontWeight: 500, color: c.text }}>
          {a.moistureTrend}
        </h2>

        <div ref={chartRef} style={{ width: "100%", height: 260 }}>
          {series.isError && (
            <p className="text-[12px]" style={{ color: c.crit }}>
              {series.error instanceof Error ? series.error.message : a.noReadings}
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
              height={260}
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
              {a.noReadings}
            </p>
          )}
        </div>

        {/* Threshold legend */}
        <div className="flex items-center gap-2 mt-3">
          <svg width={24} height={10} aria-hidden="true">
            <line x1={0} y1={5} x2={24} y2={5} stroke={c.crit} strokeWidth={1} strokeDasharray="4 3" />
          </svg>
          <span className="text-[11px]" style={{ fontFamily: "JetBrains Mono", color: c.crit }}>
            {a.thresholdLabel}
          </span>
        </div>
      </div>

      {/* Type and date filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterKey)}
          className="rounded-lg px-3 py-2 text-[13px] outline-none"
          style={{
            border: `1px solid ${c.border}`,
            background: c.inputBg,
            color: c.text,
            fontFamily: font,
          }}
        >
          {filters.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1 rounded-full p-1" style={{ border: `1px solid ${c.border}` }}>
          {(["day", "range"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={dateMode === mode}
              onClick={() => { setDateMode(mode); setRangeAnchor(null); }}
              className="px-3 py-1 rounded-full text-[11px]"
              style={{ background: dateMode === mode ? c.activeBg : "transparent", color: dateMode === mode ? c.activeText : c.sec }}
            >
              {mode === "day" ? a.selectDay : a.selectRange}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[11px]" style={{ color: c.sec }}>
          {dateMode === "day" ? a.selectedDay : a.fromDate}
          <input
            type="date"
            value={fromDate}
            onChange={(event) => {
              setFromDate(event.target.value);
              if (dateMode === "day") setToDate(event.target.value);
            }}
            className="rounded-lg px-2 py-1 text-[12px] outline-none"
            style={{ border: `1px solid ${c.border}`, background: c.inputBg, color: c.text }}
            dir="ltr"
          />
        </label>
        {dateMode === "range" && (
          <label className="flex items-center gap-2 text-[11px]" style={{ color: c.sec }}>
            {a.toDate}
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="rounded-lg px-2 py-1 text-[12px] outline-none"
              style={{ border: `1px solid ${c.border}`, background: c.inputBg, color: c.text }}
              dir="ltr"
            />
          </label>
        )}
        <button
          type="button"
          onClick={() => { setFromDate(""); setToDate(""); setRangeAnchor(null); }}
          className="text-[11px] underline underline-offset-2"
          style={{ color: c.sec }}
        >
          {a.clearDateFilter}
        </button>
        {feed.data && (
          <span className="text-[12px] ms-auto" style={{ fontFamily: "JetBrains Mono", color: c.sec }}>
            {total}
          </span>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* ── Log table ─────────────────────────────────────── */}
        <div
          className="lg:col-span-2 rounded-lg overflow-hidden"
          style={{ border: `1px solid ${c.border}` }}
        >
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ background: c.thead }}>
                <th
                  className="text-start px-4 py-3"
                  style={{
                    fontWeight: 400,
                    fontFamily: "JetBrains Mono",
                    fontSize: 11,
                    color: c.sec,
                  }}
                >
                  {a.timeCol}
                </th>
                <th
                  className="text-start px-4 py-3"
                  style={{ fontWeight: 400, fontFamily: font, fontSize: 11, color: c.sec }}
                >
                  {a.eventCol}
                </th>
                <th
                  className="text-start px-4 py-3 hidden sm:table-cell"
                  style={{ fontWeight: 400, fontFamily: font, fontSize: 11, color: c.sec }}
                >
                  {a.zoneCol}
                </th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {feed.isLoading && (
                <tr>
                  <td
                    className="px-4 py-6"
                    colSpan={4}
                    style={{ fontFamily: font, color: c.sec }}
                  >
                    {a.loading}
                  </td>
                </tr>
              )}

              {feed.isError && (
                <tr>
                  <td
                    className="px-4 py-6"
                    colSpan={4}
                    style={{ fontFamily: font, color: c.crit }}
                  >
                    {feed.error instanceof Error ? feed.error.message : "Could not load activity."}
                  </td>
                </tr>
              )}

              {!feed.isLoading && !feed.isError && entries.length === 0 && (
                <tr>
                  <td
                    className="px-4 py-6"
                    colSpan={4}
                    style={{ fontFamily: font, color: c.sec }}
                  >
                    {a.empty}
                  </td>
                </tr>
              )}

              {entries.map((entry) => {
                const geo = geoLabel(entry.lat, entry.lng);
                return (
                  <tr key={entry.id} style={{ borderTop: `1px solid ${c.border}` }}>
                    <td
                      className="px-4 py-3"
                      style={{ fontFamily: "JetBrains Mono", color: c.text }}
                    >
                      {farmTime(entry.occurredAt)}
                    </td>
                    <td className="px-4 py-3" style={{ fontFamily: font, color: c.text }}>
                      {L(entry.message)}
                    </td>
                    <td
                      className="px-4 py-3 hidden sm:table-cell"
                      style={{ fontFamily: font, color: c.sec }}
                    >
                      {entry.zoneName ?? ""}
                    </td>
                    <td className="px-2 py-3">
                      {/* Only manual overrides carry a fix; a row without one shows no pin rather
                          than a placeholder coordinate. */}
                      {geo && (
                        <div className="relative group">
                          <MapPin
                            size={14}
                            strokeWidth={1.5}
                            style={{ color: c.sec, cursor: "pointer" }}
                          />
                          <div
                            className="absolute bottom-full end-0 mb-1 hidden group-hover:block backdrop-blur rounded px-2 py-1 text-[10px] whitespace-nowrap z-10"
                            style={{
                              background: c.tooltipBg,
                              border: `1px solid ${c.border}`,
                              color: c.sec,
                              fontFamily: "JetBrains Mono",
                            }}
                          >
                            {geo}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Calendar ──────────────────────────────────────── */}
        <div
          className="rounded-lg p-4 self-start"
          style={{ border: `1px solid ${c.border}`, background: c.card }}
        >
          <p className="text-[13px] mb-4" style={{ fontFamily: font, color: c.sec }}>
            {monthKey ? farmMonthLabel(monthKey, lang) : a.april2026}
          </p>
          <div className="grid grid-cols-7 gap-1 text-center">
            {a.dayLetters.map((d, i) => (
              <span
                key={i}
                className="text-[10px] pb-2"
                style={{ fontFamily: "JetBrains Mono", color: c.sec }}
              >
                {d}
              </span>
            ))}
            {/* Blank cells so the 1st lands on its real weekday. */}
            {Array.from({ length: offset }, (_, i) => (
              <div key={`e${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
              const dayKey = `${monthKey}-${String(d).padStart(2, "0")}`;
              const selected = dayKey >= selectedFrom && dayKey <= selectedTo && Boolean(selectedFrom && selectedTo);
              return (
                <div key={d} className="aspect-square flex items-center justify-center relative">
                  <button
                    type="button"
                    onClick={() => selectCalendarDate(d)}
                    aria-label={`${monthKey}-${String(d).padStart(2, "0")}`}
                    aria-pressed={selected}
                    className="w-full h-full rounded-full text-[11px]"
                    style={{
                      fontFamily: "JetBrains Mono",
                      color: selected ? c.activeText : c.sec,
                      background: selected ? c.activeBg : "transparent",
                    }}
                  >
                    {d}
                  </button>
                  {irrigationDays.includes(d) && (
                    <div className="pointer-events-none absolute bottom-0.5 w-1 h-1 rounded-full" style={{ background: c.green }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
