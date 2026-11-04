import type { SensorZoneGroup, Zone } from "@semico/shared";
import type { FarmMapSensor, FarmMapZone } from "./FarmMap";

/** Canonical live zone/sensor projection shared by Dashboard and Technical Diagnostics. */
export function toFarmMapData(zones: Zone[], sensorGroups: SensorZoneGroup[]): {
  zones: FarmMapZone[];
  sensors: FarmMapSensor[];
} {
  return {
    zones: zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      moisture: zone.latestMoisture,
      valveState: zone.valveState,
    })),
    sensors: sensorGroups.flatMap((group) => group.sensors.map((sensor) => ({
      id: sensor.id,
      key: sensor.key,
      zoneId: sensor.zoneId,
      connection: sensor.connection,
    }))),
  };
}
