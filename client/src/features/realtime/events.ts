import type { QueryClient } from "@tanstack/react-query";
import { realtimeEventSchema, type RealtimeEvent, type SystemHealthResponse, type LatestTelemetry, type Zone } from "@semico/shared";
import { queryKeys } from "@/api/queryKeys";

export type RealtimeAlertSnapshot = Extract<RealtimeEvent, { type: "alert.updated" }>;

/** Apply validated socket messages to the same cache used by the REST queries. */
export function handleRealtimeMessage(queryClient: QueryClient, farmId: string, data: unknown): boolean {
  if (typeof data !== "string") return false;
  let event: RealtimeEvent;
  try {
    event = realtimeEventSchema.parse(JSON.parse(data));
  } catch {
    return false;
  }
  if (event.farmId !== farmId) return false;

  if (event.type === "alert.updated") {
    // A full snapshot also clears resolved alerts immediately, before any REST request completes.
    queryClient.setQueryData(queryKeys.farm.realtimeAlerts(farmId), event);
  }
  if (event.type !== "device-status.updated") {
    void queryClient.invalidateQueries({ queryKey: queryKeys.telemetry.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.farm.zones() });
  }
  if (event.type !== "telemetry.updated") {
    void queryClient.invalidateQueries({ queryKey: queryKeys.systemHealth.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.telemetry.deviceStatus() });
  }
  return true;
}

export function dashboardCriticalCount(
  snapshot: RealtimeAlertSnapshot | null | undefined,
  health: SystemHealthResponse | undefined,
  latest: LatestTelemetry | null | undefined,
  zones: Zone[] = [],
): number {
  const componentCount = (health?.components ?? []).filter((component) => component.status === "RED").length;
  const controllerCount = health?.deviceStatus?.controllerOnline === false ? 1 : 0;
  if (snapshot) {
    const alerts = new Set(snapshot.activeAlerts.map((alert) => `${alert.code}:${alert.targetId}`));
    return componentCount + controllerCount + alerts.size;
  }

  // REST fallback on initial load and when MQTT is disabled. Missing readings are never zero.
  const dryTargets = new Set(zones.filter((zone) => zone.latestMoisture != null && zone.latestMoisture < 18).map((zone) => zone.id));
  if (latest?.rootMoisture != null && latest.rootMoisture < 18) {
    dryTargets.add(latest.zoneId ?? "farm");
  }
  const gatewayCount = health?.deviceStatus?.loraGatewayOnline === false ? 1 : 0;
  return componentCount + controllerCount + gatewayCount + dryTargets.size;
}
