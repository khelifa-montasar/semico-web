import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InviteWorkerInput, UpdateWorkerInput, Worker } from "@semico/shared";
import { irrigationApi, queryKeys, workersApi } from "@/api";

/**
 * Worker management — owner-only on the server.
 *
 * Granting or revoking valve control invalidates the worker list AND the activity feed: the
 * endpoint writes a feed row as well as changing the permission, so refreshing only the table
 * would leave the Activity page missing the event the owner just caused.
 */

export function useWorkers() {
  return useQuery({
    queryKey: queryKeys.workers.list(),
    queryFn: () => workersApi.list(),
  });
}

export function useInviteWorker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteWorkerInput) => workersApi.invite(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.workers.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activity.all });
    },
  });
}

export function useSetValveControl() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; granted: boolean }) =>
      workersApi.setValveControl(vars.id, vars.granted),
    onSuccess: (worker: Worker) => {
      // Patch the row in place so the toggle doesn't flicker, then refresh what else moved.
      queryClient.setQueryData<Worker[]>(queryKeys.workers.list(), (previous) =>
        previous?.map((entry) => (entry.id === worker.id ? worker : entry)),
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.activity.all });
    },
  });
}

export function useUpdateWorker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateWorkerInput }) =>
      workersApi.update(vars.id, vars.input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.workers.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activity.all });
    },
  });
}

/** Issues a one-time password; there is no mail delivery, so the caller must display it. */
export function useResetWorkerPassword() {
  return useMutation({
    mutationFn: (id: string) => workersApi.resetPassword(id),
  });
}

export function useRemoveWorker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => workersApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.workers.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activity.all });
    },
  });
}

/** Opens or closes a valve from Settings. */
export function useSetValve() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { action: "OPEN" | "CLOSE"; zoneId?: string }) =>
      irrigationApi.setValve(vars.action, vars.zoneId),
    onSuccess: () => {
      // A valve command writes a reading, a feed row and a command record.
      void queryClient.invalidateQueries({ queryKey: queryKeys.telemetry.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activity.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.irrigation.all });
    },
  });
}
