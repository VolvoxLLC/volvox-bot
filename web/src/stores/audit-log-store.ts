import { create } from 'zustand';
import { isAbortError } from '@/lib/api-utils';

interface AuditEntry {
  id: number;
  guild_id: string;
  user_id: string;
  user_tag?: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_tag?: string | null;
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
  /**
   * Loads audit log rows for the guild and filter snapshot. Cancels any in-flight
   * request and ignores responses that are no longer current (stale filter/guild).
   */
  fetch: (guildId: string, filters: AuditLogFilters) => Promise<'unauthorized' | undefined>;
  refresh: (guildId: string) => Promise<'unauthorized' | undefined>;
  /** Aborts the current request without bumping generation (e.g. route unmount). */
  abortInFlight: () => void;
  reset: () => void;
}

const PAGE_SIZE = 25;

/** Monotonic generation: incremented on each new fetch and on reset so stale handlers bail out. */
let fetchGeneration = 0;
let inFlightAbort: AbortController | null = null;

export const useAuditLogStore = create<AuditLogState>((set, get) => ({
  entries: [],
  total: 0,
  loading: false,
  error: null,
  filters: { action: '', userId: '', startDate: '', endDate: '', offset: 0 },

  setFilters: (partial) => set((s) => ({ filters: { ...s.filters, ...partial } })),

  fetch: async (guildId, filters) => {
    inFlightAbort?.abort();
    const controller = new AbortController();
    inFlightAbort = controller;
    const requestId = ++fetchGeneration;

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
        { signal: controller.signal },
      );

      if (requestId !== fetchGeneration) return;

      if (res.status === 401) {
        return 'unauthorized';
      }
      if (!res.ok) throw new Error(`Failed to fetch audit log (${res.status})`);
      const data = (await res.json()) as { entries: AuditEntry[]; total: number };

      if (requestId !== fetchGeneration) return;

      set({ entries: data.entries, total: data.total });
    } catch (err) {
      if (isAbortError(err)) return;
      if (requestId !== fetchGeneration) return;
      set({ error: err instanceof Error ? err.message : 'Failed to fetch audit log' });
    } finally {
      if (requestId === fetchGeneration) {
        set({ loading: false });
      }
    }
  },

  refresh: async (guildId) => {
    const { filters, fetch } = get();
    return fetch(guildId, filters);
  },

  abortInFlight: () => {
    inFlightAbort?.abort();
  },

  reset: () => {
    inFlightAbort?.abort();
    inFlightAbort = null;
    fetchGeneration += 1;
    set({
      entries: [],
      total: 0,
      error: null,
      filters: { action: '', userId: '', startDate: '', endDate: '', offset: 0 },
    });
  },
}));
