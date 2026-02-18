/**
 * React Query hooks for agent routing configuration.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { routingApi } from '@/lib/api/agent';
import type { AgentRoutingConfig, RoutingResult } from '@veritas-kanban/shared';

/** Fetch the current routing config */
export function useRoutingConfig() {
  return useQuery<AgentRoutingConfig>({
    queryKey: ['routing-config'],
    queryFn: routingApi.getConfig,
    staleTime: 60_000,
  });
}

/** Update routing config */
export function useUpdateRoutingConfig() {
  const queryClient = useQueryClient();
  return useMutation<AgentRoutingConfig, Error, AgentRoutingConfig>({
    mutationFn: routingApi.updateConfig,
    onSuccess: (data) => {
      queryClient.setQueryData(['routing-config'], data);
    },
  });
}

/** Resolve agent for an existing task */
export function useResolveAgent(taskId: string | undefined) {
  return useQuery<RoutingResult>({
    queryKey: ['routing-resolve', taskId],
    queryFn: () => routingApi.resolveForTask(taskId!),
    enabled: !!taskId,
    staleTime: 30_000,
  });
}

/** Resolve agent for ad-hoc metadata (e.g. from create dialog) */
export function useResolveAgentForMetadata(
  metadata: {
    type?: string;
    priority?: string;
    project?: string;
    subtaskCount?: number;
  } | null
) {
  return useQuery<RoutingResult>({
    queryKey: ['routing-resolve-meta', metadata],
    queryFn: () => routingApi.resolveForMetadata(metadata!),
    enabled: !!metadata,
    staleTime: 15_000,
  });
}
