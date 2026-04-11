import { create } from 'zustand';
import type { BotHealth } from '@/components/dashboard/types';
import { validateBotHealth } from '@/components/dashboard/types';

interface HealthState {
  health: BotHealth | null;
  loading: boolean;
  error: string | null;
  lastUpdatedAt: Date | null;

  setHealth: (health: BotHealth) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  refresh: (guildId: string) => Promise<'success' | 'unauthorized' | 'error'>;
}

export const useHealthStore = create<HealthState>((set, _get) => ({
  health: null,
  loading: false,
  error: null,
  lastUpdatedAt: null,

  setHealth: (health) => set({ health, lastUpdatedAt: new Date() }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  refresh: async (guildId) => {
    set({ loading: true, error: null });
    try {
      const params = new URLSearchParams({ guildId });
      const response = await fetch(`/api/bot-health?${params.toString()}`, {
        cache: 'no-store',
      });

      if (response.status === 401) {
        set({ loading: false });
        return 'unauthorized';
      }

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const message = payload?.error || 'Failed to fetch health data';
        throw new Error(message);
      }

      const validationError = validateBotHealth(payload);
      if (validationError) {
        throw new Error(`Invalid health payload: ${validationError}`);
      }

      set({
        health: payload as BotHealth,
        loading: false,
        error: null,
        lastUpdatedAt: new Date(),
      });
      return 'success';
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch health data';
      set({ error: message, loading: false });
      return 'error';
    }
  },
}));
