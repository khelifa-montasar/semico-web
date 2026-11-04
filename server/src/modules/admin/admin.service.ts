import { MQTT_ACTIVITY_WINDOW_SECONDS, type PlatformStats } from "@semico/shared";
import { mqttDeviceActivity } from "../telemetry/deviceActivity.js";
import { adminRepository } from "./admin.repository.js";

export const adminService = {
  async stats(): Promise<PlatformStats> {
    const [totalFarms, totalUsers, farms] = await adminRepository.platformSnapshot();
    return {
      totalFarms,
      totalUsers,
      totalActiveMqttDevices: mqttDeviceActivity.countActive(),
      recentFarms: farms.map((farm) => ({ ...farm, createdAt: farm.createdAt.toISOString() })),
      mqttActivityWindowSeconds: MQTT_ACTIVITY_WINDOW_SECONDS,
    };
  },
};
