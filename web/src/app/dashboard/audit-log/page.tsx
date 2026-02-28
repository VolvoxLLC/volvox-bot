'use client';

import { ChevronDown, ChevronRight, ClipboardList, RefreshCw, Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ClipboardList className="h-6 w-6" />
            Audit Log
          </h2>
          <p className="text-muted-foreground">
            Track all admin actions and configuration changes.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="gap-2 self-start sm:self-auto"
          onClick={handleRefresh}
          disabled={!guildId || loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* No guild selected */}
      {!guildId && (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed">
          <p className="text-sm text-muted-foreground">
            Select a server from the sidebar to view the audit log.
          </p>
        </div>
      )}

      {/* Content */}
      {guildId && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9 pr-8"
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
              <SelectTrigger className="w-[180px]">
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
              className="w-[150px]"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setOffset(0);
              }}
              aria-label="Start date filter"
            />

            <Input
              type="date"
              className="w-[150px]"
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
          {entries.length > 0 ? (
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
                  {entries.map((entry) => {
                    const isExpanded = expandedRows.has(entry.id);
                    return (
                      <React.Fragment key={entry.id}>
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
                            <TableCell colSpan={6} className="bg-muted/30 p-4">
                              <pre className="max-h-64 overflow-auto rounded-md bg-background p-3 text-xs">
                                {JSON.stringify(entry.details, null, 2)}
                              </pre>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            !loading && (
              <div className="flex h-48 items-center justify-center rounded-lg border border-dashed">
                <p className="text-sm text-muted-foreground">
                  {actionFilter || debouncedUserSearch || startDate || endDate
                    ? 'No audit entries match your filters.'
                    : 'No audit log entries found.'}
                </p>
              </div>
            )
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
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
  );
}
