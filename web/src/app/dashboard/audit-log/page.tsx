'use client';

import { Check, ChevronDown, ChevronRight, ClipboardList, Copy, Search, X } from 'lucide-react';
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

/**
 * Selects a UI variant name based on keywords present in an audit action string.
 *
 * @param action - The audit action identifier to inspect; substring matches are case-sensitive.
 * @returns `destructive` if `action` includes "delete", `default` if it includes "create", `secondary` if it includes "update", `outline` otherwise.
 */
function actionVariant(action: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (action.includes('delete')) return 'destructive';
  if (action.includes('create')) return 'default';
  if (action.includes('update')) return 'secondary';
  return 'outline';
}

/**
 * Copies the provided string to the clipboard and shows a transient visual confirmation while preventing the click from bubbling.
 *
 * @param value - The string to copy to the user's clipboard
 */
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!navigator.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);

      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }

      resetTimeoutRef.current = setTimeout(() => {
        setCopied(false);
        resetTimeoutRef.current = null;
      }, 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="ml-2 inline-flex items-center justify-center rounded p-1 text-muted-foreground/30 transition-colors hover:bg-muted/50 hover:text-foreground active:scale-95"
      aria-label="Copy ID"
    >
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

const PAGE_SIZE = 25;

/**
 * Renders a non-interactive skeleton table that mirrors the audit log's columns and responsive layout.
 *
 * @returns A JSX element containing placeholder rows and cells matching the audit log table structure for loading states.
 */
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

/**
 * Render the audit log page for the currently selected guild, showing stats, filter controls,
 * a paginated table of audit entries with expandable details, and error/empty states.
 *
 * The component manages local UI state (expanded rows, debounced user search) and drives the
 * audit log store for filtering and fetching. If a fetch result indicates `"unauthorized"`,
 * the router is redirected to `/login`.
 *
 * @returns A React element that renders the audit log UI.
 */
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
                            className="cursor-pointer border-border/10 transition-colors hover:bg-muted/30"
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
                            <TableCell className="text-sm text-foreground/80">
                              <div className="flex flex-col">
                                <span className="font-semibold">
                                  {entry.user_tag || `User ${entry.user_id.slice(-4)}`}
                                </span>
                                <div className="flex items-center text-[10px] font-mono text-muted-foreground/50">
                                  {entry.user_id}
                                  <CopyButton value={entry.user_id} />
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="hidden text-sm text-muted-foreground/60 md:table-cell">
                              {entry.target_id ? (
                                <div className="flex flex-col">
                                  <span className="font-semibold text-foreground/70">
                                    {entry.target_tag || `Target ${entry.target_id.slice(-4)}`}
                                  </span>
                                  <div className="flex items-center text-[10px] font-mono text-muted-foreground/40">
                                    <span>
                                      {entry.target_type ? `${entry.target_type}:${entry.target_id}` : entry.target_id}
                                    </span>
                                    <CopyButton value={entry.target_id} />
                                  </div>
                                </div>
                              ) : (
                                '—'
                              )}
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
                              <TableCell colSpan={6} className="max-w-0 bg-background/20 p-4">
                                <div className="w-full overflow-hidden rounded-[14px] border border-border/30 bg-background/50">
                                  <pre className="max-h-64 w-full overflow-x-auto p-3 text-xs text-foreground/70 scrollbar-thin scrollbar-thumb-border/20">
                                    {JSON.stringify(entry.details, null, 2)}
                                  </pre>
                                </div>
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
