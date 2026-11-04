import { MQTT_ACTIVITY_WINDOW_SECONDS } from "@semico/shared";

/** Observed MQTT activity in this API process; invalid messages never enter this tracker. */
class MqttDeviceActivity {
  private readonly lastSeen = new Map<string, number>();

  markSeen(deviceId: string, receivedAt = Date.now()): void {
    this.lastSeen.set(deviceId, receivedAt);
  }

  countActive(now = Date.now()): number {
    const cutoff = now - MQTT_ACTIVITY_WINDOW_SECONDS * 1000;
    for (const [id, receivedAt] of this.lastSeen) {
      if (receivedAt <= cutoff) this.lastSeen.delete(id);
    }
    return this.lastSeen.size;
  }

  clear(): void {
    this.lastSeen.clear();
  }
}

export const mqttDeviceActivity = new MqttDeviceActivity();
