import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import {
  api,
  type Activity,
  type ActivityType,
  type ActivityFilters,
  type ActivityFilterOptions,
} from '../lib/api';
import { useWebSocketStatus } from '@/contexts/WebSocketContext';

export type { Activity, ActivityType, ActivityFilters, ActivityFilterOptions };

/**
 * Polling intervals based on WebSocket connection state.
 * Activity data is updated via WebSocket task:changed and workflow:status events.
 * - Connected: 120s safety-net polling (WS delivers real-time updates)
 * - Disconnected: 30s fallback polling
 */
const POLL_INTERVAL_WS_CONNECTED = 120_000;
const POLL_INTERVAL_WS_DISCONNECTED = 30_000;

export function useActivities(limit: number = 50) {
  const { isConnected } = useWebSocketStatus();

  return useQuery({
    queryKey: ['activities', limit],
    queryFn: () => api.activity.list(limit),
    refetchInterval: isConnected ? POLL_INTERVAL_WS_CONNECTED : POLL_INTERVAL_WS_DISCONNECTED,
    staleTime: isConnected ? 60_000 : 15_000,
  });
}

/**
 * Infinite-scroll activity feed with filters.
 * Each page fetches `pageSize` activities. The backend already returns newest-first.
 */
export function useActivityFeed(pageSize: number = 30, filters?: ActivityFilters) {
  const { isConnected } = useWebSocketStatus();

  return useInfiniteQuery<Activity[]>({
    queryKey: ['activity-feed', pageSize, filters],
    queryFn: ({ pageParam }) => {
      return api.activity.list(pageSize, filters, pageParam as number);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      // If we got fewer items than pageSize, there are no more pages
      if (lastPage.length < pageSize) return undefined;
      return (lastPageParam as number) + 1;
    },
    refetchInterval: isConnected ? POLL_INTERVAL_WS_CONNECTED : POLL_INTERVAL_WS_DISCONNECTED,
    staleTime: isConnected ? 60_000 : 15_000,
  });
}

/**
 * Fetch available filter options (distinct agents and activity types).
 */
export function useActivityFilterOptions() {
  return useQuery<ActivityFilterOptions>({
    queryKey: ['activity-filter-options'],
    queryFn: () => api.activity.filters(),
    staleTime: 60000,
  });
}

export function useClearActivities() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.activity.clear(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      queryClient.invalidateQueries({ queryKey: ['activity-feed'] });
      queryClient.invalidateQueries({ queryKey: ['activity-filter-options'] });
    },
  });
}
