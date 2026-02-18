import { useQuery } from '@tanstack/react-query';
import type { SprintConfig } from '@veritas-kanban/shared';
import { useManagedList } from './useManagedList';
import { apiFetch } from '@/lib/api/helpers';

/**
 * Hook to fetch sprints (active only)
 */
export function useSprints() {
  return useQuery<SprintConfig[]>({
    queryKey: ['sprints'],
    queryFn: () => apiFetch<SprintConfig[]>('/api/sprints'),
  });
}

/**
 * Hook to manage sprints (CRUD operations)
 */
export function useSprintsManager() {
  return useManagedList<SprintConfig>({
    endpoint: '/sprints',
    queryKey: ['sprints'],
  });
}

/**
 * Get the label for a sprint
 */
export function getSprintLabel(sprints: SprintConfig[], sprintId: string): string {
  const sprint = sprints.find((s) => s.id === sprintId);
  return sprint?.label || sprintId;
}
