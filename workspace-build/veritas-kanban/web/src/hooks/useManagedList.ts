import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ManagedListItem } from '@veritas-kanban/shared';
import { managedList } from '../lib/api';

export interface UseManagedListOptions {
  endpoint: string;
  queryKey: string[];
}

export function useManagedList<T extends ManagedListItem>({ endpoint, queryKey }: UseManagedListOptions) {
  const queryClient = useQueryClient();
  const api = managedList.createHelpers<T>(endpoint);

  const { data: items = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => api.list(false),
  });

  const createMutation = useMutation({
    mutationFn: (input: any) => api.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: any }) => api.update(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const removeMutation = useMutation({
    mutationFn: ({ id, force = false }: { id: string; force?: boolean }) => api.remove(id, force),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => api.reorder(orderedIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    items,
    isLoading,
    create: createMutation.mutateAsync,
    update: (id: string, patch: any) => updateMutation.mutateAsync({ id, patch }),
    remove: (id: string, force = false) => removeMutation.mutateAsync({ id, force }),
    reorder: reorderMutation.mutateAsync,
    canDelete: api.canDelete,
  };
}
