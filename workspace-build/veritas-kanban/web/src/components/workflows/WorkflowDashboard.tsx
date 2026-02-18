/**
 * WorkflowDashboard - Comprehensive workflow monitoring dashboard
 *
 * Features:
 * - Summary cards (total workflows, active runs, completed/failed runs, success rate, avg duration)
 * - Active runs table (live updates via WebSocket)
 * - Recent runs history (sortable/filterable)
 * - Per-workflow health metrics
 */

import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Activity, Clock, Zap, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkflowRunView } from './WorkflowRunView';
import { useWebSocket, type WebSocketMessage } from '@/hooks/useWebSocket';
import { useWebSocketStatus } from '@/contexts/WebSocketContext';
import { useQueryClient } from '@tanstack/react-query';
import {
  useWorkflowStats,
  useActiveRuns,
  useRecentRuns,
  type WorkflowPeriod,
  type WorkflowRun,
} from '@/hooks/useWorkflowStats';
import { WorkflowSummaryCards } from './dashboard/WorkflowSummaryCards';
import { ActiveRunsList } from './dashboard/ActiveRunsList';
import { RecentRunsList } from './dashboard/RecentRunsList';
import { WorkflowHealthMetrics } from './dashboard/WorkflowHealthMetrics';

interface WorkflowDashboardProps {
  onBack: () => void;
}

interface WorkflowStatusMessage extends WebSocketMessage {
  type: 'workflow:status';
  data: WorkflowRun;
}

function isWorkflowStatusMessage(msg: WebSocketMessage): msg is WorkflowStatusMessage {
  return msg.type === 'workflow:status' && typeof msg.data === 'object' && msg.data !== null;
}

export function WorkflowDashboard({ onBack }: WorkflowDashboardProps) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [period, setPeriod] = useState<WorkflowPeriod>('7d');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { toast } = useToast();
  const { isConnected } = useWebSocketStatus();
  const queryClient = useQueryClient();

  // Fetch data with React Query
  const { data: stats, isLoading: isStatsLoading, error: statsError } = useWorkflowStats(period);

  const {
    data: activeRuns = [],
    isLoading: isActiveRunsLoading,
    error: activeRunsError,
  } = useActiveRuns();

  const {
    data: recentRuns = [],
    isLoading: isRecentRunsLoading,
    error: recentRunsError,
  } = useRecentRuns();

  // Show toast on errors (in useEffect to avoid infinite render loop)
  useEffect(() => {
    if (statsError) {
      toast({
        title: '❌ Failed to load workflow stats',
        description: statsError instanceof Error ? statsError.message : 'Unknown error',
      });
    }
  }, [statsError, toast]);

  useEffect(() => {
    if (activeRunsError) {
      toast({
        title: '❌ Failed to load active runs',
        description: activeRunsError instanceof Error ? activeRunsError.message : 'Unknown error',
      });
    }
  }, [activeRunsError, toast]);

  useEffect(() => {
    if (recentRunsError) {
      toast({
        title: '❌ Failed to load recent runs',
        description: recentRunsError instanceof Error ? recentRunsError.message : 'Unknown error',
      });
    }
  }, [recentRunsError, toast]);

  // WebSocket subscription for live updates
  const handleWebSocketMessage = useCallback(
    (message: WebSocketMessage) => {
      if (isWorkflowStatusMessage(message)) {
        const updatedRun = message.data;

        // Invalidate queries to trigger refetch
        queryClient.invalidateQueries({ queryKey: ['workflow-active-runs'] });
        queryClient.invalidateQueries({ queryKey: ['workflow-recent-runs'] });

        // Refetch stats on completion/failure
        if (updatedRun.status === 'completed' || updatedRun.status === 'failed') {
          queryClient.invalidateQueries({ queryKey: ['workflow-stats'] });
        }
      }
    },
    [queryClient]
  );

  useWebSocket({
    autoConnect: true,
    onMessage: handleWebSocketMessage,
  });

  if (selectedRunId) {
    return <WorkflowRunView runId={selectedRunId} onBack={() => setSelectedRunId(null)} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Workflows
          </Button>
          <h1 className="text-2xl font-bold">Workflow Dashboard</h1>
        </div>

        <Select value={period} onValueChange={(value) => setPeriod(value as WorkflowPeriod)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="24h">Last 24 hours</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      {isStatsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : stats ? (
        <WorkflowSummaryCards stats={stats} period={period} />
      ) : null}

      {/* Active Runs */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Active Runs</h2>
          <Badge variant="secondary">{activeRuns.length}</Badge>
          {!isConnected && (
            <Badge variant="outline" className="text-yellow-600">
              <AlertCircle className="h-3 w-3 mr-1" />
              WebSocket disconnected
            </Badge>
          )}
        </div>

        {isActiveRunsLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : activeRuns.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No active runs</div>
        ) : (
          <ActiveRunsList runs={activeRuns} onSelectRun={setSelectedRunId} />
        )}
      </div>

      {/* Recent Runs */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Recent Runs</h2>
            <Badge variant="secondary">{recentRuns.length}</Badge>
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isRecentRunsLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : (
          <RecentRunsList
            runs={recentRuns}
            statusFilter={statusFilter}
            onSelectRun={setSelectedRunId}
          />
        )}
      </div>

      {/* Workflow Health */}
      {stats && stats.perWorkflow.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Workflow Health</h2>
          </div>

          <WorkflowHealthMetrics workflowStats={stats.perWorkflow} />
        </div>
      )}
    </div>
  );
}
