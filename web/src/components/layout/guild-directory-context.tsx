'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { MutualGuild } from '@/types/discord';

interface GuildDirectoryContextValue {
  error: boolean;
  guilds: MutualGuild[];
  loading: boolean;
  refreshGuilds: () => Promise<void>;
}

const GuildDirectoryContext = createContext<GuildDirectoryContextValue | null>(null);

function isMutualGuild(value: unknown): value is MutualGuild {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'string' &&
    typeof (value as { name?: unknown }).name === 'string' &&
    typeof (value as { permissions?: unknown }).permissions === 'string' &&
    typeof (value as { owner?: unknown }).owner === 'boolean' &&
    typeof (value as { botPresent?: unknown }).botPresent === 'boolean'
  );
}

export function GuildDirectoryProvider({ children }: { children: React.ReactNode }) {
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
        window.location.href = '/login';
        return;
      }
      if (!response.ok) {
        throw new Error('Failed to fetch guilds');
      }

      const data: unknown = await response.json();
      if (!Array.isArray(data)) {
        throw new Error('Invalid guild response');
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
