import { create } from 'zustand';

interface ModerationState {
  // Cases filters & pagination
  page: number;
  sortDesc: boolean;
  actionFilter: string;
  userSearch: string;

  // User history lookup
  userHistoryInput: string;
  lookupUserId: string | null;
  userHistoryPage: number;

  // Actions
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
}

export const useModerationStore = create<ModerationState>((set) => ({
  // Initial state
  page: 1,
  sortDesc: true,
  actionFilter: 'all',
  userSearch: '',
  userHistoryInput: '',
  lookupUserId: null,
  userHistoryPage: 1,

  // Actions
  setPage: (page) => set({ page }),
  setSortDesc: (sortDesc) => set({ sortDesc }),
  toggleSortDesc: () => set((state) => ({ sortDesc: !state.sortDesc })),
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
    }),

  resetOnGuildChange: () =>
    set({
      page: 1,
      lookupUserId: null,
      userHistoryInput: '',
      userHistoryPage: 1,
      actionFilter: 'all',
      userSearch: '',
      sortDesc: true,
    }),
}));
