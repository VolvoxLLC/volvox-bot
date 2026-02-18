import { useQuery } from '@tanstack/react-query';
import type { ProjectConfig } from '@veritas-kanban/shared';
import { useManagedList } from './useManagedList';
import { apiFetch } from '@/lib/api/helpers';

/**
 * Hook to fetch projects (active only)
 */
export function useProjects() {
  return useQuery<ProjectConfig[]>({
    queryKey: ['projects'],
    queryFn: () => apiFetch<ProjectConfig[]>('/api/projects'),
  });
}

/**
 * Hook to manage projects (CRUD operations)
 */
export function useProjectsManager() {
  return useManagedList<ProjectConfig>({
    endpoint: '/projects',
    queryKey: ['projects'],
  });
}

/**
 * Get the label for a project
 */
export function getProjectLabel(projects: ProjectConfig[], projectId: string): string {
  const project = projects.find((p) => p.id === projectId);
  return project?.label || projectId;
}

/**
 * Get the color class for a project badge
 */
export function getProjectColor(projects: ProjectConfig[], projectId: string): string {
  const project = projects.find((p) => p.id === projectId);
  return project?.color || 'bg-muted';
}

/**
 * Available background colors for project badges
 */
export const AVAILABLE_PROJECT_COLORS = [
  { value: 'bg-blue-500/20', label: 'Blue' },
  { value: 'bg-green-500/20', label: 'Green' },
  { value: 'bg-purple-500/20', label: 'Purple' },
  { value: 'bg-orange-500/20', label: 'Orange' },
  { value: 'bg-pink-500/20', label: 'Pink' },
  { value: 'bg-cyan-500/20', label: 'Cyan' },
  { value: 'bg-amber-500/20', label: 'Amber' },
  { value: 'bg-rose-500/20', label: 'Rose' },
  { value: 'bg-indigo-500/20', label: 'Indigo' },
  { value: 'bg-teal-500/20', label: 'Teal' },
];
