import type { IncomingMessage, Server } from "node:http";
import type { Socket } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import { realtimeEventSchema, type RealtimeEvent } from "@semico/shared";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { logger } from "../../middleware/requestLogger.js";
import { realtimeRepository } from "./realtime.repository.js";

const SOCKET_PATH = "/api/v1/realtime";
const MAX_CONNECTIONS = 1_000;
const MAX_CONNECTIONS_PER_USER = 5;
const AUTH_RECHECK_MS = 30_000;

type SocketIdentity = { userId: string; farmId: string };

function reject(socket: Socket, status: number, message: string): void {
  socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  return env.CORS_ORIGIN.split(",").map((value) => value.trim()).includes(origin);
}

async function ticketStillAuthorized(identity: SocketIdentity): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: identity.userId },
    select: {
      id: true, role: true, status: true, platformDisabled: true,
      farm: { select: { id: true, status: true } },
      ownedFarms: { select: { id: true, status: true } },
    },
  });
  if (!user || user.status !== "ACTIVE" || user.platformDisabled) return false;
  return user.role === "OWNER"
    ? user.ownedFarms.some((farm) => farm.id === identity.farmId && farm.status === "ACTIVE")
    : user.role === "WORKER" && user.farm?.id === identity.farmId && user.farm.status === "ACTIVE";
}

export interface RealtimeServer {
  publishFarmEvent(event: RealtimeEvent): void;
  close(): Promise<void>;
}

export function attachRealtimeServer(server: Server): RealtimeServer {
  const websocketServer = new WebSocketServer({ noServer: true, maxPayload: 1_024 });
  const identities = new Map<WebSocket, SocketIdentity>();
  const authorizationChecks = new Map<WebSocket, ReturnType<typeof setInterval>>();
  const alertSnapshots = new Map<string, string>();
  const unsubscribeRevocations = realtimeRepository.onAccessRevoked((scope) => {
    for (const [websocket, identity] of identities) {
      if ((scope.userId && identity.userId === scope.userId) || (scope.farmId && identity.farmId === scope.farmId)) {
        websocket.close(1008, "Farm or account access revoked");
      }
    }
  });

  const onUpgrade = (request: IncomingMessage, socket: Socket, head: Buffer) => {
    void (async () => {
      let url: URL;
      try {
        url = new URL(request.url ?? "", `http://${request.headers.host ?? "localhost"}`);
      } catch {
        reject(socket, 400, "Bad Request");
        return;
      }
      if (url.pathname !== SOCKET_PATH) {
        reject(socket, 404, "Not Found");
        return;
      }
      if (!isAllowedOrigin(request.headers.origin)) {
        reject(socket, 403, "Forbidden");
        return;
      }
      if (websocketServer.clients.size >= MAX_CONNECTIONS) {
        reject(socket, 503, "Service Unavailable");
        return;
      }

      const ticket = url.searchParams.get("ticket");
      const identity = ticket ? realtimeRepository.consumeTicket(ticket) : null;
      if (!identity || !(await ticketStillAuthorized(identity))) {
        reject(socket, 401, "Unauthorized");
        return;
      }
      const userConnections = [...identities.values()].filter((item) => item.userId === identity.userId).length;
      if (userConnections >= MAX_CONNECTIONS_PER_USER) {
        reject(socket, 429, "Too Many Requests");
        return;
      }

      websocketServer.handleUpgrade(request, socket, head, (websocket) => {
        identities.set(websocket, identity);
        websocketServer.emit("connection", websocket, request);
      });
    })().catch((error: unknown) => {
      logger.error({ err: error }, "WebSocket authentication failed");
      if (!socket.destroyed) reject(socket, 500, "Internal Server Error");
    });
  };

  server.on("upgrade", onUpgrade);

  websocketServer.on("connection", (websocket) => {
    const identity = identities.get(websocket);
    const authorizationCheck = setInterval(() => {
      if (!identity) return websocket.close(1008, "Authorization expired");
      void ticketStillAuthorized(identity).then((authorized) => {
        if (!authorized) websocket.close(1008, "Farm access changed");
      }).catch((error: unknown) => {
        logger.warn({ err: error }, "WebSocket authorization recheck failed");
        websocket.close(1011, "Authorization could not be verified");
      });
    }, AUTH_RECHECK_MS);
    authorizationCheck.unref();
    authorizationChecks.set(websocket, authorizationCheck);

    websocket.on("message", () => websocket.close(1008, "This connection is server-to-client only"));
    websocket.on("close", () => {
      clearInterval(authorizationChecks.get(websocket));
      authorizationChecks.delete(websocket);
      identities.delete(websocket);
    });
    websocket.on("error", (error) => logger.debug({ err: error }, "WebSocket connection error"));
    const snapshot = identity && alertSnapshots.get(identity.farmId);
    if (snapshot) websocket.send(snapshot);
  });

  return {
    publishFarmEvent(event) {
      const parsed = realtimeEventSchema.safeParse(event);
      if (!parsed.success) {
        logger.warn({ issues: parsed.error.issues.map((issue) => issue.path.join(".")) }, "Invalid realtime event dropped");
        return;
      }
      const payload = JSON.stringify(parsed.data);
      if (parsed.data.type === "alert.updated") alertSnapshots.set(parsed.data.farmId, payload);
      for (const [websocket, identity] of identities) {
        if (identity.farmId === parsed.data.farmId && websocket.readyState === WebSocket.OPEN) {
          websocket.send(payload, (error) => {
            if (error) logger.debug({ err: error }, "WebSocket event send failed");
          });
        }
      }
    },
    async close() {
      unsubscribeRevocations();
      alertSnapshots.clear();
      server.off("upgrade", onUpgrade);
      for (const websocket of websocketServer.clients) websocket.close(1001, "Server shutting down");
      await new Promise<void>((resolve) => websocketServer.close(() => resolve()));
    },
  };
}
