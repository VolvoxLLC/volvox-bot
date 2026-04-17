'use client';

import { Search, Ticket, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { EmptyState } from '@/components/dashboard/empty-state';
import { Badge } from '@/components/ui/badge';
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
import { useTicketsStore } from '@/stores/tickets-store';

function TicketsSkeleton() {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">ID</TableHead>
            <TableHead>Topic</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="hidden md:table-cell">Closed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 8 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders have no stable identity
            <TableRow key={`skeleton-${i}`}>
              <TableCell>
                <Skeleton className="h-4 w-8" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-40" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-28 font-mono" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-16" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-20" />
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <Skeleton className="h-4 w-20" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return 'N/A';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

const PAGE_SIZE = 25;

export default function TicketsClient() {
  const router = useRouter();

  const {
    tickets,
    total,
    stats,
    loading,
    error,
    page,
    statusFilter,
    search,
    debouncedSearch,
    setPage,
    setStatusFilter,
    setSearch,
    setDebouncedSearch,
    resetAll,
    fetchStats,
    fetchTickets,
  } = useTicketsStore();

  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(searchTimerRef.current);
  }, [search, setDebouncedSearch]);

  const onGuildChange = useCallback(() => {
    resetAll();
  }, [resetAll]);

  const guildId = useGuildSelection({ onGuildChange });

  const _onUnauthorized = useCallback(() => router.replace('/login'), [router]);

  // Fetch stats on guild change
  useEffect(() => {
    if (!guildId) return;
    const controller = new AbortController();
    fetchStats(guildId, controller.signal);
    return () => controller.abort();
  }, [guildId, fetchStats]);

  // Fetch tickets
  useEffect(() => {
    if (!guildId) return;
    const controller = new AbortController();
    void fetchTickets({
      guildId,
      status: statusFilter,
      user: debouncedSearch,
      page,
      signal: controller.signal,
    }).then((res) => {
      if (res === 'unauthorized') router.replace('/login');
    });
    return () => controller.abort();
  }, [guildId, statusFilter, debouncedSearch, page, fetchTickets, router]);

  const handleRowClick = useCallback(
    (ticketId: number) => {
      if (!guildId) return;
      router.push(`/dashboard/tickets/${ticketId}?guildId=${encodeURIComponent(guildId)}`);
    },
    [router, guildId],
  );

  const handleClearSearch = useCallback(() => {
    setSearch('');
    setDebouncedSearch('');
    setPage(1);
  }, [setSearch, setDebouncedSearch, setPage]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="group relative overflow-hidden rounded-[24px] border border-border/40 bg-card/40 p-6 backdrop-blur-2xl shadow-lg transition-all hover:bg-card/50 px-5 pt-5 pb-6 bg-gradient-to-br from-primary/12 to-background">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Open Tickets
            </div>
            <div className="mt-3 text-3xl font-semibold tracking-tight tabular-nums md:text-4xl text-foreground/90">
              {stats.openCount}
            </div>
          </div>
          <div className="group relative overflow-hidden rounded-[24px] border border-border/40 bg-card/40 p-6 backdrop-blur-2xl shadow-lg transition-all hover:bg-card/50 px-5 pt-5 pb-6 bg-gradient-to-br from-secondary/10 to-background">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Avg Resolution
            </div>
            <div className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl text-foreground/90">
              {formatDuration(stats.avgResolutionSeconds)}
            </div>
          </div>
          <div className="group relative overflow-hidden rounded-[24px] border border-border/40 bg-card/40 p-6 backdrop-blur-2xl shadow-lg transition-all hover:bg-card/50 px-5 pt-5 pb-6">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              This Week
            </div>
            <div className="mt-3 text-3xl font-semibold tracking-tight tabular-nums md:text-4xl text-foreground/90">
              {stats.ticketsThisWeek}
            </div>
          </div>
        </div>
      )}

      {/* No guild selected */}
      {!guildId && (
        <EmptyState
          icon={Ticket}
          title="Select a server"
          description="Choose a server from the sidebar to view tickets."
        />
      )}

      {/* Content */}
      {guildId && (
        <>
          {/* Filters — compact inline strip */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
              <Input
                className="h-9 rounded-xl border-border/40 bg-card/40 pl-8 pr-8 text-sm backdrop-blur-sm w-full"
                placeholder="Search by user ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search tickets by user"
              />
              {search && (
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground"
                  onClick={handleClearSearch}
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <Select
              value={statusFilter}
              onValueChange={(val) => {
                setStatusFilter(val === 'all' ? '' : val);
              }}
            >
              <SelectTrigger className="h-9 w-[150px] rounded-xl border-border/40 bg-card/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70 backdrop-blur-sm">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-white/10 bg-popover/95 backdrop-blur-xl shadow-xl">
                <SelectItem value="all" className="text-xs font-semibold">
                  All statuses
                </SelectItem>
                <SelectItem value="open" className="text-xs font-semibold">
                  Open
                </SelectItem>
                <SelectItem value="closed" className="text-xs font-semibold">
                  Closed
                </SelectItem>
              </SelectContent>
            </Select>

            {total > 0 && (
              <span className="text-[11px] font-medium text-muted-foreground/50 tabular-nums">
                {total.toLocaleString()} {total === 1 ? 'ticket' : 'tickets'}
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
          {loading && tickets.length === 0 ? (
            <div className="overflow-hidden rounded-[24px] border border-border/40 bg-card/40 backdrop-blur-2xl shadow-lg">
              <TicketsSkeleton />
            </div>
          ) : tickets.length > 0 ? (
            <div className="overflow-x-auto rounded-[24px] border border-border/40 bg-card/40 backdrop-blur-2xl shadow-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">ID</TableHead>
                    <TableHead>Topic</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="hidden md:table-cell">Closed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.map((ticket) => (
                    <TableRow
                      key={ticket.id}
                      className="cursor-pointer transition-colors hover:bg-muted/30 border-white/5"
                      tabIndex={0}
                      onClick={() => handleRowClick(ticket.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleRowClick(ticket.id);
                        }
                      }}
                    >
                      <TableCell className="font-mono text-sm">#{ticket.id}</TableCell>
                      <TableCell className="max-w-xs truncate">
                        {ticket.topic || (
                          <span className="text-muted-foreground/60 italic">No topic</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm text-foreground/80">
                        {ticket.user_id}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={ticket.status === 'open' ? 'default' : 'secondary'}
                          className={
                            ticket.status === 'open'
                              ? 'bg-primary/20 text-primary hover:bg-primary/30 border border-primary/20 rounded-full'
                              : 'bg-white/5 text-muted-foreground rounded-full'
                          }
                        >
                          {ticket.status === 'open' ? 'Open' : 'Closed'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground/80">
                        {formatDate(ticket.created_at)}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground/80 md:table-cell">
                        {ticket.closed_at ? formatDate(ticket.closed_at) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyState
              icon={Ticket}
              title={statusFilter || debouncedSearch ? 'No matching tickets' : 'No tickets found'}
              description={
                statusFilter || debouncedSearch
                  ? 'Try adjusting status or user filters.'
                  : 'Tickets will appear here once they are created.'
              }
            />
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage(Math.max(1, page - 1))}
                  className="inline-flex items-center gap-1.5 rounded-2xl border border-white/10 bg-card/40 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70 backdrop-blur-sm shadow-sm transition-all hover:bg-card/60 hover:text-foreground active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage(page + 1)}
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
  );
}
