'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { broadcastSelectedGuild, SELECTED_GUILD_KEY } from '@/lib/guild-selection';
import type { MutualGuild } from '@/types/discord';

interface DashboardGuildContextValue {
  guilds: MutualGuild[];
  selectedGuild: MutualGuild | null;
  selectGuild: (guild: MutualGuild) => void;
  loadGuilds: () => Promise<void>;
  loading: boolean;
  error: boolean;
}

export const DashboardGuildContext = createContext<DashboardGuildContextValue | null>(null);

export function useDashboardGuild() {
  const ctx = useContext(DashboardGuildContext);
  if (!ctx) {
    throw new Error('useDashboardGuild must be used within DashboardGuildProvider');
  }
  return ctx;
}

export function DashboardGuildProvider({ children }: { children: ReactNode }) {
  const [guilds, setGuilds] = useState<MutualGuild[]>([]);
  const [selectedGuild, setSelectedGuildState] = useState<MutualGuild | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const selectGuild = useCallback((guild: MutualGuild) => {
    setSelectedGuildState(guild);
    try {
      localStorage.setItem(SELECTED_GUILD_KEY, guild.id);
    } catch {
      /* localStorage unavailable */
    }
    broadcastSelectedGuild(guild.id);
  }, []);

  const loadGuilds = useCallback(async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(false);
    try {
      const response = await fetch('/api/guilds', { signal: controller.signal });
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!response.ok) throw new Error('Failed to fetch');
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw new Error('Invalid response: expected array');
      const fetchedGuilds = data.filter(
        (g): g is MutualGuild =>
          typeof g === 'object' &&
          g !== null &&
          typeof (g as Record<string, unknown>).id === 'string' &&
          typeof (g as Record<string, unknown>).name === 'string',
      );
      setGuilds(fetchedGuilds);

      let restored = false;
      try {
        const savedId = localStorage.getItem(SELECTED_GUILD_KEY);
        if (savedId) {
          const saved = fetchedGuilds.find((g) => g.id === savedId);
          if (saved) {
            setSelectedGuildState(saved);
            restored = true;
          }
        }
      } catch {
        /* localStorage unavailable */
      }

      if (!restored && fetchedGuilds.length > 0) {
        setSelectedGuildState(fetchedGuilds[0]);
        try {
          localStorage.setItem(SELECTED_GUILD_KEY, fetchedGuilds[0].id);
        } catch {
          /* ignore */
        }
        broadcastSelectedGuild(fetchedGuilds[0].id);
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setError(true);
      }
    } finally {
      if (abortControllerRef.current === controller) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadGuilds();
    return () => abortControllerRef.current?.abort();
  }, [loadGuilds]);

  const value: DashboardGuildContextValue = {
    guilds,
    selectedGuild,
    selectGuild,
    loadGuilds,
    loading,
    error,
  };

  return (
    <DashboardGuildContext.Provider value={value}>{children}</DashboardGuildContext.Provider>
  );
}
