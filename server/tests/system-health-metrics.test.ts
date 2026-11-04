import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/db/prisma.js";
import { auth, registerOwner, resetDatabase, testApp } from "./helpers/api.js";

beforeEach(resetDatabase);

describe("farm weather coordinates", () => {
  it("returns configured coordinates and leaves unset coordinates null", async () => {
    const owner = await registerOwner();

    const unset = await request(testApp())
      .get("/api/v1/farms/me")
      .set(auth(owner.accessToken))
      .expect(200);
    expect(unset.body.data).toMatchObject({ latitude: null, longitude: null });

    await prisma.farm.update({ where: { id: owner.farmId }, data: { latitude: 36.48, longitude: 2.83 } });
    const configured = await request(testApp())
      .get("/api/v1/farms/me")
      .set(auth(owner.accessToken))
      .expect(200);
    expect(configured.body.data).toMatchObject({ latitude: 36.48, longitude: 2.83 });
  });
});

describe("current device metrics", () => {
  it("returns gateway state, uptime, battery and flow rate", async () => {
    const owner = await registerOwner();
    await prisma.deviceStatus.update({
      where: { farmId: owner.farmId },
      data: {
        loraGatewayOnline: true,
        loraUptimeMinutes: 120,
        batteryPct: 91,
        flowRateLpm: 2.4,
      },
    });

    const response = await request(testApp())
      .get("/api/v1/farms/me/system-health")
      .set(auth(owner.accessToken))
      .expect(200);

    expect(response.body.data.deviceStatus).toMatchObject({
      loraGatewayOnline: true,
      loraUptimeMinutes: 120,
      batteryPct: 91,
      flowRateLpm: 2.4,
    });
  });
});
