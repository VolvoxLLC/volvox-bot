import { useCallback, useEffect, useRef, useState } from "react";
import type { CaseListResponse } from "@/components/dashboard/moderation-types";

const PAGE_LIMIT = 25;

interface UseUserHistoryOptions {
  guildId: string | null;
  lookupUserId: string | null;
  page: number;
  onUnauthorized: () => void;
}

interface UseUserHistoryResult {
  userHistoryData: CaseListResponse | null;
  userHistoryLoading: boolean;
  userHistoryError: string | null;
  setUserHistoryData: (data: CaseListResponse | null) => void;
  setUserHistoryError: (error: string | null) => void;
  fetchUserHistory: (id: string, userId: string, histPage: number) => void;
}

export function useUserHistory({
  guildId,
  lookupUserId,
  page,
  onUnauthorized,
}: UseUserHistoryOptions): UseUserHistoryResult {
  const [userHistoryData, setUserHistoryData] = useState<CaseListResponse | null>(null);
  const [userHistoryLoading, setUserHistoryLoading] = useState(false);
  const [userHistoryError, setUserHistoryError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchUserHistory = useCallback(
    async (id: string, userId: string, histPage: number) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setUserHistoryLoading(true);
      setUserHistoryError(null);

      try {
        const params = new URLSearchParams({
          guildId: id,
          page: String(histPage),
          limit: String(PAGE_LIMIT),
        });

        const res = await fetch(
          `/api/moderation/user/${encodeURIComponent(userId)}/history?${params.toString()}`,
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
              : "Failed to fetch user history";
          throw new Error(msg);
        }

        setUserHistoryData(payload as CaseListResponse);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setUserHistoryError(
          err instanceof Error ? err.message : "Failed to fetch user history",
        );
      } finally {
        setUserHistoryLoading(false);
      }
    },
    [onUnauthorized],
  );

  useEffect(() => {
    if (!guildId || !lookupUserId) return;
    void fetchUserHistory(guildId, lookupUserId, page);
  }, [guildId, lookupUserId, page, fetchUserHistory]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  return {
    userHistoryData,
    userHistoryLoading,
    userHistoryError,
    setUserHistoryData,
    setUserHistoryError,
    fetchUserHistory,
  };
}
