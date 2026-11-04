import { useEffect, useRef } from "react";
import { X, Droplets, Thermometer, History, BellOff } from "lucide-react";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { useTokens } from "@/app/hooks/useTokens";
import { alertsForZone } from "../engine/alerts";
import { zoneStatus } from "../config";
import {
  ALERT_COPY_KEY,
  SEVERITY_RANK,
  SEVERITY_TOKEN,
  ZONE_STATUS_KEY,
  clockLabel,
} from "../format";
import { MoistureSparkline } from "./MoistureSparkline";
import type { Alert, Zone } from "../types";

/**
 * The zone drawer — exactly five blocks, as specified.
 *
 * Opened by clicking a zone polygon or one of its sensors; when a sensor was the trigger its id is
 * shown as a caption on the live-values block rather than added as a sixth block, so the drawer's
 * shape stays as designed.
 */

const STATUS_TOKEN = {
  optimal: "green",
  low: "warn",
  critical: "crit",
} as const;

function Block({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  const c = useTokens();

  return (
    <section className="px-6 py-5" style={{ borderTop: `1px solid ${c.border}` }}>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h4
          className="text-[11px] tracking-wider uppercase"
          style={{ fontFamily: "JetBrains Mono", color: c.sec }}
        >
          {title}
        </h4>
      </div>
      {children}
    </section>
  );
}

export function ZoneDrawer({
  zone,
  alerts,
  highlightedSensorId,
  onClose,
}: {
  zone: Zone;
  alerts: Alert[];
  highlightedSensorId: string | null;
  onClose: () => void;
}) {
  const { t, font } = useLanguage();
  const c = useTokens();
  const d = t.demoPlot.drawer;

  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // `onClose` is an inline arrow at the call site, so its identity changes on every parent render.
  // Holding it in a ref is what keeps the effect below from re-running — and re-stealing focus — on
  // each tick of the simulation, which repaints the page once a second.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Keyboard and focus handling for the dialog.
  //
  // Keyed on the zone rather than on `onClose`, and with the listener attached to the document: the
  // drawer has no focusable ancestor in common with the page behind it, so a listener on the drawer
  // itself would miss Escape whenever focus had escaped the aside.
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;

      // A minimal focus trap. `aria-modal` promises the content behind is unreachable, and it is
      // only true if Tab cannot walk out of the drawer into it.
      const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    // Focus moves to the close button on open: it is the drawer's primary affordance, and focusing
    // it is what stops the next Tab from continuing from wherever the page behind was left.
    closeRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // And back to whatever opened the drawer, so the keyboard user's place in the plot is kept.
      previouslyFocused?.focus();
    };
  }, [zone.id]);

  const status = zoneStatus(zone.moisture);
  const statusColour = c[STATUS_TOKEN[status]];

  const zoneAlerts = alertsForZone(alerts, zone.id).sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    return bySeverity !== 0 ? bySeverity : b.raisedAtMinute - a.raisedAtMinute;
  });

  return (
    <>
      {/* Overlay: clicking away closes, which is what a drawer is expected to do. */}
      <div
        className="fixed inset-0 z-[1000]"
        style={{ background: "rgba(0,0,0,0.25)" }}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        ref={drawerRef}
        className="fixed z-[1001] top-0 bottom-0 w-full max-w-[400px] overflow-y-auto"
        // Logical inset so the drawer enters from the inline-end edge and mirrors under RTL.
        style={{
          insetInlineEnd: 0,
          background: c.card,
          borderInlineStart: `1px solid ${c.border}`,
          fontFamily: font,
        }}
        role="dialog"
        // Tells assistive technology the content behind the overlay is inert, which the focus trap in
        // the effect above makes true rather than merely asserted.
        aria-modal="true"
        // Focusable so the dialog itself can hold focus if it ever contains nothing focusable.
        tabIndex={-1}
        aria-label={`${zone.label} details`}
      >
        {/* Block 1 — header: zone id and status chip */}
        <header className="px-6 py-5 flex items-center gap-3">
          <span
            className="text-[20px]"
            style={{ fontFamily: "JetBrains Mono", color: c.text, fontWeight: 400 }}
          >
            {zone.label}
          </span>
          <span
            className="px-2.5 py-1 rounded-full text-[11px]"
            style={{
              border: `1px solid ${statusColour}`,
              color: statusColour,
              background: `color-mix(in srgb, ${statusColour} 10%, transparent)`,
            }}
          >
            {d[ZONE_STATUS_KEY[status]]}
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={d.close}
            className="ms-auto w-8 h-8 flex items-center justify-center rounded-full transition-colors"
            style={{ color: c.sec }}
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </header>

        {/* Block 2 — live values */}
        <Block
          icon={<Droplets size={13} strokeWidth={1.5} style={{ color: c.sec }} />}
          title={d.soilMoisture}
        >
          <div className="flex items-baseline gap-4">
            <span
              className="text-[32px]"
              style={{ fontFamily: "JetBrains Mono", color: c.text, lineHeight: 1, direction: "ltr", unicodeBidi: "isolate" }}
            >
              {zone.moisture.toFixed(1)}%
            </span>
            <span className="text-[13px] flex items-center gap-1.5" style={{ color: c.sec }}>
              <Thermometer size={13} strokeWidth={1.5} />
              <span style={{ fontFamily: "JetBrains Mono", direction: "ltr", unicodeBidi: "isolate" }}>
                {zone.soilTempC.toFixed(1)} °C
              </span>
            </span>
          </div>
          {/* Where the click came from, without adding a sixth block. */}
          {highlightedSensorId && (
            <p className="text-[11px] mt-3" style={{ fontFamily: "JetBrains Mono", color: c.sec }}>
              {d.sensor}: {highlightedSensorId}
            </p>
          )}
        </Block>

        {/* Block 3 — last irrigation */}
        <Block
          icon={<History size={13} strokeWidth={1.5} style={{ color: c.sec }} />}
          title={d.lastIrrigation}
        >
          {zone.lastIrrigation ? (
            <p className="text-[13px]" style={{ color: c.text }}>
              <span style={{ fontFamily: "JetBrains Mono", direction: "ltr", unicodeBidi: "isolate" }}>
                {clockLabel(zone.lastIrrigation.atMinute)}
              </span>
              <span style={{ color: c.sec }}>
                {" · "}
                {d.duration}{" "}
                <span style={{ fontFamily: "JetBrains Mono", direction: "ltr", unicodeBidi: "isolate" }}>
                  {zone.lastIrrigation.durationMinutes} {t.demoPlot.kpi.minutesShort}
                </span>
              </span>
            </p>
          ) : (
            <p className="text-[13px]" style={{ color: c.sec }}>
              {d.neverIrrigated}
            </p>
          )}
        </Block>

        {/* Block 4 — 24-hour chart */}
        <Block
          icon={<History size={13} strokeWidth={1.5} style={{ color: c.sec }} />}
          title={d.history}
        >
          <MoistureSparkline values={zone.history} />
        </Block>

        {/* Block 5 — alerts for this zone */}
        <Block
          icon={<BellOff size={13} strokeWidth={1.5} style={{ color: c.sec }} />}
          title={d.zoneAlerts}
        >
          {zoneAlerts.length === 0 ? (
            <p className="text-[13px]" style={{ color: c.sec }}>
              {d.noZoneAlerts}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {zoneAlerts.map((alert) => {
                const copy = ALERT_COPY_KEY[alert.type];
                const colour = c[SEVERITY_TOKEN[alert.severity]];
                return (
                  <li key={alert.id} className="flex items-baseline gap-2 text-[12px]">
                    <span
                      aria-hidden="true"
                      style={{ width: 6, height: 6, borderRadius: 999, background: colour, flexShrink: 0 }}
                    />
                    <span style={{ color: c.text }}>{t.demoPlot.alerts[copy.title]}</span>
                    <span
                      className="ms-auto"
                      style={{ fontFamily: "JetBrains Mono", color: c.sec, direction: "ltr", unicodeBidi: "isolate" }}
                    >
                      {clockLabel(alert.raisedAtMinute)}
                    </span>
                    {/* A resolved alert is still history worth showing, so it is labelled rather
                        than hidden. */}
                    {!alert.active && <span style={{ color: c.sec }}>·</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </Block>
      </aside>
    </>
  );
}
