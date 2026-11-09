import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import type { FieldHistoryKind } from "@semico/shared";
import { queryKeys, telemetryApi } from "@/api";
import { useAuth } from "@/features/auth/AuthContext";
import { getActiveFarmId, subscribeActiveFarmId } from "@/lib/api/http";

export interface FieldHistorySelection {
  userId: string;
  farmId: string;
  headerFarmId: string | null;
  kind: FieldHistoryKind;
  id: string;
  zoneId: string;
}

export function fieldHistoryQueryOptions(selection: FieldHistorySelection) {
  return {
    queryKey: queryKeys.telemetry.history(
      selection.userId,
      selection.farmId,
      selection.kind,
      selection.id,
    ),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      telemetryApi.history(
        selection.farmId,
        selection.kind,
        selection.id,
        signal,
      ),
    refetchInterval: 30_000,
    staleTime: 0,
    retry: false,
  };
}

export function useFieldHistory(selection: FieldHistorySelection) {
  return useQuery(fieldHistoryQueryOptions(selection));
}

export function useFieldHistorySelection(farmId: string | undefined) {
  const { user } = useAuth();
  const headerFarmId = useSyncExternalStore(
    subscribeActiveFarmId,
    getActiveFarmId,
    () => null,
  );
  const [selected, setSelected] = useState<FieldHistorySelection | null>(null);
  useEffect(() => setSelected(null), [farmId, user?.id, headerFarmId]);
  const close = useCallback(() => setSelected(null), []);
  const select = useCallback(
    (kind: FieldHistoryKind, id: string, zoneId: string) => {
      if (!farmId || !user?.id || (headerFarmId && headerFarmId !== farmId))
        return;
      setSelected({ kind, id, zoneId, farmId, userId: user.id, headerFarmId });
    },
    [farmId, user?.id, headerFarmId],
  );
  const openZone = useCallback(
    (id: string) => select("zone", id, id),
    [select],
  );
  const openSensor = useCallback(
    (id: string, zoneId: string) => select("sensor", id, zoneId),
    [select],
  );
  const selection =
    selected &&
    selected.farmId === farmId &&
    selected.userId === user?.id &&
    selected.headerFarmId === headerFarmId
      ? selected
      : null;
  const canSelect = Boolean(
    farmId && user?.id && (!headerFarmId || headerFarmId === farmId),
  );
  return { selection, openZone, openSensor, close, canSelect };
}
