import { useState } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTokens } from "../../hooks/useTokens";
import { useFarm } from "../../../features/farms/useFarms";
import { useFarmSettings } from "../../../features/settings/useSettings";
import { useZones, useLatestTelemetry } from "../../../features/dashboard/useDashboard";
import { useSensors, useSystemHealth } from "../../../features/systemHealth/useSystemHealth";
import { FarmMap } from "../../../features/map/FarmMap";
import { toFarmMapData } from "../../../features/map/mapData";
import { farmTime } from "../../../lib/time";

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const c = useTokens();
  return (
    <div className="rounded-lg p-3 min-w-0" style={{ border: `1px solid ${c.border}` }}>
      <p className="text-[10px] tracking-wider uppercase mb-1" style={{ fontFamily: "JetBrains Mono", color: c.sec }}>
        {label}
      </p>
      <p className="text-[18px] truncate" style={{ fontFamily: "JetBrains Mono", color: c.text, direction: "ltr", unicodeBidi: "isolate" }}>
        {value}
      </p>
      {hint && <p className="text-[10px] mt-0.5" style={{ color: c.sec }}>{hint}</p>}
    </div>
  );
}

export function TechnicalDiagnostics() {
  const { t, font } = useLanguage();
  const c = useTokens();
  const sh = t.systemHealth;
  const tech = t.demoPlot.tech;
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const farm = useFarm();
  const farmSettings = useFarmSettings(farm.data?.id);
  const zones = useZones();
  const sensors = useSensors();
  const health = useSystemHealth();
  const latest = useLatestTelemetry();

  const zoneRows = zones.data ?? [];
  const sensorGroups = sensors.data ?? [];
  const sensorRows = sensorGroups.flatMap((group) => group.sensors);
  const onlineSensors = sensorRows.filter((sensor) => sensor.connection === "ONLINE").length;
  const batteries = sensorRows.flatMap((sensor) => sensor.batteryPct == null ? [] : [sensor.batteryPct]);
  const averageBattery = batteries.length
    ? `${Math.round(batteries.reduce((sum, value) => sum + value, 0) / batteries.length)}%`
    : "—";
  const device = health.data?.deviceStatus;
  const { zones: mapZones, sensors: mapSensors } = toFarmMapData(zoneRows, sensorGroups);

  return (
    <div className="flex flex-col gap-6" style={{ fontFamily: font }}>
      <div className="grid lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)] gap-6 items-start">
        <section className="rounded-lg p-5" style={{ border: `1px solid ${c.border}`, background: c.card }}>
          <h2 className="text-[16px] mb-4" style={{ fontWeight: 500, color: c.text }}>{t.dashboard.liveMap}</h2>
          {mapZones.length ? (
            <FarmMap
              zones={mapZones}
              sensors={mapSensors}
              height={520}
              selectedZoneId={selectedZoneId}
              boundary={farm.data?.boundary ?? null}
              center={farm.data?.latitude != null && farm.data.longitude != null
                ? [farm.data.latitude, farm.data.longitude]
                : undefined}
              farmId={farm.data?.id}
              landAreaHa={farm.data?.landAreaHa}
              zoneCount={farmSettings.data?.zoneCount}
              sensorsPerZone={farmSettings.data?.sensorsPerZone}
              onSelectZone={setSelectedZoneId}
            />
          ) : (
            <p className="py-20 text-center text-[13px]" style={{ color: c.sec }}>
              {zones.isLoading ? "…" : t.dashboard.mapNoZones}
            </p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3 text-[11px]" style={{ color: c.sec }}>
            <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full" style={{ background: c.green }} />{sh.online} {sh.sensorCol.toLowerCase()}</span>
            <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full" style={{ background: c.crit }} />{sh.offline} {sh.sensorCol.toLowerCase()}</span>
          </div>
        </section>

        <section className="rounded-lg p-5" style={{ border: `1px solid ${c.border}`, background: c.card }}>
          <h2 className="text-[16px]" style={{ fontWeight: 500, color: c.text }}>{tech.title}</h2>
          <p className="text-[12px] mt-1 mb-4" style={{ color: c.sec }}>{tech.subtitle}</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <Metric label={tech.sensorsOnline} value={sensors.isLoading ? "…" : `${onlineSensors} / ${sensorRows.length}`} />
            <Metric label={tech.avgBattery} value={averageBattery} />
            <Metric
              label={sh.loraGateway}
              value={device ? (device.loraGatewayOnline ? sh.online : sh.offline) : "—"}
              hint={device?.loraUptimeMinutes != null ? `${sh.uptime}: ${device.loraUptimeMinutes} ${sh.mins}` : undefined}
            />
            <Metric label={sh.flowMeter} value={device?.flowRateLpm != null ? `${device.flowRateLpm.toFixed(1)} L/min` : "—"} />
          </div>

          <div className="mt-5">
            <h3 className="text-[11px] mb-2 tracking-wider uppercase" style={{ fontFamily: "JetBrains Mono", color: c.sec }}>
              {tech.modelParams}
            </h3>
            <div className="flex justify-between gap-4 py-2 text-[12px]" style={{ borderBottom: `1px solid ${c.divider}` }}>
              <span style={{ color: c.sec }}>{tech.controller}</span>
              <span style={{ color: c.text }}>{device ? (device.controllerOnline ? sh.online : sh.offline) : "—"}</span>
            </div>
            <div className="flex justify-between gap-4 py-2 text-[12px]" style={{ borderBottom: `1px solid ${c.divider}` }}>
              <span style={{ color: c.sec }}>{tech.firmware}</span>
              <span style={{ fontFamily: "JetBrains Mono", color: c.text }}>{device?.firmwareVersion ?? "—"}</span>
            </div>
            <div className="flex justify-between gap-4 py-2 text-[12px]" style={{ borderBottom: `1px solid ${c.divider}` }}>
              <span style={{ color: c.sec }}>{tech.radioSignal}</span>
              <span style={{ fontFamily: "JetBrains Mono", color: c.text }}>{device?.loraRssi != null ? `${device.loraRssi} dBm` : "—"}</span>
            </div>
            <div className="flex justify-between gap-4 py-2 text-[12px]" style={{ borderBottom: `1px solid ${c.divider}` }}>
              <span style={{ color: c.sec }}>{tech.soilTemperature}</span>
              <span style={{ fontFamily: "JetBrains Mono", color: c.text }}>{latest.data?.soilTempC != null ? `${latest.data.soilTempC.toFixed(1)}°C` : "—"}</span>
            </div>
            <div className="flex justify-between gap-4 py-2 text-[12px]">
              <span style={{ color: c.sec }}>{tech.lastReading}</span>
              <span style={{ fontFamily: "JetBrains Mono", color: c.text }}>{latest.data ? farmTime(latest.data.recordedAt) : "—"}</span>
            </div>
          </div>
          {(sensors.isError || health.isError || latest.isError) && (
            <p className="text-[11px] mt-3" style={{ color: c.crit }}>
              {sensors.error instanceof Error ? sensors.error.message : health.error instanceof Error ? health.error.message : latest.error instanceof Error ? latest.error.message : "Could not load diagnostics."}
            </p>
          )}
        </section>
      </div>

      <section className="rounded-lg p-5" style={{ border: `1px solid ${c.border}`, background: c.card }}>
        <h2 className="text-[14px] mb-3" style={{ fontWeight: 500, color: c.text }}>{sh.zonesTitle}</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {zoneRows.map((zone) => (
            <button
              key={zone.id}
              type="button"
              onClick={() => setSelectedZoneId((current) => current === zone.id ? null : zone.id)}
              aria-pressed={selectedZoneId === zone.id}
              className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-start"
              style={{ border: `1px solid ${c.border}`, background: selectedZoneId === zone.id ? c.activeBg : "transparent" }}
            >
              <span className="text-[12px]" style={{ color: c.text }}>{zone.name}</span>
              <span className="text-[11px]" style={{ fontFamily: "JetBrains Mono", color: c.sec }}>
                {zone.latestMoisture == null ? "—" : `${zone.latestMoisture.toFixed(1)}%`} · {zone.valveState}
              </span>
            </button>
          ))}
          {zones.isLoading && <p className="text-[12px]" style={{ color: c.sec }}>…</p>}
        </div>
      </section>
    </div>
  );
}
