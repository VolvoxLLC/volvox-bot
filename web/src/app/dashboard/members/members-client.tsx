'use client';

import { Search, Users, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { EmptyState } from '@/components/dashboard/empty-state';
import { MemberTable } from '@/components/dashboard/member-table';
import { Input } from '@/components/ui/input';
import { useGuildSelection } from '@/hooks/use-guild-selection';
import { useMembersStore } from '@/stores/members-store';

const SORT_COLUMN_LABELS: Record<string, string> = {
  messages: 'Messages',
  xp: 'XP',
  warnings: 'Warnings',
  joined: 'Joined',
};

type SummaryCardProps = {
  label: string;
  value: string;
  accentClassName?: string;
};

function SummaryCard({ label, value, accentClassName }: SummaryCardProps) {
  return (
    <div
      className={[
        'group relative overflow-hidden rounded-[24px] border border-border/40 bg-card/40 p-6 backdrop-blur-2xl shadow-lg transition-all hover:bg-card/50',
        accentClassName,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums md:text-4xl text-foreground/90">
        {value}
      </p>
    </div>
  );
}

/**
 * Renders the Members page with search, sorting, pagination, and a member list table.
 *
 * Displays a searchable and sortable list of guild members, supports cursor-based
 * pagination, refreshing, row navigation to a member detail page, and shows totals
 * and errors. If the API responds with an unauthorized status, navigates to `/login`.
 */
export default function MembersClient() {
  const router = useRouter();

  const {
    members,
    nextAfter,
    total,
    filteredTotal,
    loading,
    error,
    search,
    debouncedSearch,
    sortColumn,
    sortOrder,
    setSearch,
    setDebouncedSearch,
    setSortColumn,
    setSortOrder,
    resetPagination,
    resetAll,
    fetchMembers,
  } = useMembersStore();

  // Debounce search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // AbortController for cancelling in-flight requests
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(searchTimerRef.current);
  }, [search, setDebouncedSearch]);

  // Abort in-flight request on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const onGuildChange = useCallback(() => {
    abortRef.current?.abort();
    resetAll();
  }, [resetAll]);

  const guildId = useGuildSelection({ onGuildChange });

  const onUnauthorized = useCallback(() => router.replace('/login'), [router]);

  // Fetch helper that manages abort controller and unauthorized redirect
  const runFetch = useCallback(
    async (opts: Parameters<typeof fetchMembers>[0]) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const result = await fetchMembers({ ...opts, signal: controller.signal });
      if (result === 'unauthorized') onUnauthorized();
    },
    [fetchMembers, onUnauthorized],
  );

  // Fetch on guild/search/sort change
  useEffect(() => {
    if (!guildId) return;
    runFetch({
      guildId,
      search: debouncedSearch,
      sortColumn,
      sortOrder,
      after: null,
      append: false,
    });
  }, [guildId, debouncedSearch, sortColumn, sortOrder, runFetch]);

  const handleSort = useCallback(
    (col: typeof sortColumn) => {
      if (col === sortColumn) {
        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
      } else {
        setSortColumn(col);
        setSortOrder('desc');
      }
      resetPagination();
    },
    [sortColumn, sortOrder, setSortColumn, setSortOrder, resetPagination],
  );

  const handleLoadMore = useCallback(() => {
    if (!guildId || !nextAfter || loading) return;
    runFetch({
      guildId,
      search: debouncedSearch,
      sortColumn,
      sortOrder,
      after: nextAfter,
      append: true,
    });
  }, [guildId, nextAfter, loading, runFetch, debouncedSearch, sortColumn, sortOrder]);

  const handleRowClick = useCallback(
    (userId: string) => {
      if (!guildId) return;
      router.push(`/dashboard/members/${userId}?guildId=${encodeURIComponent(guildId)}`);
    },
    [router, guildId],
  );

  const handleClearSearch = useCallback(() => {
    setSearch('');
    setDebouncedSearch('');
  }, [setSearch, setDebouncedSearch]);

  const summaryCards = [
    {
      label: 'Total Members',
      value: total.toLocaleString(),
      accentClassName: 'bg-gradient-to-br from-primary/12 to-background',
    },
    {
      label: 'Filtered Results',
      value: (filteredTotal ?? total).toLocaleString(),
      accentClassName: 'bg-gradient-to-br from-secondary/10 to-background',
    },
    {
      label: 'Sorted By',
      value: `${SORT_COLUMN_LABELS[sortColumn] ?? sortColumn} ${sortOrder === 'asc' ? '↑' : '↓'}`,
    },
  ] as const;

  return (
    <div className="space-y-6">
      {/* No guild selected */}
      {!guildId && (
        <EmptyState
          icon={Users}
          title="Select a server"
          description="Choose a server from the sidebar to view members."
        />
      )}

      {/* Content */}
      {guildId && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {summaryCards.map((card) => (
              <SummaryCard key={card.label} {...card} />
            ))}
          </div>

          {/* Search + stats bar — compact inline strip */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px] max-w-sm">
              <Input
                className="pl-10 pr-10"
                placeholder="Search members..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search members"
              />
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50 z-10 pointer-events-none" />
              {search && (
                <button
                  type="button"
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground transition-colors z-10"
                  onClick={handleClearSearch}
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {total > 0 && (
              <span className="ml-auto text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/30 tabular-nums">
                {filteredTotal !== null && filteredTotal !== total
                  ? `${filteredTotal.toLocaleString()} of ${total.toLocaleString()} members`
                  : `${total.toLocaleString()} ${total === 1 ? 'member' : 'members'}`}
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

          <MemberTable
            members={members}
            onSort={handleSort}
            sortColumn={sortColumn}
            sortOrder={sortOrder}
            onLoadMore={handleLoadMore}
            hasMore={!!nextAfter}
            loading={loading}
            onRowClick={handleRowClick}
          />
        </>
      )}
    </div>
  );
}
