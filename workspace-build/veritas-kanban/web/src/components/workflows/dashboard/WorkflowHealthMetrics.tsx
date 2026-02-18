/**
 * WorkflowHealthMetrics - Per-workflow health statistics
 */

import { memo } from 'react';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/hooks/useMetrics';

interface WorkflowHealthMetricsProps {
  workflowStats: Array<{
    workflowId: string;
    workflowName: string;
    runs: number;
    completed: number;
    failed: number;
    successRate: number;
    avgDuration: number;
  }>;
}

export const WorkflowHealthMetrics = memo(function WorkflowHealthMetrics({
  workflowStats,
}: WorkflowHealthMetricsProps) {
  return (
    <div className="space-y-3">
      {workflowStats.map((stats) => (
        <WorkflowHealthCard key={stats.workflowId} stats={stats} />
      ))}
    </div>
  );
});

interface WorkflowHealthCardProps {
  stats: {
    workflowId: string;
    workflowName: string;
    runs: number;
    completed: number;
    failed: number;
    successRate: number;
    avgDuration: number;
  };
}

const WorkflowHealthCard = memo(function WorkflowHealthCard({ stats }: WorkflowHealthCardProps) {
  const successRatePercent = (stats.successRate * 100).toFixed(1);
  const healthColor =
    stats.successRate >= 0.8 ? 'green' : stats.successRate >= 0.5 ? 'yellow' : 'red';

  const colorClasses = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
  };

  return (
    <div className="p-4 rounded-lg border bg-card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold mb-2">{stats.workflowName}</h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Runs</p>
              <p className="font-medium">{stats.runs}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Success Rate</p>
              <p className="font-medium">{successRatePercent}%</p>
            </div>
            <div>
              <p className="text-muted-foreground">Completed</p>
              <p className="font-medium text-green-600">{stats.completed}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Failed</p>
              <p className="font-medium text-red-600">{stats.failed}</p>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <div className="text-sm text-muted-foreground">
              Avg Duration: {formatDuration(stats.avgDuration)}
            </div>
            <div className="flex-1 max-w-xs h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className={cn('h-full transition-all', colorClasses[healthColor])}
                style={{ width: `${stats.successRate * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
