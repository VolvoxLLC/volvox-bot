import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useWorktreeStatus(taskId: string | undefined, hasWorktree: boolean) {
  return useQuery({
    queryKey: ['worktree', taskId],
    queryFn: () => api.worktree.status(taskId!),
    enabled: !!taskId && hasWorktree,
    refetchInterval: 10000, // Refresh every 10 seconds
  });
}

export function useCreateWorktree() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) => api.worktree.create(taskId),
    onSuccess: (_, taskId) => {
      queryClient.invalidateQueries({ queryKey: ['worktree', taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useDeleteWorktree() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, force }: { taskId: string; force?: boolean }) =>
      api.worktree.delete(taskId, force),
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['worktree', taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useRebaseWorktree() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) => api.worktree.rebase(taskId),
    onSuccess: (_, taskId) => {
      queryClient.invalidateQueries({ queryKey: ['worktree', taskId] });
    },
  });
}

export function useMergeWorktree() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) => api.worktree.merge(taskId),
    onSuccess: (_, taskId) => {
      queryClient.invalidateQueries({ queryKey: ['worktree', taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
