import { useState } from "react";
import { BatteryCharging, ChevronLeft, ChevronRight, Droplets, Gauge, Radio } from "lucide-react";
import type { SensorZoneGroup } from "@semico/shared";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTokens } from "../../hooks/useTokens";
import { useLocalized } from "../../hooks/useLocalized";
import { farmTime } from "../../../lib/time";
import { useErrorLogs, useSensors, useSystemHealth } from "../../../features/systemHealth/useSystemHealth";

/**
 * System Health.
 *
 * The page scales by descending rather than by listing: a farm has dozens of sensors, so the main
 * view is one card per ZONE, and a zone opens into its own sensor table. A flat table of 50+ rows
 * would be unreadable and would bury the one thing that matters — which zone has a problem.
 *
 * The farm-level diagnostic cards this page used to show have been replaced by the zone cards. The
 * `-68 dBm` signal metric went with them: it is a per-sensor property, and the sensor table now
 * reports it as a connection state plus how long ago the sensor last reported, which is what an
 * operator can act on. (SystemComponent data still drives the dashboard's critical banner.)
 */

/** Relative time, because "when did this last report?" is the question, not "what o'clock was it?". */
function relativeTime(
  iso: string,
  labels: { justNow: string; minutesAgo: string; hoursAgo: string; daysAgo: string },
): string {
  const minutes = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return labels.justNow;
  if (minutes < 60) return `${minutes} ${labels.minutesAgo}`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${labels.hoursAgo}`;

  return `${Math.floor(hours / 24)} ${labels.daysAgo}`;
}

export function SystemHealth() {
  const [openZoneId, setOpenZoneId] = useState<string | null>(null);
  const { t, font, isRTL } = useLanguage();
  const L = useLocalized();
  const c = useTokens();
  const sh = t.systemHealth;

  const sensors = useSensors();
  const errors = useErrorLogs();
  const health = useSystemHealth();

  const groups = sensors.data ?? [];
  const openZone: SensorZoneGroup | null = groups.find((group) => group.zoneId === openZoneId) ?? null;
  const errorLogs = errors.data ?? [];

  // Chevron points the way back in the current reading direction.
  const BackIcon = isRTL ? ChevronRight : ChevronLeft;

  const connectionDot = (connection: string) =>
    connection === "ONLINE" ? "bg-[#00A859] dark:bg-[#3FB950]" : "bg-[#EF4444] dark:bg-[#F85149]";

  const errorLogSection = (
    <div>
      <p className="text-[13px] mb-3" style={{ fontFamily: font, color: c.sec }}>
        {sh.errorLog}
      </p>
      <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${c.border}` }}>
        <table className="w-full text-[13px]">
          <thead>
            <tr style={{ background: c.thead }}>
              {[
                { label: sh.timeCol, className: "" },
                { label: sh.componentCol, className: "" },
                { label: sh.messageCol, className: "hidden md:table-cell" },
                // The new column. Hidden on the narrowest screens, where the message already
                // carries more of the answer than a zone name would.
                { label: sh.locationCol, className: "hidden sm:table-cell" },
                { label: sh.actionCol, className: "hidden lg:table-cell" },
              ].map((column) => (
                <th
                  key={column.label}
                  className={`text-start px-4 py-3 ${column.className}`}
                  style={{ fontWeight: 400, fontFamily: "JetBrains Mono", fontSize: 11, color: c.sec }}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {errorLogs.length === 0 && (
              <tr>
                <td className="px-4 py-6" colSpan={5} style={{ fontFamily: font, color: c.sec }}>
                  {errors.isLoading ? "…" : sh.noErrors}
                </td>
              </tr>
            )}

            {errorLogs.map((entry) => {
              // A farm-wide error has no zone and no sensor: show a dash rather than an empty cell,
              // so "no location" reads as a fact instead of a missing render.
              const location = [entry.location.zoneName, entry.location.sensorKey]
                .filter((part): part is string => Boolean(part))
                .join(" · ");

              return (
                <tr key={entry.id} style={{ borderTop: `1px solid ${c.border}` }}>
                  <td className="px-4 py-3" style={{ fontFamily: "JetBrains Mono", color: c.text }}>
                    {farmTime(entry.occurredAt)}
                  </td>
                  <td className="px-4 py-3" style={{ fontFamily: font, color: c.text }}>
                    {L(entry.componentName)}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell" style={{ fontFamily: font, color: c.sec }}>
                    {L(entry.message)}
                  </td>
                  <td
                    className="px-4 py-3 hidden sm:table-cell"
                    style={{ fontFamily: "JetBrains Mono", color: location ? c.text : c.sec }}
                  >
                    {location || "—"}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell" style={{ fontFamily: font, color: c.blue }}>
                    {entry.action ? L(entry.action) : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-8" style={{ fontFamily: font }}>
      {sensors.isError && (
        <p className="text-[13px]" style={{ color: c.crit }}>
          {sensors.error instanceof Error ? sensors.error.message : "Could not load sensors."}
        </p>
      )}
      {health.isError && (
        <p className="text-[13px]" style={{ color: c.crit }}>
          {health.error instanceof Error ? health.error.message : "Could not load device status."}
        </p>
      )}

      <section aria-label={sh.deviceSummary} className="grid sm:grid-cols-3 gap-4">
        {[
          {
            key: "gateway",
            icon: Radio,
            label: sh.loraGateway,
            value: health.data
              ? health.data.deviceStatus?.loraGatewayOnline
                ? sh.online
                : sh.offline
              : "—",
            detail: health.data?.deviceStatus?.loraUptimeMinutes != null
              ? `${sh.uptime}: ${health.data.deviceStatus.loraUptimeMinutes} ${sh.mins}`
              : `${sh.uptime}: —`,
            status: health.data?.deviceStatus?.loraGatewayOnline ? c.green : c.crit,
          },
          {
            key: "battery",
            icon: BatteryCharging,
            label: sh.batteryStatus,
            value: health.data?.deviceStatus?.batteryPct != null
              ? `${health.data.deviceStatus.batteryPct}%`
              : "—",
            detail: sh.batteryStatus,
            status: c.text,
          },
          {
            key: "flow",
            icon: Gauge,
            label: sh.flowMeter,
            value: health.data?.deviceStatus?.flowRateLpm != null
              ? `${health.data.deviceStatus.flowRateLpm.toFixed(1)} L/min`
              : "—",
            detail: sh.currentFlow,
            status: c.text,
          },
        ].map((metric) => (
          <div key={metric.key} className="rounded-lg p-4" style={{ border: `1px solid ${c.border}`, background: c.card }}>
            <div className="flex items-center gap-2 text-[12px]" style={{ color: c.sec }}>
              <metric.icon size={15} strokeWidth={1.5} aria-hidden="true" />
              <span>{metric.label}</span>
            </div>
            <p className="mt-3 text-[20px]" style={{ fontFamily: "JetBrains Mono", color: metric.status }}>
              {health.isLoading ? "…" : metric.value}
            </p>
            <p className="mt-1 text-[11px]" style={{ color: c.sec }}>{metric.detail}</p>
          </div>
        ))}
      </section>

      {openZone ? (
        /* ── One zone's sensors ───────────────────────────────────────────── */
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setOpenZoneId(null)}
            className="self-start flex items-center gap-1 text-[13px] transition-colors"
            style={{ color: c.blue }}
          >
            <BackIcon size={14} strokeWidth={1.5} aria-hidden="true" />
            {sh.backToZones}
          </button>

          <div className="flex items-baseline gap-3 flex-wrap">
            <h2 className="text-[18px]" style={{ fontWeight: 500, color: c.text }}>
              {openZone.zoneName}
            </h2>
            <span className="text-[12px]" style={{ fontFamily: "JetBrains Mono", color: c.sec }}>
              {openZone.sensors.length} {sh.sensorsCount} · {openZone.onlineCount} {sh.online} ·{" "}
              {openZone.offlineCount} {sh.offline}
            </span>
          </div>

          <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${c.border}` }}>
            <table className="w-full text-[13px]">
              <thead>
                <tr style={{ background: c.thead }}>
                  {[sh.sensorCol, sh.connectionCol, sh.lastSeenCol, sh.batteryCol].map((label) => (
                    <th
                      key={label}
                      className="text-start px-4 py-3"
                      style={{ fontWeight: 400, fontFamily: "JetBrains Mono", fontSize: 11, color: c.sec }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {openZone.sensors.length === 0 && (
                  <tr>
                    <td className="px-4 py-6" colSpan={4} style={{ color: c.sec }}>
                      {sh.noSensors}
                    </td>
                  </tr>
                )}

                {openZone.sensors.map((sensor) => (
                  <tr key={sensor.id} style={{ borderTop: `1px solid ${c.border}` }}>
                    <td className="px-4 py-2.5" style={{ fontFamily: "JetBrains Mono", color: c.text }}>
                      {sensor.key}
                    </td>
                    <td className="px-4 py-2.5">
                      {/* Colour AND words: the dot alone would be unreadable to a colour-blind
                          reader and silent to a screen reader. */}
                      <span className="flex items-center gap-2" style={{ color: c.text }}>
                        <span
                          aria-hidden="true"
                          className={`w-2 h-2 rounded-full ${connectionDot(sensor.connection)}`}
                        />
                        {sensor.connection === "ONLINE" ? sh.online : sh.offline}
                      </span>
                    </td>
                    <td className="px-4 py-2.5" style={{ fontFamily: "JetBrains Mono", color: c.sec }}>
                      {relativeTime(sensor.lastSeenAt, sh)}
                    </td>
                    <td
                      className="px-4 py-2.5"
                      style={{ fontFamily: "JetBrains Mono", color: sensor.batteryPct != null && sensor.batteryPct < 20 ? c.crit : c.sec }}
                    >
                      {sensor.batteryPct != null ? `${sensor.batteryPct}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── Zone cards — the main view ───────────────────────────────────── */
        <div className="flex flex-col gap-4">
          <h2 className="text-[16px]" style={{ fontWeight: 500, color: c.text }}>
            {sh.zonesTitle}
          </h2>

          {groups.length === 0 ? (
            <p className="text-[13px] py-8 text-center" style={{ color: c.sec }}>
              {sensors.isLoading ? "…" : sh.noZones}
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {groups.map((group) => {
                const allOnline = group.offlineCount === 0;

                return (
                  <button
                    key={group.zoneId}
                    type="button"
                    onClick={() => setOpenZoneId(group.zoneId)}
                    aria-label={`${group.zoneName} — ${group.sensors.length} ${sh.sensorsCount}`}
                    className="rounded-lg p-4 text-start transition-colors"
                    style={{ border: `1px solid ${c.border}`, background: c.card }}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <Droplets size={16} strokeWidth={1.5} style={{ color: c.sec }} aria-hidden="true" />
                      <span className="text-[13px] flex-1" style={{ fontWeight: 500, color: c.text }}>
                        {group.zoneName}
                      </span>
                      <span
                        aria-hidden="true"
                        className={`w-2 h-2 rounded-full ${allOnline ? connectionDot("ONLINE") : connectionDot("OFFLINE")}`}
                      />
                    </div>

                    <p className="text-[18px]" style={{ fontFamily: "JetBrains Mono", color: c.text }}>
                      {group.sensors.length}
                      <span className="text-[11px] ms-1" style={{ fontFamily: font, color: c.sec }}>
                        {sh.sensorsCount}
                      </span>
                    </p>

                    <div className="flex items-center gap-3 mt-2 text-[11px]" style={{ color: c.sec }}>
                      <span className="flex items-center gap-1.5">
                        <Radio size={11} strokeWidth={1.5} aria-hidden="true" />
                        {group.onlineCount} {sh.online}
                      </span>
                      {group.offlineCount > 0 && (
                        <span style={{ color: c.crit }}>
                          {group.offlineCount} {sh.offline}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {errorLogSection}
    </div>
  );
}
