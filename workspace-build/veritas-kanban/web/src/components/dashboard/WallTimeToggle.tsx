/**
 * WallTimeToggle — Toggle between wall time and active time views
 * GH #60: Dashboard wall time vs active time toggle
 *
 * Wall time = total elapsed time across all runs (sum of durations)
 * Active time = average run duration (how long a typical run takes)
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/helpers';
import { formatDuration, type MetricsPeriod } from '@/hooks/useMetrics';
import { Clock, Timer, ToggleLeft, ToggleRight, Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface WallTimeToggleProps {
  period: MetricsPeriod;
}

interface TaskCostEntry {
  taskId: string;
  totalDurationMs: number;
  runs: number;
}

interface TaskCostResult {
  tasks: TaskCostEntry[];
}

export function WallTimeToggle({ period }: WallTimeToggleProps) {
  const [showActive, setShowActive] = useState(false);

  // Get actual duration data from task-cost (which now includes totalDurationMs)
  const { data: taskCost } = useQuery<TaskCostResult>({
    queryKey: ['task-cost', period],
    queryFn: () => apiFetch<TaskCostResult>(`/api/metrics/task-cost?period=${period}`),
    staleTime: 60_000,
  });

  // Wall time = sum of all run durations
  const wallTime = taskCost?.tasks?.reduce((sum, t) => sum + (t.totalDurationMs || 0), 0) || 0;
  const totalRuns = taskCost?.tasks?.reduce((sum, t) => sum + t.runs, 0) || 0;
  // Active time = average per run
  const activeTime = totalRuns > 0 ? wallTime / totalRuns : 0;
  // Efficiency = ratio of tasks actually worked vs calendar time in period
  const periodHours = period === '24h' ? 24 : period === '3d' ? 72 : period === '7d' ? 168 : period === '30d' ? 720 : 168;
  const efficiency = periodHours > 0 ? ((wallTime / 3600000) / periodHours) * 100 : 0;

  const displayTime = showActive ? activeTime : wallTime;
  const label = showActive ? 'Avg Run Duration' : 'Total Agent Time';
  const Icon = showActive ? Timer : Clock;

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          {label}
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="inline-flex"><Info className="w-3 h-3 text-muted-foreground" /></button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[250px]">
                <p className="text-xs">
                  <strong>Total Agent Time:</strong> Sum of all run durations in the period.
                  <br /><br />
                  <strong>Avg Run Duration:</strong> Average time per agent run.
                  <br /><br />
                  <strong>Utilization:</strong> Percentage of calendar time with agent activity.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </h3>
        <button
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setShowActive(!showActive)}
        >
          {showActive ? (
            <ToggleRight className="w-4 h-4 text-purple-500" />
          ) : (
            <ToggleLeft className="w-4 h-4" />
          )}
          {showActive ? 'Per Run' : 'Total'}
        </button>
      </div>

      <div className="text-2xl font-bold mb-1">
        {formatDuration(displayTime)}
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <div className="flex justify-between">
          <span>Total time</span>
          <span className={!showActive ? 'font-medium text-foreground' : ''}>{formatDuration(wallTime)}</span>
        </div>
        <div className="flex justify-between">
          <span>Avg per run</span>
          <span className={showActive ? 'font-medium text-foreground' : ''}>{formatDuration(activeTime)}</span>
        </div>
        <div className="flex justify-between">
          <span>Total runs</span>
          <span>{totalRuns}</span>
        </div>
        <div className="flex justify-between pt-1 border-t">
          <span>Utilization</span>
          <span className="font-medium" style={{ color: efficiency > 10 ? '#22c55e' : efficiency > 3 ? '#f59e0b' : '#6b7280' }}>
            {efficiency.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}
