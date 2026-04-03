'use client';

import { ChevronDown, ChevronRight, ClipboardList, Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { EmptyState } from '@/components/dashboard/empty-state';
import { Badge } from '@/components/ui/badge';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useGuildSelection } from '@/hooks/use-guild-selection';
import { useAuditLogStore } from '@/stores/audit-log-store';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function actionVariant(action: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (action.includes('delete')) return 'destructive';
  if (action.includes('create')) return 'default';
  if (action.includes('update')) return 'secondary';
  return 'outline';
}

const PAGE_SIZE = 25;

function AuditLogSkeleton() {
  return (
    <div className="overflow-x-auto rounded-[24px] border border-border/40 bg-card/40 backdrop-blur-2xl shadow-lg">
      <Table>
        <TableHeader>
          <TableRow className="border-border/20">
            <TableHead className="w-10 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50" />
            <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
              Action
            </TableHead>
            <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
              User
            </TableHead>
            <TableHead className="hidden md:table-cell text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
              Target
            </TableHead>
            <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
              Date
            </TableHead>
            <TableHead className="hidden lg:table-cell text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
              IP
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 8 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
            <TableRow key={`skeleton-${i}`} className="border-border/10">
              <TableCell className="w-10 px-2">
                <Skeleton className="h-4 w-4" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-28" />
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <Skeleton className="h-4 w-32" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-20" />
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                <Skeleton className="h-4 w-24" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

const ACTION_OPTIONS = [
  'config.update',
  'members.update',
  'moderation.create',
  'moderation.delete',
  'tickets.update',
];

export default function AuditLogPage() {
  const router = useRouter();
  const { entries, total, loading, error, filters, setFilters, fetch } = useAuditLogStore();
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const [userSearch, setUserSearch] = useState(filters.userId);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [debouncedUserSearch, setDebouncedUserSearch] = useState(filters.userId);

  const onGuildChange = useCallback(() => {
    useAuditLogStore.getState().reset();
    setExpandedRows(new Set());
  }, []);
  const guildId = useGuildSelection({ onGuildChange });

  useEffect(() => {
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedUserSearch(userSearch);
      setFilters({ userId: userSearch, offset: 0 });
    }, 300);
    return () => clearTimeout(searchTimerRef.current);
  }, [userSearch, setFilters]);

  useEffect(() => {
    if (!guildId) return;
    void fetch(guildId, { ...filters, userId: debouncedUserSearch }).then((res) => {
      if (res === 'unauthorized') router.replace('/login');
    });
    return () => {
      useAuditLogStore.getState().abortInFlight();
    };
  }, [
    guildId,
    filters.action,
    debouncedUserSearch,
    filters.startDate,
    filters.endDate,
    filters.offset,
    fetch,
    router,
    filters,
  ]);

  const toggleRow = useCallback((id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const currentPage = Math.floor(filters.offset / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <ErrorBoundary title="Audit log failed to load">
      <div className="space-y-6">
        {/* Stats */}
        {guildId && (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="group relative overflow-hidden rounded-[24px] border border-border/40 bg-card/40 p-6 backdrop-blur-2xl shadow-lg bg-gradient-to-br from-primary/12 to-transparent">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Total Entries
              </p>
              <p className="mt-3 text-3xl font-bold tabular-nums md:text-4xl">
                {total.toLocaleString()}
              </p>
            </div>
            <div className="group relative overflow-hidden rounded-[24px] border border-border/40 bg-card/40 p-6 backdrop-blur-2xl shadow-lg bg-gradient-to-br from-secondary/10 to-transparent">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Active Filters
              </p>
              <p className="mt-3 text-3xl font-bold tabular-nums md:text-4xl">
                {
                  [filters.action, debouncedUserSearch, filters.startDate, filters.endDate].filter(
                    Boolean,
                  ).length
                }
              </p>
            </div>
            <div className="group relative overflow-hidden rounded-[24px] border border-border/40 bg-card/40 p-6 backdrop-blur-2xl shadow-lg">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Expanded Rows
              </p>
              <p className="mt-3 text-3xl font-bold tabular-nums md:text-4xl">
                {expandedRows.size}
              </p>
            </div>
          </div>
        )}

        {/* No guild */}
        {!guildId && (
          <EmptyState
            icon={ClipboardList}
            title="Select a server"
            description="Choose a server from the sidebar to view the audit log."
          />
        )}

        {/* Content */}
        {guildId && (
          <>
            {/* Compact filter strip */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
                <Input
                  className="h-9 rounded-xl border-border/40 bg-card/40 pl-8 pr-8 text-sm backdrop-blur-sm"
                  placeholder="Filter by user ID..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  aria-label="Filter audit log by user ID"
                />
                {userSearch && (
                  <button
                    type="button"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground"
                    onClick={() => {
                      setUserSearch('');
                      setDebouncedUserSearch('');
                      setFilters({ userId: '', offset: 0 });
                    }}
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <Select
                value={filters.action}
                onValueChange={(val) => setFilters({ action: val === 'all' ? '' : val, offset: 0 })}
              >
                <SelectTrigger className="h-9 w-[180px] rounded-xl border-border/40 bg-card/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70 backdrop-blur-sm">
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-white/10 bg-popover/95 backdrop-blur-xl shadow-xl">
                  <SelectItem value="all" className="text-xs font-semibold">
                    All actions
                  </SelectItem>
                  {ACTION_OPTIONS.map((a) => (
                    <SelectItem key={a} value={a} className="text-xs font-semibold">
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                type="date"
                className="h-9 w-[155px] rounded-xl border-border/40 bg-card/40 text-sm backdrop-blur-sm"
                value={filters.startDate}
                onChange={(e) => setFilters({ startDate: e.target.value, offset: 0 })}
                aria-label="Start date filter"
              />
              <Input
                type="date"
                className="h-9 w-[155px] rounded-xl border-border/40 bg-card/40 text-sm backdrop-blur-sm"
                value={filters.endDate}
                onChange={(e) => setFilters({ endDate: e.target.value, offset: 0 })}
                aria-label="End date filter"
              />

              {total > 0 && (
                <span className="text-[11px] font-medium text-muted-foreground/50 tabular-nums">
                  {total.toLocaleString()} {total === 1 ? 'entry' : 'entries'}
                </span>
              )}
            </div>

            {/* Error */}
            {error && (
              <div
                role="alert"
                className="rounded-[20px] border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive backdrop-blur-xl"
              >
                <strong>Error:</strong> {error}
              </div>
            )}

            {/* Table */}
            {loading && entries.length === 0 ? (
              <AuditLogSkeleton />
            ) : entries.length > 0 ? (
              <div className="overflow-x-auto rounded-[24px] border border-border/40 bg-card/40 backdrop-blur-2xl shadow-lg">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/20 hover:bg-transparent">
                      <TableHead className="w-10 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50" />
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                        Action
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                        User
                      </TableHead>
                      <TableHead className="hidden md:table-cell text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                        Target
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                        Date
                      </TableHead>
                      <TableHead className="hidden lg:table-cell text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                        IP
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry) => {
                      const isExpanded = expandedRows.has(entry.id);
                      return (
                        <Fragment key={entry.id}>
                          <TableRow
                            className="cursor-pointer border-border/10 hover:bg-white/[0.02]"
                            tabIndex={0}
                            onClick={() => toggleRow(entry.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                toggleRow(entry.id);
                              }
                            }}
                          >
                            <TableCell className="w-10 px-2">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground/40" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={actionVariant(entry.action)}>{entry.action}</Badge>
                            </TableCell>
                            <TableCell className="font-mono text-sm text-foreground/80">
                              {entry.user_id}
                            </TableCell>
                            <TableCell className="hidden text-sm text-muted-foreground/60 md:table-cell">
                              {entry.target_type && entry.target_id
                                ? `${entry.target_type}:${entry.target_id}`
                                : '—'}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground/60">
                              {formatDate(entry.created_at)}
                            </TableCell>
                            <TableCell className="hidden text-sm text-muted-foreground/60 lg:table-cell">
                              {entry.ip_address || '—'}
                            </TableCell>
                          </TableRow>
                          {isExpanded && entry.details && (
                            <TableRow key={`${entry.id}-details`} className="border-border/10">
                              <TableCell colSpan={6} className="bg-background/20 p-4">
                                <pre className="max-h-64 overflow-auto rounded-[14px] border border-border/30 bg-background/50 p-3 text-xs text-foreground/70">
                                  {JSON.stringify(entry.details, null, 2)}
                                </pre>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState
                icon={ClipboardList}
                title={
                  filters.action || debouncedUserSearch || filters.startDate || filters.endDate
                    ? 'No matching entries'
                    : 'No audit entries'
                }
                description={
                  filters.action || debouncedUserSearch || filters.startDate || filters.endDate
                    ? 'Try adjusting your filters.'
                    : 'Actions will appear here as your team uses the dashboard.'
                }
              />
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50">
                  Page {currentPage} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={filters.offset <= 0 || loading}
                    onClick={() => setFilters({ offset: Math.max(0, filters.offset - PAGE_SIZE) })}
                    className="inline-flex items-center gap-1.5 rounded-2xl border border-white/10 bg-card/40 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70 backdrop-blur-sm shadow-sm transition-all hover:bg-card/60 hover:text-foreground active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={filters.offset + PAGE_SIZE >= total || loading}
                    onClick={() => setFilters({ offset: filters.offset + PAGE_SIZE })}
                    className="inline-flex items-center gap-1.5 rounded-2xl border border-white/10 bg-card/40 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70 backdrop-blur-sm shadow-sm transition-all hover:bg-card/60 hover:text-foreground active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}
