import type { SensorZoneGroup, Zone } from "@semico/shared";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { useTokens } from "@/app/hooks/useTokens";

export function FieldHistoryPicker({
  zones,
  sensors,
  onSelectZone,
  onSelectSensor,
}: {
  zones: Zone[];
  sensors: SensorZoneGroup[];
  onSelectZone: (id: string) => void;
  onSelectSensor: (id: string, zoneId: string) => void;
}) {
  const { t } = useLanguage();
  const colors = useTokens();
  return (
    <details className="mt-3">
      <summary
        className="cursor-pointer min-h-11 py-3 text-xs"
        style={{ color: colors.sec }}
      >
        {t.fieldHistory.browse}
      </summary>
      <div className="grid sm:grid-cols-2 gap-3">
        {zones.map((zone) => (
          <div
            key={zone.id}
            className="rounded-lg p-2"
            style={{ border: `1px solid ${colors.border}` }}
          >
            <button
              type="button"
              onClick={() => onSelectZone(zone.id)}
              aria-haspopup="dialog"
              className="w-full min-h-11 text-start px-2 text-sm"
              style={{ color: colors.text }}
            >
              {zone.name}
            </button>
            <div className="flex flex-wrap gap-2">
              {(
                sensors.find((group) => group.zoneId === zone.id)?.sensors ?? []
              ).map((sensor) => (
                <button
                  key={sensor.id}
                  type="button"
                  aria-haspopup="dialog"
                  onClick={() => onSelectSensor(sensor.id, zone.id)}
                  className="rounded-lg min-h-11 px-3 text-xs"
                  style={{ color: colors.text, background: colors.activeBg }}
                >
                  {sensor.key} ·{" "}
                  {sensor.batteryPct == null ? "—" : `${sensor.batteryPct}%`}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
