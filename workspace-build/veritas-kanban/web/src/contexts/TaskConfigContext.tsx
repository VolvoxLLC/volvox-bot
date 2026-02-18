import { createContext, useContext, ReactNode } from 'react';
import { useTaskTypes } from '@/hooks/useTaskTypes';
import { useProjects } from '@/hooks/useProjects';
import { useSprints } from '@/hooks/useSprints';
import type { TaskTypeConfig, ProjectConfig, SprintConfig } from '@veritas-kanban/shared';

interface TaskConfigContextValue {
  taskTypes: TaskTypeConfig[];
  projects: ProjectConfig[];
  sprints: SprintConfig[];
  isLoading: boolean;
}

const TaskConfigContext = createContext<TaskConfigContextValue | null>(null);

export function TaskConfigProvider({ children }: { children: ReactNode }) {
  const { data: taskTypes = [], isLoading: taskTypesLoading } = useTaskTypes();
  const { data: projects = [], isLoading: projectsLoading } = useProjects();
  const { data: sprints = [], isLoading: sprintsLoading } = useSprints();

  const isLoading = taskTypesLoading || projectsLoading || sprintsLoading;

  return (
    <TaskConfigContext.Provider value={{ taskTypes, projects, sprints, isLoading }}>
      {children}
    </TaskConfigContext.Provider>
  );
}

export function useTaskConfig() {
  const context = useContext(TaskConfigContext);
  if (!context) {
    throw new Error('useTaskConfig must be used within TaskConfigProvider');
  }
  return context;
}
