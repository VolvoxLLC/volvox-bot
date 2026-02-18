import { useQuery } from '@tanstack/react-query';
import { api, type StatusHistoryEntry, type DailySummary } from '../lib/api';
import { useWebSocketStatus } from '@/contexts/WebSocketContext';

export type { StatusHistoryEntry, DailySummary };

/**
 * Fetch status history entries
 */
export function useStatusHistory(limit: number = 100, offset: number = 0) {
  const { isConnected } = useWebSocketStatus();
  return useQuery({
    queryKey: ['status-history', limit, offset],
    queryFn: () => api.statusHistory.list(limit, offset),
    // Status history updates less frequently
    // - Connected: 300s (5min) safety-net polling
    // - Disconnected: 60s fallback polling
    refetchInterval: isConnected ? 300_000 : 60_000,
    staleTime: isConnected ? 120_000 : 30_000,
  });
}

/**
 * Fetch daily summary for a specific date (or today if not specified)
 */
export function useDailySummary(date?: string) {
  const { isConnected } = useWebSocketStatus();
  return useQuery({
    queryKey: ['status-history', 'daily', date || 'today'],
    queryFn: () => api.statusHistory.getDailySummary(date),
    // Daily summaries update less frequently
    // - Connected: 300s (5min) safety-net polling
    // - Disconnected: 60s fallback polling
    refetchInterval: isConnected ? 300_000 : 60_000,
    staleTime: isConnected ? 120_000 : 30_000,
  });
}

/**
 * Fetch weekly summary (last 7 days)
 */
export function useWeeklySummary() {
  const { isConnected } = useWebSocketStatus();
  return useQuery({
    queryKey: ['status-history', 'weekly'],
    queryFn: () => api.statusHistory.getWeeklySummary(),
    // Weekly summaries already infrequent - maintain 5min baseline
    // - Connected: 300s (5min) safety-net polling
    // - Disconnected: 300s (keep same, already reasonable)
    refetchInterval: 300_000,
    staleTime: isConnected ? 120_000 : 60_000,
  });
}

/**
 * Format milliseconds to human-readable duration
 */
export function formatDurationMs(ms: number): string {
  if (ms < 1000) return '< 1s';

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  return `${seconds}s`;
}

/**
 * Calculate percentage of active time
 */
export function calculateActivePercent(summary: DailySummary): number {
  const total = summary.activeMs + summary.idleMs + summary.errorMs;
  if (total === 0) return 0;
  return Math.round((summary.activeMs / total) * 100);
}

/**
 * Get status color class
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'working':
    case 'thinking':
      return 'bg-green-500';
    case 'sub-agent':
      return 'bg-purple-500';
    case 'idle':
      return 'bg-gray-400';
    case 'error':
      return 'bg-red-500';
    default:
      return 'bg-gray-300';
  }
}

/**
 * Get status text color class
 */
export function getStatusTextColor(status: string): string {
  switch (status) {
    case 'working':
    case 'thinking':
      return 'text-green-500';
    case 'sub-agent':
      return 'text-purple-500';
    case 'idle':
      return 'text-gray-500';
    case 'error':
      return 'text-red-500';
    default:
      return 'text-gray-400';
  }
}
