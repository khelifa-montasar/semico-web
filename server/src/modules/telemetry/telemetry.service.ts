import type {
  DeviceStatus,
  ErrorLog,
  LatestTelemetry,
  MoisturePoint,
  SystemComponent,
  SystemHealthResponse,
  TelemetryQuery,
} from "@semico/shared";
import { ApiError } from "../../lib/ApiError.js";
import { loc, locOrNull } from "../../lib/localized.js";
import { farmDayKey, farmDayLabel, farmTimeLabel, rangeToDays } from "../../lib/time.js";
import { telemetryRepository } from "./telemetry.repository.js";
import { prisma } from "../../db/prisma.js";
import type { AuthContext } from "../../types/auth.js";

/**
 * Telemetry reads and the System Health view.
 *
 * Bucketing happens here rather than in the client: the farm timezone is a server-side concern,
 * and pre-aggregating means the dashboard receives a bounded series instead of thousands of raw
 * readings it would have to reduce itself.
 */

function requireFarmId(auth: AuthContext): string {
  if (!auth.farmId) throw ApiError.forbidden("You are not attached to a farm yet");
  return auth.farmId;
}

function windowFor(query: TelemetryQuery): { from: Date; to: Date } {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from
    ? new Date(query.from)
    : new Date(to.getTime() - rangeToDays(query.range) * 24 * 60 * 60 * 1000);
  return { from, to };
}

type ReadingRow = NonNullable<Awaited<ReturnType<typeof telemetryRepository.latest>>>;

function toLatest(reading: ReadingRow | null, zoneName: string | null): LatestTelemetry | null {
  if (!reading) return null;
  return {
    zoneId: reading.zoneId,
    zoneName,
    recordedAt: reading.recordedAt.toISOString(),
    rootMoisture: reading.rootMoisture,
    surfaceMoisture: reading.surfaceMoisture,
    soilTempC: reading.soilTempC,
    batteryPct: reading.batteryPct,
    flowRateLpm: reading.flowRateLpm,
    loraRssi: reading.loraRssi,
    valveState: (reading.valveState as LatestTelemetry["valveState"]) ?? null,
  };
}

/**
 * Reduces raw readings into chart points.
 *
 * Averaging within a bucket rather than sampling the first row keeps the line smooth when the
 * device reports more often than the chart's resolution.
 */
function bucketReadings(rows: ReadingRow[], interval: "hour" | "day"): MoisturePoint[] {
  const buckets = new Map<
    string,
    { at: Date; root: number[]; surface: number[] }
  >();

  for (const row of rows) {
    const key =
      interval === "day"
        ? farmDayKey(row.recordedAt)
        : `${farmDayKey(row.recordedAt)}T${row.recordedAt.getUTCHours()}`;

    const existing = buckets.get(key);
    if (existing) {
      if (row.rootMoisture !== null) existing.root.push(row.rootMoisture);
      if (row.surfaceMoisture !== null) existing.surface.push(row.surfaceMoisture);
      continue;
    }

    buckets.set(key, {
      at: row.recordedAt,
      root: row.rootMoisture !== null ? [row.rootMoisture] : [],
      surface: row.surfaceMoisture !== null ? [row.surfaceMoisture] : [],
    });
  }

  const mean = (values: number[]): number | null =>
    values.length === 0 ? null : Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);

  return [...buckets.values()]
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((bucket) => ({
      at: bucket.at.toISOString(),
      label: interval === "day" ? farmDayLabel(bucket.at) : farmTimeLabel(bucket.at),
      rootMoisture: mean(bucket.root) ?? 0,
      surfaceMoisture: mean(bucket.surface),
    }));
}

function toDeviceStatus(
  row: NonNullable<Awaited<ReturnType<typeof telemetryRepository.deviceStatus>>> | null,
): DeviceStatus | null {
  if (!row) return null;
  return {
    firmwareVersion: row.firmwareVersion,
    controllerOnline: row.controllerOnline,
    loraRssi: row.loraRssi,
    cellularStatus: row.cellularStatus,
    cellularOperator: row.cellularOperator,
    cellularSignal: row.cellularSignal,
    batteryPct: row.batteryPct,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const telemetryService = {
  /** Latest reading for the farm, or for one zone. Drives the dashboard gauge. */
  async latest(auth: AuthContext, zoneId?: string): Promise<LatestTelemetry | null> {
    const farmId = requireFarmId(auth);
    const reading = await telemetryRepository.latest(farmId, zoneId);

    if (!reading) return null;

    // A single lookup for the label. Scanning every zone just to name one would be an N+1 for
    // no reason.
    const zoneName = reading.zoneId
      ? ((
          await prisma.zone.findFirst({
            where: { id: reading.zoneId, farmId },
            select: { name: true },
          })
        )?.name ?? null)
      : null;

    return toLatest(reading, zoneName);
  },

  /** One latest reading per zone — the dashboard's per-zone list. */
  async latestPerZone(auth: AuthContext): Promise<LatestTelemetry[]> {
    const farmId = requireFarmId(auth);
    const rows = await telemetryRepository.latestPerZone(farmId);

    return rows
      .map((row) => toLatest(row.reading, row.zone.name))
      .filter((row): row is LatestTelemetry => row !== null);
  },

  /** The moisture series the dashboard chart and the analytics page draw. */
  async series(auth: AuthContext, query: TelemetryQuery): Promise<MoisturePoint[]> {
    const farmId = requireFarmId(auth);
    const window = windowFor(query);

    if (window.from > window.to) {
      throw ApiError.badRequest("`from` must be earlier than `to`", {
        from: ["Must be earlier than `to`"],
      });
    }

    const rows = await telemetryRepository.listRange(farmId, {
      ...window,
      zoneId: query.zoneId,
    });

    return bucketReadings(rows, query.interval);
  },

  deviceStatus(auth: AuthContext): Promise<DeviceStatus | null> {
    const farmId = requireFarmId(auth);
    return telemetryRepository.deviceStatus(farmId).then(toDeviceStatus);
  },

  /**
   * The System Health page in one payload: the diagnostic cards, the device summary and the
   * status counts. Bundled so the page does not fire three requests to render one screen.
   */
  async systemHealth(auth: AuthContext): Promise<SystemHealthResponse> {
    const farmId = requireFarmId(auth);
    const [components, device] = await Promise.all([
      telemetryRepository.listComponents(farmId),
      telemetryRepository.deviceStatus(farmId),
    ]);

    const mapped: SystemComponent[] = components.map((row) => ({
      id: row.id,
      key: row.key,
      name: loc(row.nameEn, row.nameAr),
      value: row.value,
      status: row.status as SystemComponent["status"],
      detail: locOrNull(row.detailEn, row.detailAr),
      updatedAt: row.updatedAt.toISOString(),
    }));

    const summary = {
      green: mapped.filter((c) => c.status === "GREEN").length,
      orange: mapped.filter((c) => c.status === "ORANGE").length,
      red: mapped.filter((c) => c.status === "RED").length,
    };

    return {
      components: mapped,
      deviceStatus: toDeviceStatus(device),
      summary,
      // A farm with no red components and a reachable controller is "online".
      online: (device?.controllerOnline ?? false) && summary.red === 0,
    };
  },

  async errorLogs(auth: AuthContext, limit: number): Promise<ErrorLog[]> {
    const farmId = requireFarmId(auth);
    const rows = await telemetryRepository.listErrorLogs(farmId, limit);

    return rows.map((row) => ({
      id: row.id,
      occurredAt: row.occurredAt.toISOString(),
      component: row.component,
      componentName: loc(row.component, row.component),
      message: loc(row.messageEn, row.messageAr),
      action: locOrNull(row.actionEn, row.actionAr),
    }));
  },
};
