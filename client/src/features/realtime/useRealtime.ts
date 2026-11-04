import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { farmApi, realtimeApi, queryKeys } from "@/api";
import { useAuth } from "@/features/auth/AuthContext";
import { getActiveFarmId, subscribeActiveFarmId } from "@/lib/api/http";
import { handleRealtimeMessage, type RealtimeAlertSnapshot } from "./events";

export type RealtimeConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "/api/v1";

function socketUrl(ticket: string): string {
  const url = new URL(`${API_BASE_URL}/realtime`, window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("ticket", ticket);
  return url.toString();
}

export function useRealtime(): RealtimeConnectionState {
  const { status, user } = useAuth();
  const queryClient = useQueryClient();
  const selectedFarmId = useSyncExternalStore(
    subscribeActiveFarmId,
    getActiveFarmId,
    () => null,
  );
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>("disconnected");
  const activeFarmQuery = useQuery({
    queryKey: ["realtime", "active-farm", user?.id],
    queryFn: () => farmApi.me(),
    enabled: status === "authenticated" && Boolean(user),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const farmId = selectedFarmId ?? activeFarmQuery.data?.id ?? null;

  useEffect(() => {
    if (status !== "authenticated" || !user || !farmId) {
      setConnectionState("disconnected");
      return;
    }

    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const scheduleReconnect = () => {
      if (disposed) return;
      setConnectionState("reconnecting");
      const delay = Math.min(30_000, 500 * 2 ** Math.min(attempt, 6));
      attempt += 1;
      reconnectTimer = setTimeout(() => void connect(), delay);
    };

    const connect = async () => {
      if (disposed) return;
      setConnectionState(attempt === 0 ? "connecting" : "reconnecting");
      try {
        const { ticket } = await realtimeApi.ticket();
        if (disposed || (getActiveFarmId() && getActiveFarmId() !== farmId)) return;
        const currentSocket = new WebSocket(socketUrl(ticket));
        socket = currentSocket;

        currentSocket.onopen = () => {
          if (disposed) return;
          attempt = 0;
          setConnectionState("connected");
          void queryClient.invalidateQueries({ queryKey: queryKeys.telemetry.all });
          void queryClient.invalidateQueries({ queryKey: queryKeys.systemHealth.all });
          void queryClient.invalidateQueries({ queryKey: queryKeys.farm.zones() });
        };
        currentSocket.onmessage = (message) => {
          if (disposed || (getActiveFarmId() && getActiveFarmId() !== farmId)) return;
          handleRealtimeMessage(queryClient, farmId, message.data);
        };
        currentSocket.onclose = () => {
          if (socket === currentSocket) socket = null;
          scheduleReconnect();
        };
        currentSocket.onerror = () => currentSocket.close();
      } catch {
        scheduleReconnect();
        return;
      }

    };

    void connect();
    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close(1000, "Realtime scope changed");
      setConnectionState("disconnected");
    };
  }, [farmId, queryClient, status, user]);

  return connectionState;
}

/** Observe socket snapshots without opening another connection or fetching another endpoint. */
export function useRealtimeAlerts(defaultFarmId?: string) {
  const selectedFarmId = useSyncExternalStore(subscribeActiveFarmId, getActiveFarmId, () => null);
  return useQuery<RealtimeAlertSnapshot | null>({
    queryKey: queryKeys.farm.realtimeAlerts(selectedFarmId ?? defaultFarmId ?? null),
    queryFn: () => null,
    enabled: false,
    initialData: null,
    gcTime: Infinity,
  });
}
