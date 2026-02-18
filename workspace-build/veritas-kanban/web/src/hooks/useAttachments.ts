import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Attachment } from '@veritas-kanban/shared';
import { api, type TaskContext } from '../lib/api';

/**
 * Fetch attachments for a task
 */
export function useAttachments(taskId: string) {
  return useQuery<Attachment[]>({
    queryKey: ['attachments', taskId],
    queryFn: () => api.attachments.list(taskId),
    enabled: !!taskId,
  });
}

/**
 * Upload attachment(s) to a task
 */
export function useUploadAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, formData }: { taskId: string; formData: FormData }) => {
      return api.attachments.upload(taskId, formData);
    },
    onSuccess: (_, { taskId }) => {
      // Invalidate both attachments and task queries
      queryClient.invalidateQueries({ queryKey: ['attachments', taskId] });
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

/**
 * Delete an attachment
 */
export function useDeleteAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, attachmentId }: { taskId: string; attachmentId: string }) => {
      return api.attachments.delete(taskId, attachmentId);
    },
    onSuccess: (_, { taskId }) => {
      // Invalidate both attachments and task queries
      queryClient.invalidateQueries({ queryKey: ['attachments', taskId] });
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

/**
 * Fetch full task context for agent consumption
 */
export function useTaskContext(taskId: string) {
  return useQuery<TaskContext>({
    queryKey: ['task-context', taskId],
    queryFn: () => api.attachments.getTaskContext(taskId),
    enabled: !!taskId,
  });
}
