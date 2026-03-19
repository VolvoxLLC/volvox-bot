'use client';

import { ChevronDown, ChevronRight, ClipboardList, RefreshCw, Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { EmptyState } from '@/components/dashboard/empty-state';
import { PageHeader } from '@/components/dashboard/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

interface AuditEntry {
  id: number;
  guild_id: string;
  user_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

interface AuditLogResponse {
  entries: AuditEntry[];
  total: number;
  limit: number;
  offset: number;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Map action prefixes to badge colours */
function actionVariant(action: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (action.includes('delete')) return 'destructive';
  if (action.includes('create')) return 'default';
  if (action.includes('update')) return 'secondary';
  return 'outline';
}

const PAGE_SIZE = 25;

/** Common action types for the filter dropdown */
function AuditLogSkeleton() {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead>Action</TableHead>
            <TableHead>User</TableHead>
            <TableHead className="hidden md:table-cell">Target</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="hidden lg:table-cell">IP</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 8 }).map((_, i) => (
            <TableRow key={`skeleton-${i}`}>
              <TableCell className="w-10 px-2">
                <Skeleton className="h-4 w-4" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-28 font-mono" />
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

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [actionFilter, setActionFilter] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [debouncedUserSearch, setDebouncedUserSearch] = useState('');

  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedUserSearch(userSearch);
      setOffset(0);
    }, 300);
    return () => clearTimeout(searchTimerRef.current);
  }, [userSearch]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const onGuildChange = useCallback(() => {
    setEntries([]);
    setTotal(0);
    setOffset(0);
    setError(null);
    setExpandedRows(new Set());
  }, []);

  const guildId = useGuildSelection({ onGuildChange });

  const onUnauthorized = useCallback(() => router.replace('/login'), [router]);

  const fetchAuditLog = useCallback(
    async (opts: {
      guildId: string;
      action: string;
      userId: string;
      startDate: string;
      endDate: string;
      offset: number;
    }) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const requestId = ++requestIdRef.current;

      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set('limit', String(PAGE_SIZE));
        params.set('offset', String(opts.offset));
        if (opts.action) params.set('action', opts.action);
        if (opts.userId) params.set('userId', opts.userId);
        if (opts.startDate) params.set('startDate', opts.startDate);
        if (opts.endDate) params.set('endDate', opts.endDate);

        const res = await fetch(
          `/api/guilds/${encodeURIComponent(opts.guildId)}/audit-log?${params.toString()}`,
          { signal: controller.signal },
        );

        if (requestId !== requestIdRef.current) return;

        if (res.status === 401) {
          onUnauthorized();
          return;
        }
        if (!res.ok) {
          throw new Error(`Failed to fetch audit log (${res.status})`);
        }

        const data = (await res.json()) as AuditLogResponse;
        setEntries(data.entries);
        setTotal(data.total);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (requestId !== requestIdRef.current) return;
        setError(err instanceof Error ? err.message : 'Failed to fetch audit log');
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [onUnauthorized],
  );

  useEffect(() => {
    if (!guildId) return;
    void fetchAuditLog({
      guildId,
      action: actionFilter,
      userId: debouncedUserSearch,
      startDate,
      endDate,
      offset,
    });
  }, [guildId, actionFilter, debouncedUserSearch, startDate, endDate, offset, fetchAuditLog]);

  const handleRefresh = useCallback(() => {
    if (!guildId) return;
    void fetchAuditLog({
      guildId,
      action: actionFilter,
      userId: debouncedUserSearch,
      startDate,
      endDate,
      offset,
    });
  }, [guildId, fetchAuditLog, actionFilter, debouncedUserSearch, startDate, endDate, offset]);

  const toggleRow = useCallback((id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleClearSearch = useCallback(() => {
    setUserSearch('');
    setDebouncedUserSearch('');
    setOffset(0);
  }, []);

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <ErrorBoundary title="Audit log failed to load">
      <div className="space-y-6">
        <PageHeader
          icon={ClipboardList}
          title="Audit Log"
          description="Track all admin actions and configuration changes."
          actions={
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleRefresh}
              disabled={!guildId || loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          }
        />

        {/* No guild selected */}
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
            <div className="grid gap-4 md:grid-cols-3">
              <div className="dashboard-panel rounded-2xl bg-gradient-to-br from-primary/12 to-background p-4 md:p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Total Entries
                </p>
                <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums md:text-4xl">
                  {total.toLocaleString()}
                </p>
              </div>
              <div className="dashboard-panel rounded-2xl bg-gradient-to-br from-secondary/10 to-background p-4 md:p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Active Filters
                </p>
                <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums md:text-4xl">
                  {[actionFilter, debouncedUserSearch, startDate, endDate].filter(Boolean).length}
                </p>
              </div>
              <div className="dashboard-panel rounded-2xl p-4 md:p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Expanded Rows
                </p>
                <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums md:text-4xl">
                  {expandedRows.size}
                </p>
              </div>
            </div>

            {/* Filters */}
            <div className="dashboard-panel flex flex-wrap items-center gap-3 rounded-2xl p-4 md:p-5">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-10 rounded-xl border-border/70 bg-background/70 pl-9 pr-8"
                  placeholder="Filter by user ID..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  aria-label="Filter audit log by user ID"
                />
                {userSearch && (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={handleClearSearch}
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <Select
                value={actionFilter}
                onValueChange={(val) => {
                  setActionFilter(val === 'all' ? '' : val);
                  setOffset(0);
                }}
              >
                <SelectTrigger className="h-10 w-[200px] rounded-xl border-border/70 bg-background/70">
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  {ACTION_OPTIONS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                type="date"
                className="h-10 w-[165px] rounded-xl border-border/70 bg-background/70"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setOffset(0);
                }}
                aria-label="Start date filter"
              />

              <Input
                type="date"
                className="h-10 w-[165px] rounded-xl border-border/70 bg-background/70"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setOffset(0);
                }}
                aria-label="End date filter"
              />

              {total > 0 && (
                <span className="text-sm text-muted-foreground tabular-nums">
                  {total.toLocaleString()} {total === 1 ? 'entry' : 'entries'}
                </span>
              )}
            </div>

            {/* Error */}
            {error && (
              <div
                role="alert"
                className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
              >
                <strong>Error:</strong> {error}
              </div>
            )}

            {/* Table */}
            {loading && entries.length === 0 ? (
              <AuditLogSkeleton />
            ) : entries.length > 0 ? (
              <div className="dashboard-panel overflow-x-auto rounded-2xl">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>Action</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead className="hidden md:table-cell">Target</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="hidden lg:table-cell">IP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry) => {
                      const isExpanded = expandedRows.has(entry.id);
                      return (
                        <Fragment key={entry.id}>
                          <TableRow
                            className="cursor-pointer hover:bg-muted/50"
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
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={actionVariant(entry.action)}>{entry.action}</Badge>
                            </TableCell>
                            <TableCell className="font-mono text-sm">{entry.user_id}</TableCell>
                            <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                              {entry.target_type && entry.target_id
                                ? `${entry.target_type}:${entry.target_id}`
                                : '—'}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatDate(entry.created_at)}
                            </TableCell>
                            <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                              {entry.ip_address || '—'}
                            </TableCell>
                          </TableRow>
                          {isExpanded && entry.details && (
                            <TableRow key={`${entry.id}-details`}>
                              <TableCell colSpan={6} className="bg-muted/20 p-4">
                                <pre className="max-h-64 overflow-auto rounded-lg border border-border/50 bg-background p-3 text-xs">
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
                  actionFilter || debouncedUserSearch || startDate || endDate
                    ? 'No matching entries'
                    : 'No audit entries'
                }
                description={
                  actionFilter || debouncedUserSearch || startDate || endDate
                    ? 'Try adjusting your filters.'
                    : 'Actions will appear here as your team uses the dashboard.'
                }
              />
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="dashboard-chip flex items-center justify-between rounded-xl px-3 py-2">
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offset <= 0 || loading}
                    onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offset + PAGE_SIZE >= total || loading}
                    onClick={() => setOffset((o) => o + PAGE_SIZE)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}
