import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Azure optional environment settings", () => {
  it("treats an empty MQTT_URL as disabled without requiring device mappings", async () => {
    vi.resetModules();
    vi.stubEnv("MQTT_URL", "");
    vi.stubEnv("MQTT_DEVICE_REGISTRY", "{}");
    const { env } = await import("../src/config/env.js");
    expect(env.MQTT_URL).toBeUndefined();
    expect(env.MQTT_DEVICE_REGISTRY).toEqual({});
  });
});
