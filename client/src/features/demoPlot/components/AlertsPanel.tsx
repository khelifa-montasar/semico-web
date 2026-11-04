import { AlertTriangle, Info, ShieldAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { useTokens } from "@/app/hooks/useTokens";
import { activeAlerts } from "../engine/alerts";
import { ALERT_COPY_KEY, SEVERITY_RANK, SEVERITY_TOKEN, clockLabel } from "../format";
import type { Alert, AlertSeverity } from "../types";

/**
 * The alerts panel.
 *
 * Sorted by severity first and recency second — a critical irrigation failure must not be pushed
 * below a cosmetic sensor warning merely because the warning fired later.
 */

const SEVERITY_ICON: Record<AlertSeverity, LucideIcon> = {
  critical: ShieldAlert,
  warning: AlertTriangle,
  info: Info,
};

export function AlertsPanel({ alerts, zones }: { alerts: Alert[]; zones: { id: string; label: string }[] }) {
  const { t, font } = useLanguage();
  const c = useTokens();
  const d = t.demoPlot.alerts;

  const zoneLabel = (zoneId: string) => zones.find((zone) => zone.id === zoneId)?.label ?? zoneId;

  const open = activeAlerts(alerts).sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    return bySeverity !== 0 ? bySeverity : b.raisedAtMinute - a.raisedAtMinute;
  });

  return (
    <div
      className="flex flex-col rounded-xl h-full"
      style={{ border: `1px solid ${c.border}`, background: c.card, fontFamily: font }}
    >
      <div className="px-6 py-4" style={{ borderBottom: `1px solid ${c.border}` }}>
        <h3 className="text-[14px]" style={{ fontWeight: 500, color: c.text }}>
          {d.title}
        </h3>
      </div>

      {open.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-6 py-10">
          <p className="text-[13px] text-center" style={{ color: c.sec, lineHeight: 1.6 }}>
            {d.empty}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col">
          {open.map((alert, index) => {
            const copy = ALERT_COPY_KEY[alert.type];
            const colour = c[SEVERITY_TOKEN[alert.severity]];
            const Icon = SEVERITY_ICON[alert.severity];

            return (
              <li
                key={alert.id}
                className="px-6 py-4 flex items-start gap-3"
                style={{ borderTop: index > 0 ? `1px solid ${c.border}` : undefined }}
              >
                {/* Severity travels as an icon AND a colour AND the action line below — never
                    colour alone, which is what the palette check requires. */}
                <Icon size={15} strokeWidth={1.5} style={{ color: colour, marginTop: 2, flexShrink: 0 }} />

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[13px]" style={{ color: c.text, fontWeight: 500 }}>
                      {d[copy.title]}
                    </span>
                    <span
                      className="text-[11px]"
                      style={{ fontFamily: "JetBrains Mono", color: c.sec }}
                    >
                      {zoneLabel(alert.zoneId)}
                    </span>
                    <span
                      className="text-[11px] ms-auto"
                      style={{ fontFamily: "JetBrains Mono", color: c.sec, direction: "ltr", unicodeBidi: "isolate" }}
                    >
                      {clockLabel(alert.raisedAtMinute)}
                    </span>
                  </div>
                  <p className="text-[12px] mt-1" style={{ color: c.sec, lineHeight: 1.5 }}>
                    {d[copy.action]}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
