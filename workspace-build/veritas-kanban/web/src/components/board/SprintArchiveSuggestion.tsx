import { useMemo, useState } from 'react';
import { Archive, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBulkArchive } from '@/hooks/useTasks';
import type { Task } from '@veritas-kanban/shared';

interface SprintArchiveSuggestionProps {
  tasks: Task[];
}

interface CompletedSprint {
  name: string;
  taskCount: number;
}

export function SprintArchiveSuggestion({ tasks }: SprintArchiveSuggestionProps) {
  const bulkArchive = useBulkArchive();
  const [dismissedSprints, setDismissedSprints] = useState<Set<string>>(new Set());
  const [archivingSprint, setArchivingSprint] = useState<string | null>(null);

  // Find sprints where all tasks are done
  const completedSprints = useMemo(() => {
    const sprintTaskCounts = new Map<string, { total: number; done: number }>();
    
    tasks.forEach(task => {
      if (!task.sprint) return;
      
      const counts = sprintTaskCounts.get(task.sprint) || { total: 0, done: 0 };
      counts.total++;
      if (task.status === 'done') counts.done++;
      sprintTaskCounts.set(task.sprint, counts);
    });

    const completed: CompletedSprint[] = [];
    sprintTaskCounts.forEach((counts, name) => {
      if (counts.total > 0 && counts.total === counts.done && !dismissedSprints.has(name)) {
        completed.push({ name, taskCount: counts.total });
      }
    });

    return completed;
  }, [tasks, dismissedSprints]);

  const handleArchive = async (sprint: string) => {
    setArchivingSprint(sprint);
    try {
      await bulkArchive.mutateAsync(sprint);
      setDismissedSprints(prev => new Set(prev).add(sprint));
    } finally {
      setArchivingSprint(null);
    }
  };

  const handleDismiss = (sprint: string) => {
    setDismissedSprints(prev => new Set(prev).add(sprint));
  };

  if (completedSprints.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {completedSprints.map(sprint => (
        <div
          key={sprint.name}
          className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20"
        >
          <Archive className="h-5 w-5 text-green-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              All tasks in sprint "{sprint.name}" are complete!
            </p>
            <p className="text-xs text-muted-foreground">
              {sprint.taskCount} task{sprint.taskCount > 1 ? 's' : ''} ready to archive
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleArchive(sprint.name)}
              disabled={archivingSprint === sprint.name}
            >
              {archivingSprint === sprint.name ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Archive className="h-4 w-4 mr-1" />
              )}
              Archive Sprint
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDismiss(sprint.name)}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
