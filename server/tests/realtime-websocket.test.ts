import { createServer, type Server } from "node:http";
import { once } from "node:events";
import request from "supertest";
import WebSocket from "ws";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { attachRealtimeServer } from "../src/modules/realtime/websocketServer.js";
import type { RealtimeEvent } from "@semico/shared";
import { auth, createSuperAdmin, registerOwner, resetDatabase, testApp } from "./helpers/api.js";

const ORIGIN = "http://localhost:5173";

async function getTicket(token: string): Promise<string> {
  const response = await request(testApp())
    .post("/api/v1/farms/me/realtime-ticket")
    .set(auth(token))
    .expect(200);
  return response.body.data.ticket as string;
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test HTTP server did not bind a port");
  return address.port;
}

function connect(port: number, ticket: string): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${port}/api/v1/realtime?ticket=${encodeURIComponent(ticket)}`, {
    headers: { origin: ORIGIN },
  });
}

async function closeSocket(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return;
  const closed = once(socket, "close");
  socket.close();
  await closed;
}

beforeEach(resetDatabase);

describe("farm-scoped WebSocket realtime", () => {
  it.each(["farm", "user"] as const)("revokes open streams and pending tickets when an admin disables %s access", async (scope) => {
    const owner = await registerOwner("Revoked Farm");
    const other = await registerOwner("Other Farm");
    const admin = await createSuperAdmin();
    const pendingTicket = await getTicket(owner.accessToken);
    const server = createServer(createApp());
    const realtime = attachRealtimeServer(server);
    const port = await listen(server);
    const ownerTicket = await getTicket(owner.accessToken);
    const otherTicket = await getTicket(other.accessToken);
    const socket = connect(port, ownerTicket);
    const unaffected = connect(port, otherTicket);
    try {
      await Promise.all([once(socket, "open"), once(unaffected, "open")]);
      const closed = once(socket, "close");
      const path = scope === "farm" ? `/api/v1/admin/farms/${owner.farmId}/status` : `/api/v1/admin/users/${owner.userId}/status`;
      await request(testApp()).patch(path).set(auth(admin.accessToken)).send({ status: scope === "farm" ? "SUSPENDED" : "DISABLED" }).expect(200);
      expect((await closed)[0]).toBe(1008);
      expect(await rejectedStatus(connect(port, pendingTicket))).toBe(401);
      const message = once(unaffected, "message");
      realtime.publishFarmEvent({ type: "telemetry.updated", farmId: other.farmId, zoneId: null, recordedAt: new Date().toISOString() });
      expect(JSON.parse((await message)[0].toString())).toMatchObject({ farmId: other.farmId });
      expect(unaffected.readyState).toBe(WebSocket.OPEN);
      await request(testApp()).patch(path).set(auth(admin.accessToken)).send({ status: "ACTIVE" }).expect(200);
      expect(await rejectedStatus(connect(port, pendingTicket))).toBe(401);
      const restored = connect(port, await getTicket(owner.accessToken));
      await once(restored, "open"); await closeSocket(restored);
    } finally {
      await closeSocket(socket); await closeSocket(unaffected);
      await realtime.close(); await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("replays the latest alert snapshot on connect and reconnect only for the authorized farm", async () => {
    const ownerA = await registerOwner("Farm A");
    const ownerB = await registerOwner("Farm B");
    const server = createServer(createApp());
    const realtime = attachRealtimeServer(server);
    const port = await listen(server);
    const sockets: WebSocket[] = [];
    const event: RealtimeEvent = {
      type: "alert.updated", farmId: ownerA.farmId, evaluatedAt: new Date().toISOString(),
      activeAlerts: [{ code: "GATEWAY_OFFLINE", targetId: "gateway-a", zoneId: null }],
    };
    realtime.publishFarmEvent(event);
    try {
      for (const activeAlerts of [event.activeAlerts, []]) {
        const current = { ...event, activeAlerts };
        realtime.publishFarmEvent(current);
        const socket = connect(port, await getTicket(ownerA.accessToken));
        sockets.push(socket);
        const message = once(socket, "message");
        await once(socket, "open");
        const [payload] = await message;
        expect(JSON.parse(payload.toString())).toEqual(current);
        await closeSocket(socket);
      }
      const other = connect(port, await getTicket(ownerB.accessToken));
      sockets.push(other);
      let received = false;
      other.on("message", () => { received = true; });
      await once(other, "open");
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(received).toBe(false);
    } finally {
      await Promise.all(sockets.map(closeSocket));
      await realtime.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("delivers events only to the farm bound to each single-use ticket", async () => {
    const ownerA = await registerOwner("Farm A");
    const ownerB = await registerOwner("Farm B");
    const ticketA = await getTicket(ownerA.accessToken);
    const ticketB = await getTicket(ownerB.accessToken);
    const server = createServer(createApp());
    const realtime = attachRealtimeServer(server);
    const port = await listen(server);
    const socketA = connect(port, ticketA);
    const socketB = connect(port, ticketB);

    try {
      await Promise.all([once(socketA, "open"), once(socketB, "open")]);
      const eventA = new Promise<RealtimeEvent>((resolve) => {
        socketA.once("message", (data) => resolve(JSON.parse(data.toString()) as RealtimeEvent));
      });
      let receivedByB = false;
      socketB.once("message", () => { receivedByB = true; });

      realtime.publishFarmEvent({
        type: "telemetry.updated",
        farmId: ownerA.farmId,
        zoneId: null,
        recordedAt: new Date().toISOString(),
      });

      await expect(eventA).resolves.toMatchObject({ type: "telemetry.updated", farmId: ownerA.farmId });
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(receivedByB).toBe(false);

      await closeSocket(socketA);
      await closeSocket(socketB);
      expect(await rejectedStatus(connect(port, ticketA))).toBe(401);
    } finally {
      if (socketA.readyState !== WebSocket.CLOSED) await closeSocket(socketA);
      if (socketB.readyState !== WebSocket.CLOSED) await closeSocket(socketB);
      await realtime.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("rechecks account status when consuming a ticket", async () => {
    const owner = await registerOwner();
    const ticket = await getTicket(owner.accessToken);
    await prisma.user.update({ where: { id: owner.userId }, data: { status: "DISABLED" } });
    const server = createServer(createApp());
    const realtime = attachRealtimeServer(server);
    const port = await listen(server);

    try {
      expect(await rejectedStatus(connect(port, ticket))).toBe(401);
    } finally {
      await realtime.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("rejects missing tickets and cross-origin handshakes", async () => {
    const owner = await registerOwner();
    const server = createServer(createApp());
    const realtime = attachRealtimeServer(server);
    const port = await listen(server);

    try {
      expect(await rejectedStatus(connect(port, ""))).toBe(401);
      const crossOrigin = new WebSocket(`ws://127.0.0.1:${port}/api/v1/realtime?ticket=${encodeURIComponent(await getTicket(owner.accessToken))}`, {
        headers: { origin: "https://attacker.example" },
      });
      expect(await rejectedStatus(crossOrigin)).toBe(403);
    } finally {
      await realtime.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

function rejectedStatus(socket: WebSocket): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    socket.once("unexpected-response", (_request, response) => {
      const status = response.statusCode;
      response.resume();
      resolve(status);
    });
    socket.once("open", () => reject(new Error("Expected WebSocket handshake to be rejected")));
    socket.once("error", () => resolve(undefined));
  });
}
