import { create } from 'zustand';

interface AuditEntry {
  id: number;
  guild_id: string;
  user_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

interface AuditLogFilters {
  action: string;
  userId: string;
  startDate: string;
  endDate: string;
  offset: number;
}

interface AuditLogState {
  entries: AuditEntry[];
  total: number;
  loading: boolean;
  error: string | null;
  filters: AuditLogFilters;

  setFilters: (filters: Partial<AuditLogFilters>) => void;
  fetch: (guildId: string, filters: AuditLogFilters) => Promise<'unauthorized' | void>;
  refresh: (guildId: string) => Promise<'unauthorized' | void>;
  reset: () => void;
}

const PAGE_SIZE = 25;

export const useAuditLogStore = create<AuditLogState>((set, get) => ({
  entries: [],
  total: 0,
  loading: false,
  error: null,
  filters: { action: '', userId: '', startDate: '', endDate: '', offset: 0 },

  setFilters: (partial) => set((s) => ({ filters: { ...s.filters, ...partial } })),

  fetch: async (guildId, filters) => {
    set({ loading: true, error: null });
    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(filters.offset));
      if (filters.action) params.set('action', filters.action);
      if (filters.userId) params.set('userId', filters.userId);
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);

      const res = await fetch(
        `/api/guilds/${encodeURIComponent(guildId)}/audit-log?${params.toString()}`,
      );
      if (res.status === 401) return 'unauthorized';
      if (!res.ok) throw new Error(`Failed to fetch audit log (${res.status})`);
      const data = await res.json();
      set({ entries: data.entries, total: data.total });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch audit log' });
    } finally {
      set({ loading: false });
    }
  },

  refresh: async (guildId) => {
    const { filters, fetch } = get();
    return fetch(guildId, filters);
  },

  reset: () =>
    set({
      entries: [],
      total: 0,
      error: null,
      filters: { action: '', userId: '', startDate: '', endDate: '', offset: 0 },
    }),
}));
