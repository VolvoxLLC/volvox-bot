import { create } from 'zustand';
import type { MemberRow, SortColumn, SortOrder } from '@/components/dashboard/member-table';

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

  // Actions
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

  resetAll: () =>
    set({
      ...initialState,
    }),
}));
