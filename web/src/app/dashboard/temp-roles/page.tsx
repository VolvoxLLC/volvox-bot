'use client';

/**
 * Temp Roles Dashboard Page
 * View and manage active temporary role assignments.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/128
 */

import { Clock, RefreshCw, Shield, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useGuildSelection } from '@/hooks/use-guild-selection';

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

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = Date.now();
  const diff = date.getTime() - now;

  if (diff <= 0) return 'Expired';

  const s = Math.floor(diff / 1000);
  if (s < 60) return `in ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `in ${h}h`;
  const d = Math.floor(h / 24);
  return `in ${d}d`;
}

export default function TempRolesPage() {
  const router = useRouter();
  const [data, setData] = useState<TempRolesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [revoking, setRevoking] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const onGuildChange = useCallback(() => setPage(1), []);
  const guildId = useGuildSelection({ onGuildChange });

  const onUnauthorized = useCallback(() => router.replace('/login'), [router]);

  const fetchTempRoles = useCallback(
    async (id: string, currentPage: number) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          guildId: id,
          page: String(currentPage),
          limit: '25',
        });

        const res = await fetch(`/api/temp-roles?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (res.status === 401) {
          onUnauthorized();
          return;
        }

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error || 'Failed to load temp roles');
          return;
        }

        const json: TempRolesResponse = await res.json();
        setData(json);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError('Failed to load temp roles');
        }
      } finally {
        setLoading(false);
      }
    },
    [onUnauthorized],
  );

  useEffect(() => {
    if (!guildId) return;
    void fetchTempRoles(guildId, page);
  }, [guildId, page, fetchTempRoles]);

  const handleRevoke = useCallback(
    async (record: TempRole) => {
      if (!guildId) return;
      if (!confirm(`Revoke ${record.role_name} from ${record.user_tag}?`)) return;

      setRevoking(record.id);
      try {
        const res = await fetch(
          `/api/temp-roles/${record.id}?guildId=${encodeURIComponent(guildId)}`,
          {
            method: 'DELETE',
          },
        );

        if (res.status === 401) {
          onUnauthorized();
          return;
        }

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          alert(body.error || 'Failed to revoke temp role');
          return;
        }

        // Refresh list
        void fetchTempRoles(guildId, page);
      } catch {
        alert('Failed to revoke temp role');
      } finally {
        setRevoking(null);
      }
    },
    [guildId, page, fetchTempRoles, onUnauthorized],
  );

  const handleRefresh = useCallback(() => {
    if (guildId) void fetchTempRoles(guildId, page);
  }, [guildId, page, fetchTempRoles]);

  const rows = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Clock className="h-6 w-6" />
            Temporary Roles
          </h2>
          <p className="text-muted-foreground text-sm">
            Active role assignments that expire automatically.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading || !guildId}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* No guild selected */}
      {!guildId && (
        <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
          Select a server from the top bar to view temp roles.
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Table */}
      {guildId && !error && (
        <div className="rounded-lg border">
          {loading && rows.length === 0 ? (
            <div className="text-muted-foreground p-8 text-center text-sm">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-muted-foreground p-8 text-center text-sm">
              No active temporary roles.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">User</th>
                  <th className="px-4 py-3 text-left font-medium">Role</th>
                  <th className="px-4 py-3 text-left font-medium">Duration</th>
                  <th className="px-4 py-3 text-left font-medium">Expires</th>
                  <th className="px-4 py-3 text-left font-medium">Moderator</th>
                  <th className="px-4 py-3 text-left font-medium">Reason</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/25 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-medium">{row.user_tag}</span>
                      <span className="text-muted-foreground ml-1 text-xs">({row.user_id})</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium">
                        <Shield className="h-3 w-3" />
                        {row.role_name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{row.duration}</td>
                    <td className="px-4 py-3">
                      <span
                        className="text-amber-600 dark:text-amber-400"
                        title={new Date(row.expires_at).toLocaleString()}
                      >
                        {formatRelativeTime(row.expires_at)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{row.moderator_tag}</td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate text-xs">
                      {row.reason ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950"
                        onClick={() => handleRevoke(row)}
                        disabled={revoking === row.id}
                        title="Revoke this temp role"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Revoke</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            Page {pagination.page} of {pagination.pages} — {pagination.total} total
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pagination.pages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
