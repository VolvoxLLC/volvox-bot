'use client';

import { Clock, Shield, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { Skeleton } from '@/components/ui/skeleton';
import { useGuildSelection } from '@/hooks/use-guild-selection';
import { useTempRolesStore } from '@/stores/temp-roles-store';

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

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `in ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `in ${h}h`;
  return `in ${Math.floor(h / 24)}d`;
}

export default function TempRolesPage() {
  const router = useRouter();
  const { data, loading, error, page, setPage, fetch } = useTempRolesStore();
  const [revoking, setRevoking] = useState<number | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<TempRole | null>(null);

  const onGuildChange = useCallback(() => {
    setPage(1);
    useTempRolesStore.getState().reset();
  }, [setPage]);

  const guildId = useGuildSelection({ onGuildChange });

  useEffect(() => {
    if (!guildId) return;
    void fetch(guildId, page).then((res) => {
      if (res === 'unauthorized') router.replace('/login');
    });
  }, [guildId, page, fetch, router]);

  const handleRevoke = useCallback(
    async (record: TempRole) => {
      if (!guildId) return;
      setRevoking(record.id);
      try {
        const res = await window.fetch(
          `/api/temp-roles/${record.id}?guildId=${encodeURIComponent(guildId)}`,
          { method: 'DELETE' },
        );
        if (res.status === 401) {
          router.replace('/login');
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          toast.error('Failed to revoke temp role', {
            description: body.error || 'An unexpected error occurred.',
          });
          return;
        }
        toast.success('Temp role revoked', {
          description: `Removed ${record.role_name} from ${record.user_tag}.`,
        });
        void fetch(guildId, page).then((r) => {
          if (r === 'unauthorized') router.replace('/login');
        });
      } catch {
        toast.error('Failed to revoke temp role', {
          description: 'A network error occurred. Please try again.',
        });
      } finally {
        setRevoking(null);
        setConfirmRevoke(null);
      }
    },
    [guildId, page, router],
  );


  const rows = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <ErrorBoundary title="Temp roles failed to load">
      <div className="space-y-6">
        {/* No guild */}
        {!guildId && (
          <div className="flex h-48 items-center justify-center rounded-[24px] border border-border/40 bg-card/30 backdrop-blur-xl">
            <p className="text-sm text-muted-foreground/60">
              Select a server from the top bar to view temp roles.
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="rounded-[20px] border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive backdrop-blur-xl"
          >
            {error}
          </div>
        )}

        {/* Stats */}
        {guildId && !error && (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="group relative overflow-hidden rounded-[24px] border border-border/40 bg-card/40 p-6 backdrop-blur-2xl shadow-lg bg-gradient-to-br from-primary/12 to-transparent">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Active Roles
              </p>
              <p className="mt-3 text-3xl font-bold tabular-nums md:text-4xl">
                {pagination?.total ?? 0}
              </p>
            </div>
            <div className="group relative overflow-hidden rounded-[24px] border border-border/40 bg-card/40 p-6 backdrop-blur-2xl shadow-lg bg-gradient-to-br from-amber-500/8 to-transparent">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                This Page
              </p>
              <p className="mt-3 text-3xl font-bold tabular-nums md:text-4xl">{rows.length}</p>
            </div>
            <div className="group relative overflow-hidden rounded-[24px] border border-border/40 bg-card/40 p-6 backdrop-blur-2xl shadow-lg">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Page
              </p>
              <p className="mt-3 text-lg font-bold md:text-xl">
                {page} of {pagination?.pages ?? 1}
              </p>
            </div>
          </div>
        )}

        {/* Table */}
        {guildId && !error && (
          <div className="overflow-x-auto rounded-[24px] border border-border/40 bg-card/40 backdrop-blur-2xl shadow-lg">
            {loading && rows.length === 0 ? (
              <div className="divide-y divide-border/10">
                {Array.from({ length: 5 }).map((_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
                  <div key={`sk-${i}`} className="flex items-center gap-4 px-6 py-4">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="flex h-40 items-center justify-center">
                <p className="text-sm text-muted-foreground/50 italic">
                  No active temporary roles.
                </p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/20">
                    <th className="px-6 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                      Role
                    </th>
                    <th className="hidden sm:table-cell px-6 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                      Duration
                    </th>
                    <th className="px-6 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                      Expires
                    </th>
                    <th className="hidden md:table-cell px-6 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                      Moderator
                    </th>
                    <th className="hidden lg:table-cell px-6 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                      Reason
                    </th>
                    <th className="px-6 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/10">
                  {rows.map((row) => (
                    <tr key={row.id} className="transition-colors hover:bg-white/[0.02]">
                      <td className="px-6 py-3">
                        <span className="font-medium text-foreground/80">{row.user_tag}</span>
                        <span className="ml-1.5 font-mono text-xs text-muted-foreground/40">
                          ({row.user_id})
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                          <Shield className="h-3 w-3" />
                          {row.role_name}
                        </span>
                      </td>
                      <td className="hidden sm:table-cell px-6 py-3 text-sm text-muted-foreground/60">
                        {row.duration}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className="text-sm font-medium text-amber-500"
                          title={new Date(row.expires_at).toLocaleString()}
                        >
                          {formatRelativeTime(row.expires_at)}
                        </span>
                      </td>
                      <td className="hidden md:table-cell px-6 py-3 text-xs text-muted-foreground/50">
                        {row.moderator_tag}
                      </td>
                      <td className="hidden lg:table-cell px-6 py-3 max-w-[200px] truncate text-xs text-muted-foreground/50">
                        {row.reason ?? '—'}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 rounded-xl p-0 text-destructive/60 hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setConfirmRevoke(row)}
                          disabled={revoking === row.id}
                          title="Revoke this temp role"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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
            <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50">
              Page {pagination.page} of {pagination.pages} — {pagination.total} total
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage(page - 1)}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-white/10 bg-card/40 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70 backdrop-blur-sm shadow-sm transition-all hover:bg-card/60 hover:text-foreground active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= pagination.pages || loading}
                onClick={() => setPage(page + 1)}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-white/10 bg-card/40 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70 backdrop-blur-sm shadow-sm transition-all hover:bg-card/60 hover:text-foreground active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Revoke confirmation */}
        <Dialog open={!!confirmRevoke} onOpenChange={(open) => !open && setConfirmRevoke(null)}>
          <DialogContent className="rounded-[24px] border-border/40 bg-card/95 backdrop-blur-2xl shadow-2xl">
            <DialogHeader>
              <DialogTitle>Revoke Temporary Role</DialogTitle>
              <DialogDescription>
                Remove <span className="font-semibold">{confirmRevoke?.role_name}</span> from{' '}
                <span className="font-semibold">{confirmRevoke?.user_tag}</span>? This cannot be
                undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => setConfirmRevoke(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="rounded-xl"
                disabled={revoking !== null}
                onClick={() => confirmRevoke && handleRevoke(confirmRevoke)}
              >
                {revoking ? 'Revoking…' : 'Revoke'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ErrorBoundary>
  );
}
