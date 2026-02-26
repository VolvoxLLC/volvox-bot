import { useCallback, useEffect, useRef, useState } from "react";
import type { ModStats } from "@/components/dashboard/moderation-types";

interface UseModerationStatsOptions {
  guildId: string | null;
  onUnauthorized: () => void;
}

interface UseModerationStatsResult {
  stats: ModStats | null;
  statsLoading: boolean;
  statsError: string | null;
  refetch: () => void;
}

export function useModerationStats({
  guildId,
  onUnauthorized,
}: UseModerationStatsOptions): UseModerationStatsResult {
  const [stats, setStats] = useState<ModStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchStats = useCallback(
    async (id: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatsLoading(true);
      setStatsError(null);

      try {
        const res = await fetch(
          `/api/moderation/stats?guildId=${encodeURIComponent(id)}`,
          { cache: "no-store", signal: controller.signal },
        );

        if (res.status === 401) {
          onUnauthorized();
          return;
        }

        const payload: unknown = await res.json();
        if (!res.ok) {
          const msg =
            typeof payload === "object" &&
            payload !== null &&
            "error" in payload &&
            typeof (payload as Record<string, unknown>).error === "string"
              ? (payload as Record<string, string>).error
              : "Failed to fetch stats";
          throw new Error(msg);
        }

        setStats(payload as ModStats);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setStatsError(err instanceof Error ? err.message : "Failed to fetch stats");
      } finally {
        setStatsLoading(false);
      }
    },
    [onUnauthorized],
  );

  useEffect(() => {
    if (!guildId) return;
    void fetchStats(guildId);
  }, [guildId, fetchStats]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const refetch = useCallback(() => {
    if (guildId) void fetchStats(guildId);
  }, [guildId, fetchStats]);

  return { stats, statsLoading, statsError, refetch };
}
