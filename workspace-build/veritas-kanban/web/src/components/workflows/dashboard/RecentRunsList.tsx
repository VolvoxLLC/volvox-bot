/**
 * RecentRunsList - List of recent workflow runs with status filtering
 */

import { memo, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Clock, PlayCircle, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkflowRun } from '@/hooks/useWorkflowStats';

interface RecentRunsListProps {
  runs: WorkflowRun[];
  statusFilter: string;
  onSelectRun: (runId: string) => void;
}

export const RecentRunsList = memo(function RecentRunsList({
  runs,
  statusFilter,
  onSelectRun,
}: RecentRunsListProps) {
  const filteredRuns = useMemo(() => {
    // Sort by startedAt descending, take top 50
    const sorted = [...runs].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
    const limited = sorted.slice(0, 50);

    // Apply status filter
    return limited.filter((run) => statusFilter === 'all' || run.status === statusFilter);
  }, [runs, statusFilter]);

  if (filteredRuns.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {statusFilter !== 'all' ? 'No runs match your filter' : 'No recent runs'}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filteredRuns.map((run) => (
        <RecentRunCard key={run.id} run={run} onClick={() => onSelectRun(run.id)} />
      ))}
    </div>
  );
});

interface RecentRunCardProps {
  run: WorkflowRun;
  onClick: () => void;
}

const RecentRunCard = memo(function RecentRunCard({ run, onClick }: RecentRunCardProps) {
  const duration = run.completedAt
    ? Math.floor((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)
    : Math.floor((Date.now() - new Date(run.startedAt).getTime()) / 1000);

  const completedSteps = run.steps?.filter((s) => s.status === 'completed').length;
  const totalSteps = run.steps?.length ?? 0;

  const statusConfig = {
    pending: {
      icon: Clock,
      color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
      label: 'Pending',
    },
    running: {
      icon: PlayCircle,
      color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      label: 'Running',
    },
    completed: {
      icon: CheckCircle2,
      color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      label: 'Completed',
    },
    failed: {
      icon: XCircle,
      color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      label: 'Failed',
    },
    blocked: {
      icon: AlertCircle,
      color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      label: 'Blocked',
    },
  };

  const config = statusConfig[run.status];
  const Icon = config.icon;

  return (
    <div
      className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
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
            <Badge className={cn('text-xs', config.color)}>
              <Icon className="h-3 w-3 mr-1" />
              {config.label}
            </Badge>
          </div>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div>Started: {new Date(run.startedAt).toLocaleString()}</div>
            <div>
              Duration: {Math.floor(duration / 60)}m {duration % 60}s
            </div>
            <div>
              Steps: {completedSteps}/{totalSteps}
            </div>
          </div>

          {run.error && <div className="mt-2 text-sm text-destructive">Error: {run.error}</div>}
        </div>
      </div>
    </div>
  );
});
