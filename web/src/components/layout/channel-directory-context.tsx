'use client';

import { usePathname } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { DiscordChannel } from '@/types/discord';

interface ChannelDirectoryEntry {
  channels: DiscordChannel[];
  error: string | null;
  loading: boolean;
  loaded: boolean;
  attempted: boolean;
}

interface ChannelDirectoryContextValue {
  cacheVersion: number;
  entries: Record<string, ChannelDirectoryEntry>;
  loadChannels: (guildId: string) => Promise<void>;
  refreshChannels: (guildId: string) => Promise<void>;
}

const ChannelDirectoryContext = createContext<ChannelDirectoryContextValue | null>(null);

const EMPTY_ENTRY: ChannelDirectoryEntry = {
  channels: [],
  error: null,
  loading: false,
  loaded: false,
  attempted: false,
};

function isDiscordChannel(channel: unknown): channel is DiscordChannel {
  return (
    typeof channel === 'object' &&
    channel !== null &&
    typeof (channel as Record<string, unknown>).id === 'string' &&
    typeof (channel as Record<string, unknown>).name === 'string' &&
    typeof (channel as Record<string, unknown>).type === 'number'
  );
}

function sortChannels(channels: DiscordChannel[]): DiscordChannel[] {
  return [...channels].sort((a, b) => {
    if (a.type === 4 && b.type !== 4) return 1;
    if (b.type === 4 && a.type !== 4) return -1;
    return a.name.localeCompare(b.name);
  });
}

export function ChannelDirectoryProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const [cacheVersion, setCacheVersion] = useState(0);
  const [entries, setEntries] = useState<Record<string, ChannelDirectoryEntry>>({});
  const previousPathnameRef = useRef<string | null>(null);
  const entriesRef = useRef(entries);
  const abortControllersRef = useRef(new Map<string, AbortController>());
  const inflightRef = useRef(new Map<string, Promise<void>>());

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const fetchChannels = useCallback(async (guildId: string, forceRefresh = false) => {
    if (!guildId) return;

    const existingEntry = entriesRef.current[guildId];
    if (!forceRefresh && (existingEntry?.loaded || existingEntry?.loading)) {
      return inflightRef.current.get(guildId);
    }
    if (!forceRefresh) {
      const inflightRequest = inflightRef.current.get(guildId);
      if (inflightRequest) {
        return inflightRequest;
      }
    }

    abortControllersRef.current.get(guildId)?.abort();
    const controller = new AbortController();
    abortControllersRef.current.set(guildId, controller);

    setEntries((current) => ({
      ...current,
      [guildId]: {
        channels: current[guildId]?.channels ?? [],
        error: null,
        loading: true,
        loaded: false,
        attempted: true,
      },
    }));

    const request = (async () => {
      try {
        const response = await fetch(`/api/guilds/${encodeURIComponent(guildId)}/channels`, {
          signal: controller.signal,
          cache: 'no-store',
        });

        if (response.status === 401) {
          globalThis.location.href = '/login';
          return;
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch channels: ${response.statusText}`);
        }

        const data: unknown = await response.json();
        if (!Array.isArray(data)) {
          throw new Error('Invalid response: expected array');
        }

        if (abortControllersRef.current.get(guildId) !== controller) {
          return;
        }

        setEntries((current) => ({
          ...current,
          [guildId]: {
            channels: sortChannels(data.filter(isDiscordChannel)),
            error: null,
            loading: false,
            loaded: true,
            attempted: true,
          },
        }));
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        if (abortControllersRef.current.get(guildId) !== controller) {
          return;
        }

        setEntries((current) => ({
          ...current,
          [guildId]: {
            channels: current[guildId]?.channels ?? [],
            error: error instanceof Error ? error.message : 'Failed to load channels',
            loading: false,
            loaded: false,
            attempted: true,
          },
        }));
      } finally {
        if (abortControllersRef.current.get(guildId) === controller) {
          abortControllersRef.current.delete(guildId);
        }
        inflightRef.current.delete(guildId);
      }
    })();

    inflightRef.current.set(guildId, request);
    return request;
  }, []);

  const loadChannels = useCallback(
    async (guildId: string) => fetchChannels(guildId),
    [fetchChannels],
  );

  const refreshChannels = useCallback(
    async (guildId: string) => fetchChannels(guildId, true),
    [fetchChannels],
  );

  useEffect(() => {
    if (previousPathnameRef.current === null) {
      previousPathnameRef.current = pathname;
      return;
    }
    if (previousPathnameRef.current === pathname) {
      return;
    }
    previousPathnameRef.current = pathname;

    for (const controller of abortControllersRef.current.values()) {
      controller.abort();
    }
    abortControllersRef.current.clear();
    inflightRef.current.clear();
    entriesRef.current = {};
    setEntries({});
    setCacheVersion((current) => current + 1);
  }, [pathname]);

  useEffect(() => {
    return () => {
      for (const controller of abortControllersRef.current.values()) {
        controller.abort();
      }
      abortControllersRef.current.clear();
      inflightRef.current.clear();
    };
  }, []);

  const value = useMemo(
    () => ({
      cacheVersion,
      entries,
      loadChannels,
      refreshChannels,
    }),
    [cacheVersion, entries, loadChannels, refreshChannels],
  );

  return (
    <ChannelDirectoryContext.Provider value={value}>{children}</ChannelDirectoryContext.Provider>
  );
}

export function useGuildChannels(guildId: string | null) {
  const context = useContext(ChannelDirectoryContext);
  if (!context) {
    throw new Error('useGuildChannels must be used within ChannelDirectoryProvider');
  }

  const { cacheVersion, entries, loadChannels, refreshChannels } = context;
  const entry = guildId ? (entries[guildId] ?? EMPTY_ENTRY) : EMPTY_ENTRY;
  const fetchCycleKey = `${guildId ?? ''}:${cacheVersion}`;

  useEffect(() => {
    if (!fetchCycleKey || !guildId || entry.attempted || entry.loading) {
      return;
    }

    void loadChannels(guildId);
  }, [entry.attempted, entry.loading, fetchCycleKey, guildId, loadChannels]);

  const refreshGuildChannels = useCallback(async () => {
    if (!guildId) return;
    await refreshChannels(guildId);
  }, [guildId, refreshChannels]);

  return {
    channels: entry.channels,
    error: entry.error,
    loading: entry.loading,
    refreshChannels: refreshGuildChannels,
  };
}
