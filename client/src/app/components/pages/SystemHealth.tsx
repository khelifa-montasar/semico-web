import { useState } from "react";
import { Cpu, Radio, Droplets, Zap, Wifi, Gauge, type LucideIcon } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTokens } from "../../hooks/useTokens";
import { useLocalized } from "../../hooks/useLocalized";
import { farmTime } from "../../../lib/time";
import { useErrorLogs, useSystemHealth } from "../../../features/systemHealth/useSystemHealth";

/**
 * Icons are keyed by the component's stable `key` rather than by array position.
 *
 * The previous version indexed a fixed array, so adding a component server-side would have shifted
 * every icon after it. An unknown key now falls back to the generic icon instead of mislabelling.
 */
const COMPONENT_ICONS: Record<string, LucideIcon> = {
  CONTROLLER: Cpu,
  MOISTURE_SENSOR_A: Droplets,
  MOISTURE_SENSOR_B: Droplets,
  LORA_GATEWAY: Radio,
  BATTERY: Zap,
  FLOW_METER: Gauge,
  MODULE_4G: Wifi,
};

// Status dots — include dark: variants so the .dark class on <html> toggles them
const statusDot: Record<string, string> = {
  green: "bg-[#00A859] dark:bg-[#3FB950]",
  orange: "bg-[#FF6B35] dark:bg-[#D29922]",
  red: "bg-[#EF4444] dark:bg-[#F85149]",
};

export function SystemHealth() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { t, font } = useLanguage();
  const L = useLocalized();
  const c = useTokens();
  const sh = t.systemHealth;

  const health = useSystemHealth();
  const errors = useErrorLogs();

  const components = health.data?.components ?? [];
  const errorLogs = errors.data ?? [];

  return (
    <div className="flex flex-col gap-8" style={{ fontFamily: font }}>
      {health.isError && (
        <p className="text-[13px]" style={{ fontFamily: font, color: c.crit }}>
          {health.error instanceof Error ? health.error.message : "Could not load system health."}
        </p>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {components.map((comp) => {
          const Icon = COMPONENT_ICONS[comp.key] ?? Cpu;
          const dot = statusDot[comp.status.toLowerCase()] ?? statusDot.green;
          const isOpen = expanded === comp.id;

          return (
            <button
              key={comp.id}
              onClick={() => setExpanded(isOpen ? null : comp.id)}
              className="rounded-lg p-4 text-left transition-colors"
              style={{
                border: `1px solid ${isOpen ? "rgba(63,185,80,0.4)" : c.border}`,
                background: c.card,
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                <Icon size={18} strokeWidth={1.5} style={{ color: c.sec }} />
                <span
                  className="text-[13px] flex-1"
                  style={{ fontFamily: font, fontWeight: 500, color: c.text }}
                >
                  {L(comp.name)}
                </span>
                <div className={`w-2 h-2 rounded-full ms-auto ${dot}`} />
              </div>
              <p className="text-[18px]" style={{ fontFamily: "JetBrains Mono", color: c.text }}>
                {comp.value}
              </p>
              {isOpen && comp.detail && (
                <p
                  className="mt-3 text-[12px]"
                  style={{
                    fontFamily: font,
                    lineHeight: 1.6,
                    color: c.sec,
                    borderTop: `1px solid ${c.border}`,
                    paddingTop: 12,
                  }}
                >
                  {L(comp.detail)}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* Error Log */}
      <div>
        <p className="text-[13px] mb-3" style={{ fontFamily: font, color: c.sec }}>
          {sh.errorLog}
        </p>
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${c.border}` }}>
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
                  {sh.timeCol}
                </th>
                <th
                  className="text-start px-4 py-3"
                  style={{ fontWeight: 400, fontFamily: font, fontSize: 11, color: c.sec }}
                >
                  {sh.componentCol}
                </th>
                <th
                  className="text-start px-4 py-3 hidden md:table-cell"
                  style={{ fontWeight: 400, fontFamily: font, fontSize: 11, color: c.sec }}
                >
                  {sh.messageCol}
                </th>
                <th
                  className="text-start px-4 py-3 hidden lg:table-cell"
                  style={{ fontWeight: 400, fontFamily: font, fontSize: 11, color: c.sec }}
                >
                  {sh.actionCol}
                </th>
              </tr>
            </thead>
            <tbody>
              {errorLogs.length === 0 && (
                <tr>
                  <td
                    className="px-4 py-6"
                    colSpan={4}
                    style={{ fontFamily: font, color: c.sec }}
                  >
                    {errors.isLoading ? "…" : "No errors logged."}
                  </td>
                </tr>
              )}

              {errorLogs.map((e) => (
                <tr key={e.id} style={{ borderTop: `1px solid ${c.border}` }}>
                  <td
                    className="px-4 py-3"
                    style={{ fontFamily: "JetBrains Mono", color: c.text }}
                  >
                    {farmTime(e.occurredAt)}
                  </td>
                  <td className="px-4 py-3" style={{ fontFamily: font, color: c.text }}>
                    {L(e.componentName)}
                  </td>
                  <td
                    className="px-4 py-3 hidden md:table-cell"
                    style={{ fontFamily: font, color: c.sec }}
                  >
                    {L(e.message)}
                  </td>
                  <td
                    className="px-4 py-3 hidden lg:table-cell"
                    style={{ fontFamily: font, color: c.blue }}
                  >
                    {e.action ? L(e.action) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
