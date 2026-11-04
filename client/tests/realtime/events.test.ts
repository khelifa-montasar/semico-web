import { afterEach, describe, expect, it } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import type { DeviceStatus, LatestTelemetry, SystemHealthResponse, Zone } from "@semico/shared";
import { queryKeys } from "../../src/api/queryKeys";
import { dashboardCriticalCount, handleRealtimeMessage, type RealtimeAlertSnapshot } from "../../src/features/realtime/events";

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const farmId = "farm-a";
const key = queryKeys.farm.realtimeAlerts(farmId);
const evaluatedAt = "2026-10-26T12:00:00.000Z";
const lowMoisture = { code: "MOISTURE_LOW" as const, targetId: "zone-a", zoneId: "zone-a" };
const gatewayOffline = { code: "GATEWAY_OFFLINE" as const, targetId: "gateway-a", zoneId: null };
const snapshot = (activeAlerts: RealtimeAlertSnapshot["activeAlerts"]): RealtimeAlertSnapshot => ({
  type: "alert.updated", farmId, evaluatedAt, activeAlerts,
});
const latest = (moisture: number | null): LatestTelemetry => ({
  zoneId: "zone-a", zoneName: "North", recordedAt: evaluatedAt, rootMoisture: moisture,
  surfaceMoisture: null, soilTempC: null, batteryPct: null, flowRateLpm: null, loraRssi: null, valveState: null,
});
const zone = (moisture: number | null): Zone => ({
  id: "zone-a", name: "North", sortOrder: 0, latestMoisture: moisture, valveState: "CLOSED",
});
const health: SystemHealthResponse = {
  components: [], summary: { green: 0, orange: 0, red: 0 }, online: true,
  deviceStatus: { controllerOnline: true, loraGatewayOnline: true } as DeviceStatus,
};

afterEach(() => client.clear());

describe("native WebSocket dashboard alerts", () => {
  it("updates banner subscribers immediately and clears alerts before REST refetches finish", () => {
    const observer = new QueryObserver<RealtimeAlertSnapshot | null>(client, {
      queryKey: key, queryFn: () => null, enabled: false, initialData: null,
    });
    const counts: number[] = [];
    const unsubscribe = observer.subscribe((result) => {
      counts.push(dashboardCriticalCount(result.data, health, latest(17.5), [zone(17.5)]));
    });
    try {
      expect(handleRealtimeMessage(client, farmId, JSON.stringify(snapshot([lowMoisture])))).toBe(true);
      expect(counts).toEqual([1]);
      handleRealtimeMessage(client, farmId, JSON.stringify(snapshot([lowMoisture, gatewayOffline])));
      expect(counts).toEqual([1, 2]);
      handleRealtimeMessage(client, farmId, JSON.stringify(snapshot([])));
      expect(counts).toEqual([1, 2, 0]);
    } finally {
      unsubscribe();
    }
  });

  it("rejects other farms, malformed payloads, and unsupported messages", () => {
    for (const message of [null, "{", JSON.stringify({ ...snapshot([lowMoisture]), farmId: "farm-b" }),
      JSON.stringify({ ...snapshot([lowMoisture]), untrusted: true }),
      JSON.stringify({ ...snapshot([lowMoisture]), activeAlerts: [{ ...lowMoisture, code: "UNKNOWN" }] }),
      JSON.stringify({ type: "unknown", farmId })]) {
      expect(handleRealtimeMessage(client, farmId, message)).toBe(false);
    }
    expect(client.getQueryData(key)).toBeUndefined();
  });

  it("keeps alerts farm-scoped and replaces full snapshots without duplicating a target", () => {
    const event = snapshot([lowMoisture, lowMoisture]);
    handleRealtimeMessage(client, farmId, JSON.stringify(event));
    expect(dashboardCriticalCount(client.getQueryData(key), health, latest(45))).toBe(1);
    expect(client.getQueryData(queryKeys.farm.realtimeAlerts("farm-b"))).toBeUndefined();
    handleRealtimeMessage(client, "farm-b", JSON.stringify({ ...snapshot([gatewayOffline]), farmId: "farm-b" }));
    expect(client.getQueryData(key)).toEqual(event);
  });

  it("refreshes existing REST snapshots for telemetry and device status events", () => {
    const telemetryKey = queryKeys.telemetry.latest();
    const healthKey = queryKeys.systemHealth.detail();
    const zonesKey = queryKeys.farm.zones();
    const statusKey = queryKeys.telemetry.deviceStatus();
    [telemetryKey, healthKey, zonesKey, statusKey].forEach((queryKey) => client.setQueryData(queryKey, {}));
    handleRealtimeMessage(client, farmId, JSON.stringify({ type: "telemetry.updated", farmId, zoneId: null, recordedAt: evaluatedAt }));
    expect(client.getQueryState(telemetryKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(zonesKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(healthKey)?.isInvalidated).toBe(false);
    handleRealtimeMessage(client, farmId, JSON.stringify({ type: "device-status.updated", farmId, updatedAt: evaluatedAt }));
    expect(client.getQueryState(healthKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(statusKey)?.isInvalidated).toBe(true);
  });

  it("falls back to REST below 18%, ignores absent readings, and retains controller faults", () => {
    expect(dashboardCriticalCount(null, health, latest(18), [zone(18)])).toBe(0);
    expect(dashboardCriticalCount(null, health, latest(17.5), [zone(17.5)])).toBe(1);
    expect(dashboardCriticalCount(null, health, latest(null), [zone(null)])).toBe(0);
    expect(dashboardCriticalCount(null, undefined, undefined)).toBe(0);
    const offline = { ...health, deviceStatus: { ...health.deviceStatus!, controllerOnline: false, loraGatewayOnline: false } };
    expect(dashboardCriticalCount(null, offline, latest(45))).toBe(2);
    expect(dashboardCriticalCount(snapshot([]), offline, latest(45))).toBe(1);
  });
});
