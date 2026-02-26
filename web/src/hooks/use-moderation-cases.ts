import { useCallback, useEffect, useRef, useState } from 'react';
import type { CaseListResponse } from '@/components/dashboard/moderation-types';

const PAGE_LIMIT = 25;

interface UseModerationCasesOptions {
  guildId: string | null;
  page: number;
  sortDesc: boolean;
  actionFilter: string;
  userSearch: string;
  onUnauthorized: () => void;
}

interface UseModerationCasesResult {
  casesData: CaseListResponse | null;
  casesLoading: boolean;
  casesError: string | null;
  refetch: () => void;
}

export function useModerationCases({
  guildId,
  page,
  sortDesc,
  actionFilter,
  userSearch,
  onUnauthorized,
}: UseModerationCasesOptions): UseModerationCasesResult {
  const [casesData, setCasesData] = useState<CaseListResponse | null>(null);
  const [casesLoading, setCasesLoading] = useState(false);
  const [casesError, setCasesError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchCases = useCallback(
    async (id: string, currentPage: number, desc: boolean, action: string, search: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setCasesLoading(true);
      setCasesError(null);

      try {
        const params = new URLSearchParams({
          guildId: id,
          page: String(currentPage),
          limit: String(PAGE_LIMIT),
        });
        if (action !== 'all') params.set('action', action);
        if (search.trim()) params.set('targetId', search.trim());

        const res = await fetch(`/api/moderation/cases?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (res.status === 401) {
          onUnauthorized();
          return;
        }

        const payload: unknown = await res.json();
        if (!res.ok) {
          const msg =
            typeof payload === 'object' &&
            payload !== null &&
            'error' in payload &&
            typeof (payload as Record<string, unknown>).error === 'string'
              ? (payload as Record<string, string>).error
              : 'Failed to fetch cases';
          throw new Error(msg);
        }

        const data = payload as CaseListResponse;
        if (!desc) {
          data.cases = [...data.cases].reverse();
        }
        setCasesData(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setCasesError(err instanceof Error ? err.message : 'Failed to fetch cases');
      } finally {
        setCasesLoading(false);
      }
    },
    [onUnauthorized],
  );

  useEffect(() => {
    if (!guildId) return;
    void fetchCases(guildId, page, sortDesc, actionFilter, userSearch);
  }, [guildId, page, actionFilter, userSearch, fetchCases]);

  // Client-side sort toggle
  useEffect(() => {
    setCasesData((prev) => {
      if (!prev) return prev;
      return { ...prev, cases: [...prev.cases].reverse() };
    });
  }, [sortDesc]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const refetch = useCallback(() => {
    if (guildId) void fetchCases(guildId, page, sortDesc, actionFilter, userSearch);
  }, [guildId, page, sortDesc, actionFilter, userSearch, fetchCases]);

  return { casesData, casesLoading, casesError, refetch };
}
