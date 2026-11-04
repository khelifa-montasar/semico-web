import { useState } from "react";
import { useNavigate } from "react-router";
import { Leaf, Cloud, CloudRain, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTheme } from "../../contexts/ThemeContext";
import { LivingWaveGauge } from "../LivingWaveGauge";
import { tok } from "../../theme/tokens";
import { farmDateLabel } from "../../../lib/time";
import { useSensors, useSystemHealth } from "../../../features/systemHealth/useSystemHealth";
import { useWeather, weatherDescription } from "../../../features/dashboard/useWeather";
import { useFarm } from "../../../features/farms/useFarms";
import { useFarmSettings } from "../../../features/settings/useSettings";
import { useRealtimeAlerts } from "../../../features/realtime/useRealtime";
import { dashboardCriticalCount } from "../../../features/realtime/events";
import { FarmMap } from "../../../features/map/FarmMap";
import { toFarmMapData } from "../../../features/map/mapData";
import {
  useIrrigate,
  useLatestTelemetry,
  useTodaySaving,
  useZones,
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
  const navigate = useNavigate();

  const latest = useLatestTelemetry();
  const saving = useTodaySaving();
  const health = useSystemHealth();
  const sensors = useSensors();
  const zones = useZones();
  const farm = useFarm();
  const realtimeAlerts = useRealtimeAlerts(farm.data?.id);
  const farmSettings = useFarmSettings(farm.data?.id);
  const weather = useWeather(farm.data?.latitude, farm.data?.longitude);
  const irrigate = useIrrigate();

  const currentMoisture = latest.data?.rootMoisture ?? 0;

  const valveIsOpen = latest.data?.valveState === "OPEN";
  const valveLabel = valveIsOpen ? d.valveOpen : d.valveClosed;

  // ── Critical alerting ──────────────────────────────────────────────────────
  const criticalCount = dashboardCriticalCount(realtimeAlerts.data, health.data, latest.data, zones.data);

  // Both farm maps use the same live zone/sensor projection and cache-backed viewport.
  const { zones: mapZones, sensors: mapSensors } = toFarmMapData(zones.data ?? [], sensors.data ?? []);

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
      {/* ── Critical alert banner ─────────────────────────────────────────────
          Non-dismissible and first in the document: a critical fault is the one thing on this page
          a farmer must not scroll past. It routes to System Health, which is where the detail and
          the remediation live. */}
      {criticalCount > 0 && (
        <button
          type="button"
          aria-live="assertive"
          onClick={() => navigate("/dashboard/system-health")}
          className="w-full flex items-center gap-3 rounded-lg px-4 py-3 mb-6 text-start transition-colors"
          style={{
            background: isDark ? "rgba(248,81,73,0.12)" : "#FEF2F2",
            border: `1px solid ${isDark ? "#F85149" : "#FCA5A5"}`,
            color: isDark ? "#FF7B72" : "#B91C1C",
            fontFamily: font,
          }}
        >
          <AlertTriangle size={18} strokeWidth={1.5} aria-hidden="true" />
          <span className="text-[13px]" style={{ fontWeight: 500 }}>
            {d.criticalBannerTitle} ({criticalCount})
          </span>
          <span className="text-[12px] ms-auto underline underline-offset-2">
            {d.criticalBannerAction}
          </span>
        </button>
      )}

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

      {/* ── Live field map ────────────────────────────────────────────────── */}
      <Card style={cardStyle} className="mb-6">
        <h2 className="text-[16px] mb-4" style={{ fontWeight: 500, color: c.text }}>
          {d.liveMap}
        </h2>
        {mapZones.length === 0 ? (
          <p className="text-[12px] py-10 text-center" style={{ color: c.sec }}>
            {d.mapNoZones}
          </p>
        ) : (
          <FarmMap
            zones={mapZones}
            sensors={mapSensors}
            height={380}
            boundary={farm.data?.boundary ?? null}
            center={farm.data?.latitude != null && farm.data.longitude != null
              ? [farm.data.latitude, farm.data.longitude]
              : undefined}
            farmId={farm.data?.id}
            landAreaHa={farm.data?.landAreaHa}
            zoneCount={farmSettings.data?.zoneCount}
            sensorsPerZone={farmSettings.data?.sensorsPerZone}
          />
        )}
      </Card>

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

            {weather.data ? (
              <div className="py-2" aria-live="polite">
                <div className="flex items-center gap-3">
                  <CloudRain size={28} strokeWidth={1.5} style={{ color: c.blue }} aria-hidden="true" />
                  <div>
                    <p className="text-[30px] leading-none" style={{ fontFamily: "JetBrains Mono", color: c.text }}>
                      {Math.round(weather.data.temperatureC)}°C
                    </p>
                    <p className="text-[12px] mt-1" style={{ color: c.sec }}>
                      {weatherDescription(weather.data.weatherCode)}
                    </p>
                  </div>
                </div>
                <p className="text-[11px] mt-3" style={{ color: c.sec }}>
                  {d.weatherFeelsLike} {Math.round(weather.data.apparentTemperatureC)}°C · {d.weatherRain} {weather.data.precipitationMm} mm
                </p>
                <p className="text-[11px] mt-1" style={{ color: c.sec }}>
                  {d.weatherHumidity} {Math.round(weather.data.humidityPct)}% · {d.weatherWind} {Math.round(weather.data.windSpeedKmh)} km/h
                </p>
                <p className="text-[10px] mt-3" style={{ fontFamily: "JetBrains Mono", color: c.sec }}>
                  {d.weatherUpdated} {weather.data.time.replace("T", " ")}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-7 text-center" aria-live="polite">
                <CloudRain size={28} strokeWidth={1.5} style={{ color: c.sec, opacity: 0.55 }} aria-hidden="true" />
                <p className="text-[12px] max-w-[220px]" style={{ fontFamily: font, color: c.sec, lineHeight: 1.5 }}>
                  {weather.isLoading ? d.weatherLoading : weather.isError ? d.weatherError : d.weatherUnavailable}
                </p>
              </div>
            )}

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
