import { create } from 'zustand';

export interface TicketSummary {
  id: number;
  guild_id: string;
  user_id: string;
  topic: string | null;
  status: string;
  thread_id: string;
  channel_id: string | null;
  closed_by: string | null;
  close_reason: string | null;
  created_at: string;
  closed_at: string | null;
}

export interface TicketStats {
  openCount: number;
  avgResolutionSeconds: number;
  ticketsThisWeek: number;
}

interface TicketsApiResponse {
  tickets: TicketSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface TicketsState {
  // Data
  tickets: TicketSummary[];
  total: number;
  stats: TicketStats | null;

  // Status
  loading: boolean;
  error: string | null;

  // Filters / Pagination
  page: number;
  statusFilter: string;
  search: string;
  debouncedSearch: string;

  // Actions — setters
  setTickets: (tickets: TicketSummary[]) => void;
  setTotal: (total: number) => void;
  setStats: (stats: TicketStats | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setPage: (page: number) => void;
  setStatusFilter: (status: string) => void;
  setSearch: (search: string) => void;
  setDebouncedSearch: (search: string) => void;
  resetAll: () => void;

  // Actions — data fetching
  fetchStats: (guildId: string, signal?: AbortSignal) => Promise<'ok' | 'error'>;
  fetchTickets: (opts: {
    guildId: string;
    status: string;
    user: string;
    page: number;
    signal?: AbortSignal;
  }) => Promise<'ok' | 'unauthorized' | 'error'>;
  refresh: (guildId: string) => Promise<'ok' | 'unauthorized' | 'error'>;
}

const initialState = {
  tickets: [] as TicketSummary[],
  total: 0,
  stats: null as TicketStats | null,
  loading: false,
  error: null as string | null,
  page: 1,
  statusFilter: '',
  search: '',
  debouncedSearch: '',
};

const PAGE_SIZE = 25;
let latestTicketsRequestId = 0;

export const useTicketsStore = create<TicketsState>((set, get) => ({
  ...initialState,

  setTickets: (tickets) => set({ tickets }),
  setTotal: (total) => set({ total }),
  setStats: (stats) => set({ stats }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setPage: (page) => set({ page }),
  setStatusFilter: (statusFilter) => set({ statusFilter, page: 1 }), // Reset page on filter change
  setSearch: (search) => set({ search }),
  setDebouncedSearch: (debouncedSearch) => set({ debouncedSearch, page: 1 }), // Reset page on search

  resetAll: () => {
    ++latestTicketsRequestId;
    set({ ...initialState });
  },

  fetchStats: async (guildId, signal) => {
    try {
      const res = await fetch(
        `/api/guilds/${encodeURIComponent(guildId)}/tickets/stats`,
        signal ? { signal } : undefined,
      );
      if (res.ok) {
        const data = (await res.json()) as TicketStats;
        set({ stats: data });
        return 'ok';
      }
      return 'error';
    } catch {
      return 'error';
    }
  },

  fetchTickets: async (opts) => {
    const requestId = ++latestTicketsRequestId;
    set({ loading: true, error: null });

    try {
      const params = new URLSearchParams();
      params.set('page', String(opts.page));
      params.set('limit', String(PAGE_SIZE));
      if (opts.status) params.set('status', opts.status);
      if (opts.user) params.set('user', opts.user);

      const res = await fetch(
        `/api/guilds/${encodeURIComponent(opts.guildId)}/tickets?${params.toString()}`,
        { signal: opts.signal },
      );

      if (requestId !== latestTicketsRequestId) return 'ok';

      if (res.status === 401) {
        set({ loading: false });
        return 'unauthorized';
      }
      if (!res.ok) {
        throw new Error(`Failed to fetch tickets (${res.status})`);
      }

      const data = (await res.json()) as TicketsApiResponse;
      set({
        tickets: data.tickets,
        total: data.total,
        loading: false,
      });
      return 'ok';
    } catch (err) {
      if (requestId !== latestTicketsRequestId) return 'ok';
      if (err instanceof DOMException && err.name === 'AbortError') {
        set({ loading: false });
        return 'ok';
      }
      set({
        error: err instanceof Error ? err.message : 'Failed to fetch tickets',
        loading: false,
      });
      return 'error';
    }
  },

  refresh: async (guildId) => {
    const state = get();
    // fetchStats and fetchTickets concurrently
    const [_statsResult, ticketsResult] = await Promise.all([
      state.fetchStats(guildId),
      state.fetchTickets({
        guildId,
        status: state.statusFilter,
        user: state.debouncedSearch,
        page: state.page,
      }),
    ]);
    return ticketsResult === 'unauthorized' ? 'unauthorized' : 'ok';
  },
}));
