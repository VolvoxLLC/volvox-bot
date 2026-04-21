'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { MutualGuild } from '@/types/discord';

interface GuildDirectoryContextValue {
  error: boolean;
  guilds: MutualGuild[];
  loading: boolean;
  refreshGuilds: () => Promise<void>;
}

const GuildDirectoryContext = createContext<GuildDirectoryContextValue | null>(null);

function isMutualGuild(value: unknown): value is MutualGuild {
  const g = value as Record<string, unknown>;
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof g.id === 'string' &&
    typeof g.name === 'string' &&
    (typeof g.icon === 'string' || g.icon === null) &&
    typeof g.owner === 'boolean' &&
    typeof g.permissions === 'string' &&
    Array.isArray(g.features) &&
    (g.botPresent === undefined || typeof g.botPresent === 'boolean')
  );
}

export function GuildDirectoryProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [guilds, setGuilds] = useState<MutualGuild[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const refreshGuilds = useCallback(async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(false);

    try {
      const response = await fetch('/api/guilds', { signal: controller.signal });
      if (response.status === 401) {
        globalThis.location.href = '/login';
        return;
      }
      if (!response.ok) {
        throw new Error('Failed to fetch guilds');
      }

      const data: unknown = await response.json();
      if (!Array.isArray(data)) {
        throw new TypeError('Invalid guild response');
      }

      setGuilds(data.filter(isMutualGuild));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      setError(true);
    } finally {
      if (abortControllerRef.current === controller) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    refreshGuilds();
    return () => abortControllerRef.current?.abort();
  }, [refreshGuilds]);

  const value = useMemo(
    () => ({
      error,
      guilds,
      loading,
      refreshGuilds,
    }),
    [error, guilds, loading, refreshGuilds],
  );

  return <GuildDirectoryContext.Provider value={value}>{children}</GuildDirectoryContext.Provider>;
}

export function useGuildDirectory() {
  const context = useContext(GuildDirectoryContext);
  if (!context) {
    throw new Error('useGuildDirectory must be used within GuildDirectoryProvider');
  }
  return context;
}
