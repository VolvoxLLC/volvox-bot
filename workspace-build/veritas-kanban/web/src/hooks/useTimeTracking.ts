import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Task } from '@veritas-kanban/shared';
import { api, type TimeSummary } from '../lib/api';

export type { TimeSummary };

/**
 * Get time summary by project
 */
export function useTimeSummary() {
  return useQuery<TimeSummary>({
    queryKey: ['time', 'summary'],
    queryFn: () => api.time.getSummary(),
  });
}

/**
 * Optimistically replace a task in the tasks list cache so the UI
 * updates immediately without waiting for a background refetch.
 */
function patchTaskInList(queryClient: ReturnType<typeof useQueryClient>, updated: Task) {
  queryClient.setQueryData<Task[]>(['tasks'], (old) =>
    old ? old.map((t) => (t.id === updated.id ? updated : t)) : old
  );
  queryClient.setQueryData(['tasks', updated.id], updated);
}

/**
 * Start timer for a task
 */
export function useStartTimer() {
  const queryClient = useQueryClient();

  return useMutation<Task, Error, string>({
    mutationFn: (taskId) => api.time.start(taskId),
    onSuccess: (task) => {
      patchTaskInList(queryClient, task);
    },
    // Always refresh cache — on error the UI may be out of sync with server
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['time', 'summary'] });
    },
  });
}

/**
 * Stop timer for a task
 */
export function useStopTimer() {
  const queryClient = useQueryClient();

  return useMutation<Task, Error, string>({
    mutationFn: (taskId) => api.time.stop(taskId),
    onSuccess: (task) => {
      patchTaskInList(queryClient, task);
    },
    // Always refresh cache — on error the UI may be out of sync with server
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['time', 'summary'] });
    },
  });
}

/**
 * Add manual time entry
 */
export function useAddTimeEntry() {
  const queryClient = useQueryClient();

  return useMutation<Task, Error, { taskId: string; duration: number; description?: string }>({
    mutationFn: ({ taskId, duration, description }) =>
      api.time.addEntry(taskId, duration, description),
    onSuccess: (task) => {
      patchTaskInList(queryClient, task);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['time', 'summary'] });
    },
  });
}

/**
 * Delete a time entry
 */
export function useDeleteTimeEntry() {
  const queryClient = useQueryClient();

  return useMutation<Task, Error, { taskId: string; entryId: string }>({
    mutationFn: ({ taskId, entryId }) => api.time.deleteEntry(taskId, entryId),
    onSuccess: (task) => {
      patchTaskInList(queryClient, task);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['time', 'summary'] });
    },
  });
}

/**
 * Format seconds to human readable duration
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0 && secs > 0) {
    return `${minutes}m ${secs}s`;
  }

  return `${minutes}m`;
}

/**
 * Parse duration string to seconds (e.g., "1h 30m" or "45m" or "30")
 */
export function parseDuration(input: string): number | null {
  const trimmed = input.trim().toLowerCase();

  // Try parsing as plain number (minutes)
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10) * 60;
  }

  // Try parsing with units
  let totalSeconds = 0;

  const hourMatch = trimmed.match(/(\d+)\s*h/);
  if (hourMatch) {
    totalSeconds += parseInt(hourMatch[1], 10) * 3600;
  }

  const minMatch = trimmed.match(/(\d+)\s*m/);
  if (minMatch) {
    totalSeconds += parseInt(minMatch[1], 10) * 60;
  }

  const secMatch = trimmed.match(/(\d+)\s*s/);
  if (secMatch) {
    totalSeconds += parseInt(secMatch[1], 10);
  }

  return totalSeconds > 0 ? totalSeconds : null;
}
