import { create } from 'zustand';

interface TempRole {
  id: number;
  guild_id: string;
  user_id: string;
  user_tag: string;
  role_id: string;
  role_name: string;
  moderator_id: string;
  moderator_tag: string;
  reason: string | null;
  duration: string;
  expires_at: string;
  created_at: string;
}

interface TempRolesResponse {
  data: TempRole[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

interface TempRolesState {
  data: TempRolesResponse | null;
  loading: boolean;
  error: string | null;
  page: number;

  setPage: (page: number) => void;
  fetch: (guildId: string, page: number) => Promise<'unauthorized' | undefined>;
  refresh: (guildId: string) => Promise<'unauthorized' | undefined>;
  reset: () => void;
}

export const useTempRolesStore = create<TempRolesState>((set, get) => ({
  data: null,
  loading: false,
  error: null,
  page: 1,

  setPage: (page) => set({ page }),

  fetch: async (guildId, page) => {
    set({ loading: true, error: null });
    try {
      const params = new URLSearchParams({ guildId, page: String(page), limit: '25' });
      const res = await fetch(`/api/temp-roles?${params.toString()}`, { cache: 'no-store' });
      if (res.status === 401) return 'unauthorized';
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        set({ error: body.error || 'Failed to load temp roles' });
        return;
      }
      const json: TempRolesResponse = await res.json();
      set({ data: json });
    } catch {
      set({ error: 'Failed to load temp roles' });
    } finally {
      set({ loading: false });
    }
  },

  refresh: async (guildId) => {
    const { page, fetch } = get();
    return fetch(guildId, page);
  },

  reset: () => set({ data: null, page: 1, error: null }),
}));
