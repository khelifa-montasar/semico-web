import type { QueryClient } from "@tanstack/react-query";
import type { Farm, FarmSettings } from "@semico/shared";
import { queryKeys } from "@/api/queryKeys";
import { getActiveFarmId } from "@/lib/api/http";

export function activeFarmScope(client: QueryClient): string | undefined {
  return (
    getActiveFarmId() ??
    client.getQueryData<Farm>(queryKeys.farm.detail())?.id ??
    client.getQueryData<FarmSettings>(queryKeys.farm.settings())?.farmId
  );
}

export async function invalidateFarmLayout(client: QueryClient): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.farm.zones() }),
    client.invalidateQueries({ queryKey: queryKeys.systemHealth.all }),
    client.invalidateQueries({ queryKey: queryKeys.telemetry.all }),
  ]);
}

export async function applyFarmSettings(
  client: QueryClient,
  settings: FarmSettings,
): Promise<void> {
  const activeId = activeFarmScope(client);
  client.setQueryData(queryKeys.farm.settings(settings.farmId), settings);
  if (activeId === settings.farmId)
    client.setQueryData(queryKeys.farm.settings(), settings);
  await invalidateFarmLayout(client);
}
