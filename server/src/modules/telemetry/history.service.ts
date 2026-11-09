import type {
  FieldHistory,
  FieldHistoryKind,
  Sensor,
  ValveState,
} from "@semico/shared";
import { ApiError } from "../../lib/ApiError.js";
import { loc, locOrNull } from "../../lib/localized.js";
import type { AuthContext } from "../../types/auth.js";
import { historyRepository } from "./history.repository.js";

const HOUR_MS = 60 * 60 * 1000;

export const historyService = {
  async detail(
    auth: AuthContext,
    kind: FieldHistoryKind,
    id: string,
  ): Promise<FieldHistory> {
    const farmId = auth.farmId;
    if (!farmId) throw ApiError.forbidden("You are not attached to a farm");
    const sensor =
      kind === "sensor" ? await historyRepository.sensor(farmId, id) : null;
    if (kind === "sensor" && !sensor)
      throw ApiError.notFound("Sensor not found");
    const zone = sensor?.zone ?? (await historyRepository.zone(farmId, id));
    if (!zone) throw ApiError.notFound("Zone not found");
    const to = new Date();
    const from = new Date(to.getTime() - 24 * HOUR_MS);
    const zoneScope = { farmId, zoneId: zone.id };
    const sensorReading = sensor
      ? await historyRepository.latest(
          { ...zoneScope, sensorId: sensor.id },
          to,
        )
      : null;
    const scope =
      sensorReading && sensor
        ? { ...zoneScope, sensorId: sensor.id }
        : zoneScope;
    const [latest, buckets, watering, sensorRows] = await Promise.all([
      sensorReading ?? historyRepository.latest(scope, to),
      historyRepository.hourly(scope, from, to),
      historyRepository.lastWatering(farmId, zone.id, to),
      historyRepository.sensors(farmId, zone.id),
    ]);
    const warnings = await historyRepository.warnings(
      farmId,
      zone.id,
      sensorRows.map((row) => row.key),
      from,
      to,
      sensor?.key,
    );
    const sensors: Sensor[] = sensorRows.map((row) => ({
      id: row.id,
      key: row.key,
      zoneId: zone.id,
      zoneName: zone.name,
      connection: row.connection as Sensor["connection"],
      lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
      batteryPct: row.batteryPct,
    }));
    const hourly = new Map(
      buckets.map((bucket) => [Number(bucket.bucket), bucket]),
    );
    return {
      farmId,
      window: { from: from.toISOString(), to: to.toISOString() },
      zone: {
        id: zone.id,
        name: zone.name,
        valveState: zone.valveState as ValveState,
      },
      sensor: sensor
        ? (sensors.find((row) => row.id === sensor.id) ?? null)
        : null,
      sensors,
      telemetryScope: sensorReading ? "sensor" : "zone",
      latestMoisture:
        latest?.rootMoisture != null
          ? {
              value: latest.rootMoisture,
              recordedAt: latest.recordedAt.toISOString(),
            }
          : null,
      lastWatering: watering?.executedAt
        ? {
            commandId: watering.id,
            executedAt: watering.executedAt.toISOString(),
            durationMin: watering.durationMin,
          }
        : null,
      points: Array.from({ length: 24 }, (_, index) => ({
        at: new Date(from.getTime() + index * HOUR_MS).toISOString(),
        moisture: hourly.get(index)?.moisture ?? null,
        samples: Number(hourly.get(index)?.samples ?? 0),
      })),
      warnings: warnings.rows.map((row) => ({
        id: row.id,
        occurredAt: row.occurredAt.toISOString(),
        component: row.component,
        componentName: loc(row.component, row.component),
        message: loc(row.messageEn, row.messageAr),
        action: locOrNull(row.actionEn, row.actionAr),
        location: {
          zoneId: row.zoneId,
          zoneName: row.zone?.name ?? null,
          sensorKey: row.sensorKey,
        },
      })),
      warningCount: warnings.count,
    };
  },
};
