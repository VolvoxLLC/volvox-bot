/**
 * WorkflowSummaryCards - Summary metrics cards for workflow dashboard
 */

import { memo } from 'react';
import { BarChart3, Activity, CheckCircle2, XCircle, TrendingUp, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkflowStats, WorkflowPeriod } from '@/hooks/useWorkflowStats';
import { formatDuration } from '@/hooks/useMetrics';

interface WorkflowSummaryCardsProps {
  stats: WorkflowStats;
  period: WorkflowPeriod;
}

export const WorkflowSummaryCards = memo(function WorkflowSummaryCards({
  stats,
  period,
}: WorkflowSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <SummaryCard
        title="Total Workflows"
        value={stats.totalWorkflows}
        icon={BarChart3}
        color="blue"
      />
      <SummaryCard title="Active Runs" value={stats.activeRuns} icon={Activity} color="blue" />
      <SummaryCard
        title="Completed"
        value={stats.completedRuns}
        subtitle={`(${period})`}
        icon={CheckCircle2}
        color="green"
      />
      <SummaryCard
        title="Failed"
        value={stats.failedRuns}
        subtitle={`(${period})`}
        icon={XCircle}
        color="red"
      />
      <SummaryCard
        title="Success Rate"
        value={`${(stats.successRate * 100).toFixed(1)}%`}
        icon={TrendingUp}
        color={stats.successRate >= 0.8 ? 'green' : stats.successRate >= 0.5 ? 'yellow' : 'red'}
      />
      <SummaryCard
        title="Avg Duration"
        value={formatDuration(stats.avgDuration)}
        icon={Clock}
        color="blue"
      />
    </div>
  );
});

interface SummaryCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  color: 'blue' | 'green' | 'red' | 'yellow';
}

function SummaryCard({ title, value, subtitle, icon: Icon, color }: SummaryCardProps) {
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    green: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    red: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  };

  return (
    <div className="p-6 rounded-lg border bg-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground mb-1">{title}</p>
          <p className="text-3xl font-bold">
            {value} {subtitle && <span className="text-sm text-muted-foreground">{subtitle}</span>}
          </p>
        </div>
        <div className={cn('p-3 rounded-lg', colorClasses[color])}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}
