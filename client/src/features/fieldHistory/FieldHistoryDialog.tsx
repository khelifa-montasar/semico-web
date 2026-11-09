import { useEffect, useId, useRef, type ReactNode } from "react";
import { RefreshCw, X } from "lucide-react";
import { FARM_TIMEZONE, type FieldHistory } from "@semico/shared";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { useTokens } from "@/app/hooks/useTokens";
import { HistoryChart } from "./HistoryChart";
import { useFieldHistory, type FieldHistorySelection } from "./useFieldHistory";

function Metric({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: ReactNode;
}) {
  const colors = useTokens();
  return (
    <section
      className="rounded-lg p-4"
      style={{ border: `1px solid ${colors.border}` }}
    >
      <h3 className="text-xs mb-2" style={{ color: colors.sec }}>
        {label}
      </h3>
      <p
        className="text-xl"
        style={{ fontFamily: "JetBrains Mono", overflowWrap: "anywhere" }}
      >
        {value}
      </p>
      {children}
    </section>
  );
}

export function FieldHistoryContent({
  data,
  onSelectSensor,
}: {
  data: FieldHistory;
  onSelectSensor: (id: string, zoneId: string) => void;
}) {
  const { t, lang } = useLanguage();
  const colors = useTokens();
  const copy = t.fieldHistory;
  const dateTime = new Intl.DateTimeFormat(lang === "ar" ? "ar-DZ" : "en-GB", {
    timeZone: FARM_TIMEZONE,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const time = (value: string) => dateTime.format(new Date(value));
  const batteries = data.sensors.flatMap((sensor) =>
    sensor.batteryPct == null ? [] : [sensor.batteryPct],
  );
  const battery = data.sensor
    ? data.sensor.batteryPct
    : batteries.length
      ? batteries.reduce((sum, value) => sum + value, 0) / batteries.length
      : null;
  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs" style={{ color: colors.sec }}>
        {copy.period}: {time(data.window.from)} — {time(data.window.to)} ·{" "}
        {FARM_TIMEZONE}
      </p>
      {data.sensor && data.telemetryScope === "zone" && (
        <p
          className="text-xs rounded-lg p-3"
          role="note"
          style={{ color: colors.sec, background: colors.activeBg }}
        >
          {copy.zoneFallback}
        </p>
      )}
      <div className="grid sm:grid-cols-3 gap-3">
        <Metric
          label={
            data.sensor && data.telemetryScope === "zone"
              ? copy.zoneMoisture
              : copy.moisture
          }
          value={
            data.latestMoisture
              ? `${data.latestMoisture.value.toFixed(1)}%`
              : "—"
          }
        >
          <p className="text-xs mt-2" style={{ color: colors.sec }}>
            {data.latestMoisture
              ? time(data.latestMoisture.recordedAt)
              : copy.noMeasurement}
          </p>
        </Metric>
        <Metric
          label={data.sensor ? copy.battery : copy.averageBattery}
          value={battery == null ? "—" : `${Math.round(battery)}%`}
        >
          <p className="text-xs mt-2" style={{ color: colors.sec }}>
            {data.sensor
              ? `${copy.lastSeen}: ${time(data.sensor.lastSeenAt)}`
              : copy.lastKnownBattery}
          </p>
        </Metric>
        <Metric
          label={copy.lastWatering}
          value={data.lastWatering ? time(data.lastWatering.executedAt) : "—"}
        >
          <p className="text-xs mt-2" style={{ color: colors.sec }}>
            {data.lastWatering
              ? `${data.lastWatering.durationMin == null ? copy.durationUnknown : `${data.lastWatering.durationMin} ${copy.minutes}`}${data.lastWatering.executedAt < data.window.from ? ` · ${copy.outsideWindow}` : ""}`
              : copy.noWatering}
          </p>
        </Metric>
      </div>
      <p className="text-xs" style={{ color: colors.sec }}>
        {copy.valve}:{" "}
        {data.zone.valveState === "OPEN"
          ? t.dashboard.valveOpen
          : t.dashboard.valveClosed}{" "}
        · {copy.receiptNote}
      </p>
      <section>
        <h3 className="text-sm font-medium mb-2">{copy.chartTitle}</h3>
        <HistoryChart points={data.points} />
      </section>
      <section>
        <h3 className="text-sm font-medium mb-3">{copy.sensors}</h3>
        {data.sensors.length ? (
          <div className="grid sm:grid-cols-2 gap-2">
            {data.sensors.map((sensor) => (
              <button
                key={sensor.id}
                type="button"
                onClick={() => onSelectSensor(sensor.id, sensor.zoneId)}
                className="rounded-lg p-3 text-start min-h-11"
                aria-pressed={data.sensor?.id === sensor.id}
                style={{
                  border: `1px solid ${colors.border}`,
                  background:
                    data.sensor?.id === sensor.id
                      ? colors.activeBg
                      : "transparent",
                }}
              >
                <span className="flex justify-between gap-2 text-sm">
                  <span>{sensor.key}</span>
                  <span>
                    {sensor.batteryPct == null ? "—" : `${sensor.batteryPct}%`}
                  </span>
                </span>
                <span
                  className="text-xs block mt-1"
                  style={{ color: colors.sec }}
                >
                  {sensor.connection === "ONLINE"
                    ? t.systemHealth.online
                    : t.systemHealth.offline}{" "}
                  · {time(sensor.lastSeenAt)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm" style={{ color: colors.sec }}>
            {copy.noSensors}
          </p>
        )}
      </section>
      <section>
        <h3 className="text-sm font-medium mb-3">
          {copy.warnings} ({data.warningCount})
        </h3>
        {!data.warnings.length ? (
          <p className="text-sm" style={{ color: colors.sec }}>
            {copy.noWarnings}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.warnings.map((warning) => (
              <li
                key={warning.id}
                className="rounded-lg p-3 text-sm"
                style={{ border: `1px solid ${colors.border}` }}
              >
                <p>{warning.message[lang]}</p>
                <p className="text-xs mt-1" style={{ color: colors.sec }}>
                  {time(warning.occurredAt)} ·{" "}
                  {warning.location.sensorKey ??
                    warning.location.zoneName ??
                    copy.farmWide}
                </p>
                {warning.action && (
                  <p className="text-xs mt-1" style={{ color: colors.sec }}>
                    {warning.action[lang]}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        {data.warningCount > data.warnings.length && (
          <p className="text-xs mt-2" style={{ color: colors.sec }}>
            {copy.warningLimit
              .replace("{shown}", String(data.warnings.length))
              .replace("{total}", String(data.warningCount))}
          </p>
        )}
      </section>
    </div>
  );
}

export function FieldHistoryDialog({
  selection,
  onClose,
  onSelectSensor,
}: {
  selection: FieldHistorySelection;
  onClose: () => void;
  onSelectSensor: (id: string, zoneId: string) => void;
}) {
  const { t, font, isRTL } = useLanguage();
  const colors = useTokens();
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const history = useFieldHistory(selection);
  const copy = t.fieldHistory;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener =
      document.activeElement instanceof HTMLElement ||
      document.activeElement instanceof SVGElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  useEffect(() => {
    closeRef.current?.focus();
  }, [selection.kind, selection.id]);
  const data =
    history.data?.farmId === selection.farmId &&
    history.data.zone.id === selection.zoneId &&
    (selection.kind === "zone" || history.data.sensor?.id === selection.id)
      ? history.data
      : undefined;
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-modal="true"
      dir={isRTL ? "rtl" : "ltr"}
      className="fixed inset-0 m-auto p-0 rounded-xl open:flex open:flex-col backdrop:bg-black/50"
      style={{
        width: "min(94vw, 900px)",
        maxHeight: "90dvh",
        color: colors.text,
        background: colors.card,
        border: `1px solid ${colors.border}`,
        fontFamily: font,
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
    >
      <header
        className="flex items-center gap-3 px-5 py-4 shrink-0"
        style={{ borderBottom: `1px solid ${colors.border}` }}
      >
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-lg font-medium truncate">
            {data?.sensor?.key ?? data?.zone.name ?? copy.title}
          </h2>
          <p className="text-xs" style={{ color: colors.sec }}>
            {copy.title}
            {data?.sensor ? ` · ${data.zone.name}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void history.refetch()}
          aria-label={copy.refresh}
          disabled={history.isFetching}
          className="min-h-11 min-w-11 flex items-center justify-center rounded-lg disabled:opacity-50"
        >
          <RefreshCw size={18} aria-hidden="true" />
        </button>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={t.common.close}
          className="min-h-11 min-w-11 flex items-center justify-center rounded-lg"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <div
        className="p-5 overflow-y-auto min-h-0"
        aria-busy={history.isFetching}
      >
        {history.isPending && (
          <p role="status" className="py-8 text-center">
            {copy.loading}
          </p>
        )}
        {(history.isError || (history.data && !data)) && (
          <p
            role="alert"
            className="mb-4 text-sm"
            style={{ color: colors.crit }}
          >
            {data ? copy.refreshError : copy.loadError}
          </p>
        )}
        {data && (
          <FieldHistoryContent data={data} onSelectSensor={onSelectSensor} />
        )}
      </div>
    </dialog>
  );
}
