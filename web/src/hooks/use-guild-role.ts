'use client';

import { useEffect, useState } from 'react';
import type { DashboardRole } from '@/lib/dashboard-roles';

interface GuildRoleResponse {
  role: DashboardRole;
}

/**
 * Fetches the current user's dashboard role for the given guild.
 * Returns null while loading or when guildId is missing; the role otherwise.
 */
export function useGuildRole(guildId: string | null): {
  role: DashboardRole | null;
  loading: boolean;
  error: boolean;
} {
  const [role, setRole] = useState<DashboardRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!guildId) {
      setRole(null);
      setLoading(false);
      setError(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    fetch(`/api/guilds/${encodeURIComponent(guildId)}/role`)
      .then((res) => {
        if (cancelled) return null;
        if (!res.ok) throw new Error(res.statusText);
        return res.json() as Promise<GuildRoleResponse>;
      })
      .then((data) => {
        if (cancelled || !data?.role) return;
        setRole(data.role);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [guildId]);

  return { role, loading, error };
}
