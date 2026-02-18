import { useEffect, useRef, useCallback } from 'react';

export interface UsePollingOptions {
  /** Polling interval in milliseconds */
  interval: number;
  /** Whether polling is enabled */
  enabled?: boolean;
  /** Callback to execute on each poll */
  onPoll: () => void | Promise<void>;
  /** Whether to poll immediately on mount */
  immediate?: boolean;
}

/**
 * Shared polling hook for consistent polling behavior across the app.
 * 
 * Features:
 * - Automatic cleanup on unmount
 * - Pause/resume with enabled flag
 * - Optional immediate execution
 * - Safe async handling
 * 
 * @example
 * ```tsx
 * usePolling({
 *   interval: 10000,
 *   enabled: isVisible && !isPaused,
 *   onPoll: fetchData,
 *   immediate: true,
 * });
 * ```
 */
export function usePolling({
  interval,
  enabled = true,
  onPoll,
  immediate = false,
}: UsePollingOptions): void {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const poll = useCallback(async () => {
    if (!mountedRef.current) return;
    try {
      await onPoll();
    } catch (error) {
      // Silently ignore polling errors - consumer can handle in onPoll
      console.debug('[usePolling] Poll error:', error);
    }
  }, [onPoll]);

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) {
      // Clear any existing interval when disabled
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Poll immediately if requested
    if (immediate) {
      poll();
    }

    // Start the interval
    intervalRef.current = setInterval(poll, interval);

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, interval, poll, immediate]);
}

/**
 * Hook for conditional polling that starts/stops based on a condition.
 * Commonly used for polling while a task is running.
 * 
 * @example
 * ```tsx
 * useConditionalPolling({
 *   condition: task?.status === 'in-progress',
 *   interval: 2000,
 *   onPoll: refetchTask,
 * });
 * ```
 */
export function useConditionalPolling({
  condition,
  interval,
  onPoll,
}: {
  condition: boolean;
  interval: number;
  onPoll: () => void | Promise<void>;
}): void {
  usePolling({
    interval,
    enabled: condition,
    onPoll,
    immediate: false,
  });
}

/**
 * Creates polling interval config for react-query's refetchInterval.
 * Use this for consistent conditional polling across useQuery hooks.
 * 
 * @example
 * ```tsx
 * useQuery({
 *   queryKey: ['task', id],
 *   queryFn: fetchTask,
 *   refetchInterval: getConditionalRefetchInterval(
 *     (data) => data?.running,
 *     2000
 *   ),
 * });
 * ```
 */
export function getConditionalRefetchInterval<T>(
  condition: (data: T | undefined) => boolean,
  intervalMs: number,
): (query: { state: { data: T | undefined } }) => number | false {
  return (query) => (condition(query.state.data) ? intervalMs : false);
}
