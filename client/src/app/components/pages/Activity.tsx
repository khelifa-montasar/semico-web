import { useState } from "react";
import { MapPin } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTokens } from "../../hooks/useTokens";
import { useLocalized } from "../../hooks/useLocalized";
import { farmMonthLabel, farmTime, firstWeekdayOffset, geoLabel } from "../../../lib/time";
import { useActivityCalendar, useActivityFeed } from "../../../features/activity/useActivity";
import type { ActivityFilters } from "@/api";

type FilterKey = "all" | "auto" | "manual";

export function Activity() {
  const { t, lang, font } = useLanguage();
  const L = useLocalized();
  const c = useTokens();
  const a = t.activity;
  const [filter, setFilter] = useState<FilterKey>("all");

  // The server filters; the client only decides which type to ask for.
  const typeFilter: ActivityFilters["type"] =
    filter === "all" ? undefined : filter === "auto" ? "AUTO" : "MANUAL";

  const feed = useActivityFeed({ type: typeFilter, pageSize: 50 });
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

  return (
    <div className="flex flex-col gap-8" style={{ fontFamily: font }}>
      {/* Filter */}
      <div className="flex items-center gap-3">
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

        {feed.data && (
          <span
            className="text-[12px]"
            style={{ fontFamily: "JetBrains Mono", color: c.sec }}
          >
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
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
              <div key={d} className="aspect-square flex items-center justify-center relative">
                <span
                  className="text-[11px]"
                  style={{ fontFamily: "JetBrains Mono", color: c.sec }}
                >
                  {d}
                </span>
                {irrigationDays.includes(d) && (
                  <div
                    className="absolute bottom-0.5 w-1 h-1 rounded-full"
                    style={{ background: c.green }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
