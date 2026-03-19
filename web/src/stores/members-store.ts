import { create } from 'zustand';
import type { MemberRow, SortColumn, SortOrder } from '@/components/dashboard/member-table';

interface MembersApiResponse {
  members: MemberRow[];
  nextAfter: string | null;
  total: number;
  filteredTotal?: number;
}

interface MembersState {
  // Data
  members: MemberRow[];
  nextAfter: string | null;
  total: number;
  filteredTotal: number | null;

  // Status
  loading: boolean;
  error: string | null;

  // Filters / sort
  search: string;
  debouncedSearch: string;
  sortColumn: SortColumn;
  sortOrder: SortOrder;

  // Actions — setters
  setMembers: (members: MemberRow[]) => void;
  appendMembers: (members: MemberRow[]) => void;
  setNextAfter: (cursor: string | null) => void;
  setTotal: (total: number) => void;
  setFilteredTotal: (n: number | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSearch: (search: string) => void;
  setDebouncedSearch: (search: string) => void;
  setSortColumn: (col: SortColumn) => void;
  setSortOrder: (order: SortOrder) => void;
  resetPagination: () => void;
  resetAll: () => void;

  // Actions — data fetching
  fetchMembers: (opts: {
    guildId: string;
    search: string;
    sortColumn: SortColumn;
    sortOrder: SortOrder;
    after: string | null;
    append: boolean;
    signal?: AbortSignal;
  }) => Promise<'ok' | 'unauthorized' | 'error'>;
}

const initialState = {
  members: [] as MemberRow[],
  nextAfter: null as string | null,
  total: 0,
  filteredTotal: null as number | null,
  loading: false,
  error: null as string | null,
  search: '',
  debouncedSearch: '',
  sortColumn: 'xp' as SortColumn,
  sortOrder: 'desc' as SortOrder,
};

let latestMembersRequestId = 0;

export const useMembersStore = create<MembersState>((set) => ({
  ...initialState,

  setMembers: (members) => set({ members }),
  appendMembers: (members) => set((state) => ({ members: [...state.members, ...members] })),
  setNextAfter: (nextAfter) => set({ nextAfter }),
  setTotal: (total) => set({ total }),
  setFilteredTotal: (filteredTotal) => set({ filteredTotal }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setSearch: (search) => set({ search }),
  setDebouncedSearch: (debouncedSearch) => set({ debouncedSearch }),
  setSortColumn: (sortColumn) => set({ sortColumn }),
  setSortOrder: (sortOrder) => set({ sortOrder }),

  resetPagination: () =>
    set({
      members: [],
      nextAfter: null,
    }),

  resetAll: () => {
    ++latestMembersRequestId;
    set({
      ...initialState,
    });
  },

  fetchMembers: async (opts) => {
    const requestId = ++latestMembersRequestId;
    set({ loading: true, error: null });
    try {
      const params = new URLSearchParams();
      if (opts.search) params.set('search', opts.search);
      params.set('sort', opts.sortColumn);
      params.set('order', opts.sortOrder);
      if (opts.after) params.set('after', opts.after);
      params.set('limit', '50');

      const res = await fetch(
        `/api/guilds/${encodeURIComponent(opts.guildId)}/members?${params.toString()}`,
        { signal: opts.signal },
      );

      if (requestId !== latestMembersRequestId) return 'ok';

      if (res.status === 401) {
        set({ loading: false });
        return 'unauthorized';
      }
      if (!res.ok) {
        throw new Error(`Failed to fetch members (${res.status})`);
      }
      const data = (await res.json()) as MembersApiResponse;

      if (requestId !== latestMembersRequestId) return 'ok';

      set((state) => ({
        members: opts.append ? [...state.members, ...data.members] : data.members,
        nextAfter: data.nextAfter,
        total: data.total,
        filteredTotal: data.filteredTotal ?? null,
        loading: false,
      }));
      return 'ok';
    } catch (err) {
      if (requestId !== latestMembersRequestId) return 'ok';

      if (err instanceof DOMException && err.name === 'AbortError') {
        set({ loading: false });
        return 'ok';
      }
      set({
        error: err instanceof Error ? err.message : 'Failed to fetch members',
        loading: false,
      });
      return 'error';
    }
  },
}));
