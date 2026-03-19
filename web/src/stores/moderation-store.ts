import { create } from 'zustand';
import type { CaseListResponse, ModStats } from '@/components/dashboard/moderation-types';

const PAGE_LIMIT = 25;

type FetchResult = 'ok' | 'unauthorized' | 'error';

interface ModerationState {
  // Cases filters & pagination
  page: number;
  sortDesc: boolean;
  actionFilter: string;
  userSearch: string;

  // Cases data
  casesData: CaseListResponse | null;
  casesLoading: boolean;
  casesError: string | null;

  // Stats data
  stats: ModStats | null;
  statsLoading: boolean;
  statsError: string | null;

  // User history lookup
  userHistoryInput: string;
  lookupUserId: string | null;
  userHistoryPage: number;
  userHistoryData: CaseListResponse | null;
  userHistoryLoading: boolean;
  userHistoryError: string | null;

  // Actions — filter/pagination
  setPage: (page: number) => void;
  setSortDesc: (desc: boolean) => void;
  toggleSortDesc: () => void;
  setActionFilter: (filter: string) => void;
  setUserSearch: (search: string) => void;
  setUserHistoryInput: (input: string) => void;
  setLookupUserId: (id: string | null) => void;
  setUserHistoryPage: (page: number) => void;
  clearFilters: () => void;
  clearUserHistory: () => void;
  resetOnGuildChange: () => void;

  // Actions — data fetching
  fetchStats: (guildId: string, opts?: { signal?: AbortSignal }) => Promise<FetchResult>;
  fetchCases: (guildId: string, opts?: { signal?: AbortSignal }) => Promise<FetchResult>;
  fetchUserHistory: (
    guildId: string,
    userId: string,
    histPage: number,
    opts?: { signal?: AbortSignal },
  ) => Promise<FetchResult>;
}

const initialFilters = {
  page: 1,
  sortDesc: true,
  actionFilter: 'all',
  userSearch: '',
  userHistoryInput: '',
  lookupUserId: null as string | null,
  userHistoryPage: 1,
};

const initialData = {
  casesData: null as CaseListResponse | null,
  casesLoading: false,
  casesError: null as string | null,
  stats: null as ModStats | null,
  statsLoading: false,
  statsError: null as string | null,
  userHistoryData: null as CaseListResponse | null,
  userHistoryLoading: false,
  userHistoryError: null as string | null,
};

let latestStatsRequestId = 0;
let latestCasesRequestId = 0;
let latestUserHistoryRequestId = 0;

export const useModerationStore = create<ModerationState>((set, get) => ({
  ...initialFilters,
  ...initialData,

  // ─── Filter / Pagination Actions ──────────────────────────────────
  setPage: (page) => set({ page }),
  setSortDesc: (sortDesc) => set({ sortDesc }),
  toggleSortDesc: () =>
    set((state) => ({
      sortDesc: !state.sortDesc,
      casesData: null,
    })),
  setActionFilter: (actionFilter) => set({ actionFilter }),
  setUserSearch: (userSearch) => set({ userSearch }),
  setUserHistoryInput: (userHistoryInput) => set({ userHistoryInput }),
  setLookupUserId: (lookupUserId) => set({ lookupUserId }),
  setUserHistoryPage: (userHistoryPage) => set({ userHistoryPage }),

  clearFilters: () =>
    set({
      actionFilter: 'all',
      userSearch: '',
      page: 1,
    }),

  clearUserHistory: () =>
    set({
      lookupUserId: null,
      userHistoryInput: '',
      userHistoryPage: 1,
      userHistoryData: null,
      userHistoryError: null,
    }),

  resetOnGuildChange: () => {
    ++latestStatsRequestId;
    ++latestCasesRequestId;
    ++latestUserHistoryRequestId;
    set({ ...initialFilters, ...initialData });
  },

  // ─── Data Fetching ────────────────────────────────────────────────
  fetchStats: async (guildId, opts) => {
    const requestId = ++latestStatsRequestId;
    set({ statsLoading: true, statsError: null });
    try {
      const res = await fetch(`/api/moderation/stats?guildId=${encodeURIComponent(guildId)}`, {
        cache: 'no-store',
        signal: opts?.signal,
      });
      if (requestId !== latestStatsRequestId) return 'ok';
      if (res.status === 401) {
        set({ statsLoading: false });
        return 'unauthorized';
      }
      const payload: unknown = await res.json();
      if (requestId !== latestStatsRequestId) return 'ok';
      if (!res.ok) {
        const msg = extractErrorMessage(payload, 'Failed to fetch stats');
        throw new Error(msg);
      }
      set({ stats: payload as ModStats, statsLoading: false });
      return 'ok';
    } catch (err) {
      if (requestId !== latestStatsRequestId) return 'ok';
      if (isAbortError(err)) {
        set({ statsLoading: false });
        return 'ok';
      }
      set({
        statsError: err instanceof Error ? err.message : 'Failed to fetch stats',
        statsLoading: false,
      });
      return 'error';
    }
  },

  fetchCases: async (guildId, opts) => {
    const requestId = ++latestCasesRequestId;
    const { page, actionFilter, userSearch, sortDesc } = get();
    set({ casesLoading: true, casesError: null });
    try {
      const params = new URLSearchParams({
        guildId,
        page: String(page),
        limit: String(PAGE_LIMIT),
        order: sortDesc ? 'desc' : 'asc',
      });
      if (actionFilter !== 'all') params.set('action', actionFilter);
      if (userSearch.trim()) params.set('targetId', userSearch.trim());

      const res = await fetch(`/api/moderation/cases?${params.toString()}`, {
        cache: 'no-store',
        signal: opts?.signal,
      });
      if (requestId !== latestCasesRequestId) return 'ok';

      if (res.status === 401) {
        set({ casesLoading: false });
        return 'unauthorized';
      }
      const payload: unknown = await res.json();
      if (requestId !== latestCasesRequestId) return 'ok';
      if (!res.ok) {
        const msg = extractErrorMessage(payload, 'Failed to fetch cases');
        throw new Error(msg);
      }

      set({ casesData: payload as CaseListResponse, casesLoading: false });
      return 'ok';
    } catch (err) {
      if (requestId !== latestCasesRequestId) return 'ok';
      if (isAbortError(err)) {
        set({ casesLoading: false });
        return 'ok';
      }
      set({
        casesError: err instanceof Error ? err.message : 'Failed to fetch cases',
        casesLoading: false,
      });
      return 'error';
    }
  },

  fetchUserHistory: async (guildId, userId, histPage, opts) => {
    const requestId = ++latestUserHistoryRequestId;
    set({ userHistoryLoading: true, userHistoryError: null });
    try {
      const params = new URLSearchParams({
        guildId,
        page: String(histPage),
        limit: String(PAGE_LIMIT),
      });
      const res = await fetch(
        `/api/moderation/user/${encodeURIComponent(userId)}/history?${params.toString()}`,
        { cache: 'no-store', signal: opts?.signal },
      );
      if (requestId !== latestUserHistoryRequestId) return 'ok';

      if (res.status === 401) {
        set({ userHistoryLoading: false });
        return 'unauthorized';
      }
      const payload: unknown = await res.json();
      if (requestId !== latestUserHistoryRequestId) return 'ok';
      if (!res.ok) {
        const msg = extractErrorMessage(payload, 'Failed to fetch user history');
        throw new Error(msg);
      }
      set({ userHistoryData: payload as CaseListResponse, userHistoryLoading: false });
      return 'ok';
    } catch (err) {
      if (requestId !== latestUserHistoryRequestId) return 'ok';
      if (isAbortError(err)) {
        set({ userHistoryLoading: false });
        return 'ok';
      }
      set({
        userHistoryError: err instanceof Error ? err.message : 'Failed to fetch user history',
        userHistoryLoading: false,
      });
      return 'error';
    }
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'error' in payload &&
    typeof (payload as Record<string, unknown>).error === 'string'
  ) {
    return (payload as Record<string, string>).error;
  }
  return fallback;
}
