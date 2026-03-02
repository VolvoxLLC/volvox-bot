import { useCallback, useEffect, useRef, useState } from 'react';
import { useGuildSelection } from '@/hooks/use-guild-selection';
import type { FeedbackStats } from '@/types/api';

interface UseAiFeedbackStatsResult {
  stats: FeedbackStats | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetches AI feedback stats for the currently selected guild.
 *
 * Uses an AbortController via ref to cancel in-flight requests when the
 * guild changes or the component unmounts, preventing stale-state races.
 */
export function useAiFeedbackStats(days = 30): UseAiFeedbackStatsResult {
  const guildId = useGuildSelection();
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchStats = useCallback(
    async (id: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/guilds/${encodeURIComponent(id)}/ai-feedback/stats?days=${days}`,
          { credentials: 'include', signal: controller.signal },
        );

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = (await res.json()) as FeedbackStats;
        setStats(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load feedback stats');
      } finally {
        setLoading(false);
      }
    },
    [days],
  );

  useEffect(() => {
    if (!guildId) return;
    void fetchStats(guildId);
  }, [guildId, fetchStats]);

  // Cancel any in-flight request on unmount
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const refetch = useCallback(() => {
    if (guildId) void fetchStats(guildId);
  }, [guildId, fetchStats]);

  return { stats, loading, error, refetch };
}
