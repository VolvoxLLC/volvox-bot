import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type GitHubStatus, type PRInfo, type CreatePRInput } from '../lib/api';

export type { GitHubStatus, PRInfo, CreatePRInput };

/**
 * Check GitHub CLI status
 */
export function useGitHubStatus() {
  return useQuery<GitHubStatus>({
    queryKey: ['github', 'status'],
    queryFn: () => api.github.getStatus(),
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Create a PR for a task
 */
export function useCreatePR() {
  const queryClient = useQueryClient();

  return useMutation<PRInfo, Error, CreatePRInput>({
    mutationFn: (input) => api.github.createPR(input),
    onSuccess: (_data, variables) => {
      // Invalidate the task to refresh its PR info
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task', variables.taskId] });
    },
  });
}

/**
 * Open PR in browser
 */
export function useOpenPR() {
  return useMutation<void, Error, string>({
    mutationFn: (taskId) => api.github.openPR(taskId),
  });
}
