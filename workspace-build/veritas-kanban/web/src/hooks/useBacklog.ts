/**
 * React Query hooks for backlog operations
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { backlogApi, type BacklogFilterOptions } from '@/lib/api/backlog';
import type { Task, CreateTaskInput } from '@veritas-kanban/shared';

/**
 * Fetch backlog tasks with optional filters
 */
export function useBacklogTasks(options: BacklogFilterOptions = {}) {
  return useQuery({
    queryKey: ['backlog', 'list', options],
    queryFn: () => backlogApi.list(options),
    staleTime: 30_000, // 30 seconds
  });
}

/**
 * Fetch backlog task count (for nav badge)
 */
export function useBacklogCount() {
  return useQuery({
    queryKey: ['backlog', 'count'],
    queryFn: backlogApi.getCount,
    refetchInterval: 60_000, // Refresh every minute
    staleTime: 30_000,
  });
}

/**
 * Fetch a single backlog task
 */
export function useBacklogTask(id: string) {
  return useQuery({
    queryKey: ['backlog', id],
    queryFn: () => backlogApi.get(id),
    enabled: !!id,
  });
}

/**
 * Create a new task directly in backlog
 */
export function useCreateBacklogTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTaskInput) => backlogApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backlog'] });
      queryClient.invalidateQueries({ queryKey: ['task-counts'] });
    },
  });
}

/**
 * Update a backlog task
 */
export function useUpdateBacklogTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Task> }) =>
      backlogApi.update(id, updates),
    onSuccess: (updatedTask) => {
      // Update the cached list
      queryClient.setQueryData<Task[]>(['backlog', 'list'], (old) =>
        old ? old.map((t) => (t.id === updatedTask.id ? updatedTask : t)) : old
      );
      // Update the cached single task
      queryClient.setQueryData(['backlog', updatedTask.id], updatedTask);
      // Invalidate to refetch
      queryClient.invalidateQueries({ queryKey: ['backlog'] });
    },
  });
}

/**
 * Delete a backlog task
 */
export function useDeleteBacklogTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => backlogApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backlog'] });
      queryClient.invalidateQueries({ queryKey: ['task-counts'] });
    },
  });
}

/**
 * Promote a backlog task to the active board
 */
export function usePromoteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => backlogApi.promote(id),
    onSuccess: () => {
      // Invalidate both backlog and active tasks
      queryClient.invalidateQueries({ queryKey: ['backlog'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task-counts'] });
    },
  });
}

/**
 * Bulk promote tasks to active board
 */
export function useBulkPromote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) => backlogApi.bulkPromote(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backlog'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task-counts'] });
    },
  });
}

/**
 * Demote an active task to backlog
 */
export function useDemoteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => backlogApi.demote(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backlog'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task-counts'] });
    },
  });
}

/**
 * Bulk demote active tasks to backlog
 */
export function useBulkDemote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) => backlogApi.bulkDemote(ids),
    onMutate: async (ids: string[]) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['tasks'] });

      // Snapshot previous value
      const previous = queryClient.getQueryData<Task[]>(['tasks']);

      // Optimistically remove tasks from board
      if (previous) {
        queryClient.setQueryData<Task[]>(
          ['tasks'],
          previous.filter((t) => !ids.includes(t.id))
        );
      }

      return { previous };
    },
    onError: (_err, _ids, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(['tasks'], context.previous);
      }
    },
    onSettled: () => {
      // Single batch of cache invalidations (not per-task)
      queryClient.invalidateQueries({ queryKey: ['backlog'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task-counts'] });
      queryClient.invalidateQueries({ queryKey: ['metrics'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}
