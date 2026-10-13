import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateLeadInput, UpdateLeadInput } from "@semico/shared";
import { leadsApi, queryKeys } from "@/api";

/**
 * Sales leads.
 *
 * `useCreateLead` is used by the public form on the Services page; the other two are owner-only and
 * back the leads list in Settings.
 */

export function useCreateLead() {
  return useMutation({
    mutationFn: (input: CreateLeadInput) => leadsApi.create(input),
  });
}

export function useLeads(filters: { status?: string } = {}) {
  return useQuery({
    queryKey: queryKeys.leads.list(filters),
    queryFn: () => leadsApi.list(filters),
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateLeadInput }) =>
      leadsApi.update(vars.id, vars.input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.leads.all }),
  });
}
