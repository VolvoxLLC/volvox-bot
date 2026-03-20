'use client';

import { RefreshCw, Search, Users, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { EmptyState } from '@/components/dashboard/empty-state';
import { MemberTable } from '@/components/dashboard/member-table';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useGuildSelection } from '@/hooks/use-guild-selection';
import { useMembersStore } from '@/stores/members-store';

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
    void runFetch({
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
    void runFetch({
      guildId,
      search: debouncedSearch,
      sortColumn,
      sortOrder,
      after: nextAfter,
      append: true,
    });
  }, [guildId, nextAfter, loading, runFetch, debouncedSearch, sortColumn, sortOrder]);

  const handleRefresh = useCallback(() => {
    if (!guildId) return;
    resetPagination();
    void runFetch({
      guildId,
      search: debouncedSearch,
      sortColumn,
      sortOrder,
      after: null,
      append: false,
    });
  }, [guildId, runFetch, debouncedSearch, sortColumn, sortOrder, resetPagination]);

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

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Users}
        title="Members"
        description="View member activity, XP, levels, and moderation history."
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
          icon={Users}
          title="Select a server"
          description="Choose a server from the sidebar to view members."
        />
      )}

      {/* Content */}
      {guildId && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="dashboard-panel rounded-2xl bg-gradient-to-br from-primary/12 to-background p-4 md:p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Total Members
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums md:text-4xl">
                {total.toLocaleString()}
              </p>
            </div>
            <div className="dashboard-panel rounded-2xl bg-gradient-to-br from-secondary/10 to-background p-4 md:p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Filtered Results
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums md:text-4xl">
                {(filteredTotal ?? total).toLocaleString()}
              </p>
            </div>
            <div className="dashboard-panel rounded-2xl p-4 md:p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Sort Strategy
              </p>
              <p className="mt-3 text-lg font-semibold tracking-tight capitalize md:text-xl">
                {sortColumn} · {sortOrder}
              </p>
            </div>
          </div>

          {/* Search + stats bar */}
          <div className="dashboard-panel flex flex-wrap items-center gap-3 rounded-2xl p-4 md:p-5">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-10 rounded-xl border-border/70 bg-background/70 pl-9 pr-8"
                placeholder="Search by username or display name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search members"
              />
              {search && (
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
            {total > 0 && (
              <span className="text-sm text-muted-foreground tabular-nums">
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

          {/* Table */}
          <MemberTable
            members={members}
            onSort={handleSort}
            sortColumn={sortColumn}
            sortOrder={sortOrder}
            onLoadMore={handleLoadMore}
            hasMore={nextAfter !== null}
            loading={loading}
            onRowClick={handleRowClick}
          />
        </>
      )}
    </div>
  );
}
