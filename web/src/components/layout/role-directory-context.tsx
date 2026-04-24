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
import type { DiscordRole } from '@/types/discord';

interface RoleDirectoryEntry {
  roles: DiscordRole[];
  error: string | null;
  loading: boolean;
  loaded: boolean;
  attempted: boolean;
}

interface RoleDirectoryContextValue {
  cacheVersion: number;
  entries: Record<string, RoleDirectoryEntry>;
  loadRoles: (guildId: string) => Promise<void>;
  refreshRoles: (guildId: string) => Promise<void>;
}

const RoleDirectoryContext = createContext<RoleDirectoryContextValue | null>(null);

const EMPTY_ENTRY: RoleDirectoryEntry = {
  roles: [],
  error: null,
  loading: false,
  loaded: false,
  attempted: false,
};

function isDiscordRole(role: unknown): role is DiscordRole {
  return (
    typeof role === 'object' &&
    role !== null &&
    typeof (role as Record<string, unknown>).id === 'string' &&
    typeof (role as Record<string, unknown>).name === 'string' &&
    typeof (role as Record<string, unknown>).color === 'number'
  );
}

export function RoleDirectoryProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const [cacheVersion, setCacheVersion] = useState(0);
  const [entries, setEntries] = useState<Record<string, RoleDirectoryEntry>>({});
  const previousPathnameRef = useRef<string | null>(null);
  const pathnameRef = useRef(pathname);
  const entriesRef = useRef(entries);
  const abortControllersRef = useRef(new Map<string, AbortController>());
  const inflightRef = useRef(new Map<string, Promise<void>>());

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const fetchRoles = useCallback(async (guildId: string, forceRefresh = false) => {
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
        roles: current[guildId]?.roles ?? [],
        error: null,
        loading: true,
        loaded: false,
        attempted: true,
      },
    }));

    let request: Promise<void> | undefined;
    request = (async () => {
      try {
        const response = await fetch(`/api/guilds/${encodeURIComponent(guildId)}/roles`, {
          signal: controller.signal,
          cache: 'no-store',
        });

        if (response.status === 401) {
          if (abortControllersRef.current.get(guildId) !== controller) {
            return;
          }

          setEntries((current) => ({
            ...current,
            [guildId]: {
              roles: current[guildId]?.roles ?? [],
              error: 'Unauthorized',
              loading: false,
              loaded: false,
              attempted: true,
            },
          }));
          globalThis.location.href = `/login?callbackUrl=${encodeURIComponent(pathnameRef.current)}`;
          return;
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch roles: ${response.statusText}`);
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
            roles: data.filter(isDiscordRole),
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
            roles: current[guildId]?.roles ?? [],
            error: error instanceof Error ? error.message : 'Failed to load roles',
            loading: false,
            loaded: false,
            attempted: true,
          },
        }));
      } finally {
        if (abortControllersRef.current.get(guildId) === controller) {
          abortControllersRef.current.delete(guildId);
        }
        if (request && inflightRef.current.get(guildId) === request) {
          inflightRef.current.delete(guildId);
        }
      }
    })();

    inflightRef.current.set(guildId, request);
    return request;
  }, []);

  const loadRoles = useCallback(async (guildId: string) => fetchRoles(guildId), [fetchRoles]);

  const refreshRoles = useCallback(
    async (guildId: string) => fetchRoles(guildId, true),
    [fetchRoles],
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
      loadRoles,
      refreshRoles,
    }),
    [cacheVersion, entries, loadRoles, refreshRoles],
  );

  return <RoleDirectoryContext.Provider value={value}>{children}</RoleDirectoryContext.Provider>;
}

export function useGuildRoles(guildId: string | null) {
  const context = useContext(RoleDirectoryContext);
  if (!context) {
    throw new Error('useGuildRoles must be used within RoleDirectoryProvider');
  }

  const { entries, loadRoles, refreshRoles } = context;
  const entry = guildId ? (entries[guildId] ?? EMPTY_ENTRY) : EMPTY_ENTRY;
  useEffect(() => {
    if (!guildId || entry.attempted || entry.loading) {
      return;
    }

    void loadRoles(guildId);
  }, [entry.attempted, entry.loading, guildId, loadRoles]);

  const ensureGuildRoles = useCallback(async () => {
    if (!guildId) return;
    await loadRoles(guildId);
  }, [guildId, loadRoles]);

  const refreshGuildRoles = useCallback(async () => {
    if (!guildId) return;
    await refreshRoles(guildId);
  }, [guildId, refreshRoles]);

  return {
    roles: entry.roles,
    error: entry.error,
    loading: entry.loading,
    ensureRolesLoaded: ensureGuildRoles,
    refreshRoles: refreshGuildRoles,
  };
}
