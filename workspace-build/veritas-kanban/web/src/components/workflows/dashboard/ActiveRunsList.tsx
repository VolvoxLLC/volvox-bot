/**
 * ActiveRunsList - List of currently running workflow runs
 */

import { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import { PlayCircle } from 'lucide-react';
import type { WorkflowRun } from '@/hooks/useWorkflowStats';

interface ActiveRunsListProps {
  runs: WorkflowRun[];
  onSelectRun: (runId: string) => void;
}

export const ActiveRunsList = memo(function ActiveRunsList({
  runs,
  onSelectRun,
}: ActiveRunsListProps) {
  return (
    <div className="space-y-3">
      {runs.map((run) => (
        <ActiveRunCard key={run.id} run={run} onClick={() => onSelectRun(run.id)} />
      ))}
    </div>
  );
});

interface ActiveRunCardProps {
  run: WorkflowRun;
  onClick: () => void;
}

const ActiveRunCard = memo(function ActiveRunCard({ run, onClick }: ActiveRunCardProps) {
  const duration = Math.floor((Date.now() - new Date(run.startedAt).getTime()) / 1000);
  const completedSteps = run.steps?.filter((s) => s.status === 'completed').length;
  const totalSteps = run.steps?.length ?? 0;

  return (
    <div
      className="p-4 rounded-lg border-2 border-blue-500 bg-card hover:bg-accent/50 transition-colors cursor-pointer"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <Badge variant="outline" className="text-xs font-mono">
              {run.id}
            </Badge>
            <Badge className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              <PlayCircle className="h-3 w-3 mr-1" />
              Running
            </Badge>
          </div>

          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
            <div>Started: {new Date(run.startedAt).toLocaleString()}</div>
            <div>
              Duration: {Math.floor(duration / 60)}m {duration % 60}s
            </div>
            {run.currentStep && <div className="font-medium">Current: {run.currentStep}</div>}
          </div>

          <div className="flex items-center gap-2">
            <div className="text-sm text-muted-foreground">
              Progress: {completedSteps}/{totalSteps} steps
            </div>
            <div className="flex-1 max-w-xs h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${(completedSteps / totalSteps) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
