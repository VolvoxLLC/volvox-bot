import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * Hook to fetch task progress content
 */
export function useTaskProgress(taskId: string | undefined) {
  return useQuery({
    queryKey: ['tasks', taskId, 'progress'],
    queryFn: () => (taskId ? api.tasks.fetchProgress(taskId) : Promise.resolve('')),
    enabled: !!taskId,
    staleTime: 30_000, // Consider fresh for 30s
  });
}

/**
 * Hook to update (overwrite) task progress content
 */
export function useUpdateProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, content }: { taskId: string; content: string }) =>
      api.tasks.updateProgress(taskId, content),
    onSuccess: (_data, { taskId }) => {
      // Invalidate progress cache to refetch latest content
      queryClient.invalidateQueries({ queryKey: ['tasks', taskId, 'progress'] });
    },
  });
}

/**
 * Hook to append content to a specific section of task progress
 */
export function useAppendProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      taskId,
      section,
      content,
    }: {
      taskId: string;
      section: string;
      content: string;
    }) => api.tasks.appendProgress(taskId, section, content),
    onSuccess: (_data, { taskId }) => {
      // Invalidate progress cache to refetch latest content
      queryClient.invalidateQueries({ queryKey: ['tasks', taskId, 'progress'] });
    },
  });
}
