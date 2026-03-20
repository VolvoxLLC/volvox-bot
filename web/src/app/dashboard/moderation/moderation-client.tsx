'use client';

import { RefreshCw, Search, Shield, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { CaseTable } from '@/components/dashboard/case-table';
import { EmptyState } from '@/components/dashboard/empty-state';
import { ModerationStats } from '@/components/dashboard/moderation-stats';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { Input } from '@/components/ui/input';
import { useGuildSelection } from '@/hooks/use-guild-selection';
import { useModerationStore } from '@/stores/moderation-store';

export default function ModerationClient() {
  const router = useRouter();

  const {
    page,
    sortDesc,
    actionFilter,
    userSearch,
    userHistoryInput,
    lookupUserId,
    userHistoryPage,
    casesData,
    casesLoading,
    casesError,
    stats,
    statsLoading,
    statsError,
    userHistoryData,
    userHistoryLoading,
    userHistoryError,
    setPage,
    toggleSortDesc,
    setActionFilter,
    setUserSearch,
    setUserHistoryInput,
    setLookupUserId,
    setUserHistoryPage,
    clearFilters,
    clearUserHistory,
    resetOnGuildChange,
    fetchStats,
    fetchCases,
    fetchUserHistory,
  } = useModerationStore();

  const abortRefreshRef = useRef<AbortController | null>(null);

  const onGuildChange = useCallback(() => {
    resetOnGuildChange();
  }, [resetOnGuildChange]);

  const guildId = useGuildSelection({ onGuildChange });

  const onUnauthorized = useCallback(() => router.replace('/login'), [router]);

  useEffect(() => {
    if (!guildId) return;
    const controller = new AbortController();
    void (async () => {
      const result = await fetchStats(guildId, { signal: controller.signal });
      if (result === 'unauthorized') onUnauthorized();
    })();
    return () => controller.abort();
  }, [guildId, fetchStats, onUnauthorized]);

  // page, actionFilter, userSearch, sortDesc are read inside fetchCases via get()
  // but must appear in deps so the effect re-fires when they change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: filter deps trigger refetch
  useEffect(() => {
    if (!guildId) return;
    const controller = new AbortController();
    void (async () => {
      const result = await fetchCases(guildId, { signal: controller.signal });
      if (result === 'unauthorized') onUnauthorized();
    })();
    return () => controller.abort();
  }, [guildId, page, actionFilter, userSearch, sortDesc, fetchCases, onUnauthorized]);

  useEffect(() => {
    if (!guildId || !lookupUserId) return;
    const controller = new AbortController();
    void (async () => {
      const result = await fetchUserHistory(guildId, lookupUserId, userHistoryPage, {
        signal: controller.signal,
      });
      if (result === 'unauthorized') onUnauthorized();
    })();
    return () => controller.abort();
  }, [guildId, lookupUserId, userHistoryPage, fetchUserHistory, onUnauthorized]);

  useEffect(() => {
    return () => {
      abortRefreshRef.current?.abort();
    };
  }, []);

  const handleRefresh = useCallback(() => {
    if (!guildId) return;
    abortRefreshRef.current?.abort();
    const controller = new AbortController();
    abortRefreshRef.current = controller;
    const { signal } = controller;
    void (async () => {
      const [statsResult, casesResult] = await Promise.all([
        fetchStats(guildId, { signal }),
        fetchCases(guildId, { signal }),
      ]);
      if (lookupUserId) {
        const historyResult = await fetchUserHistory(guildId, lookupUserId, userHistoryPage, {
          signal,
        });
        if (historyResult === 'unauthorized') {
          onUnauthorized();
          return;
        }
      }
      if (statsResult === 'unauthorized' || casesResult === 'unauthorized') {
        onUnauthorized();
      }
    })();
  }, [
    guildId,
    lookupUserId,
    userHistoryPage,
    fetchStats,
    fetchCases,
    fetchUserHistory,
    onUnauthorized,
  ]);

  const handleUserHistorySearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = userHistoryInput.trim();
      if (!trimmed || !guildId) return;
      setLookupUserId(trimmed);
      setUserHistoryPage(1);
    },
    [guildId, userHistoryInput, setLookupUserId, setUserHistoryPage],
  );

  const handleClearUserHistory = useCallback(() => {
    clearUserHistory();
  }, [clearUserHistory]);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Shield}
        title="Moderation"
        description="Review cases, track activity, and audit your moderation team."
        actions={
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleRefresh}
            disabled={!guildId || statsLoading || casesLoading}
          >
            <RefreshCw
              className={`h-4 w-4 ${statsLoading || casesLoading ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
        }
      />

      {/* No guild selected */}
      {!guildId && (
        <EmptyState
          icon={Shield}
          title="Select a server"
          description="Choose a server from the sidebar to view moderation data."
        />
      )}

      {/* Content */}
      {guildId && (
        <>
          {/* Stats */}
          <ErrorBoundary title="Stats failed to load">
            <ModerationStats stats={stats} loading={statsLoading} error={statsError} />
          </ErrorBoundary>

          <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
            {/* Cases */}
            <section className="dashboard-panel space-y-3 rounded-2xl p-4 md:p-5">
              <div>
                <h3 className="text-lg font-semibold tracking-tight">Cases</h3>
                <p className="text-sm text-muted-foreground">
                  Review, filter, and audit moderator actions in one place.
                </p>
              </div>
              <CaseTable
                data={casesData}
                loading={casesLoading}
                error={casesError}
                page={page}
                sortDesc={sortDesc}
                actionFilter={actionFilter}
                userSearch={userSearch}
                guildId={guildId}
                onPageChange={setPage}
                onSortToggle={toggleSortDesc}
                onActionFilterChange={setActionFilter}
                onUserSearchChange={setUserSearch}
                onClearFilters={clearFilters}
              />
            </section>

            {/* User History Lookup */}
            <section className="dashboard-panel space-y-3 rounded-2xl p-4 md:p-5">
              <div>
                <h3 className="text-lg font-semibold tracking-tight">User History Lookup</h3>
                <p className="text-sm text-muted-foreground">
                  Look up a single user&apos;s full moderation timeline.
                </p>
              </div>

              <form
                onSubmit={handleUserHistorySearch}
                className="flex flex-wrap items-center gap-2"
              >
                <div className="relative min-w-[15rem] flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-10 rounded-xl border-border/70 bg-background/70 pl-9"
                    placeholder="Discord user ID (e.g. 123456789012345678)"
                    value={userHistoryInput}
                    onChange={(e) => setUserHistoryInput(e.target.value)}
                    aria-label="User ID for history lookup"
                  />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!userHistoryInput.trim() || userHistoryLoading}
                >
                  {userHistoryLoading ? (
                    <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="mr-1.5 h-4 w-4" />
                  )}
                  Look up
                </Button>
                {lookupUserId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClearUserHistory}
                    title="Clear user history"
                    aria-label="Clear user history"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </form>

              {lookupUserId ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    History for{' '}
                    <span className="font-mono font-semibold text-foreground">{lookupUserId}</span>
                    {userHistoryData && (
                      <>
                        {' '}
                        &mdash; <span className="font-semibold">{userHistoryData.total}</span>{' '}
                        {userHistoryData.total === 1 ? 'case' : 'cases'} total
                      </>
                    )}
                  </p>

                  <CaseTable
                    data={userHistoryData}
                    loading={userHistoryLoading}
                    error={userHistoryError}
                    page={userHistoryPage}
                    sortDesc
                    actionFilter="all"
                    userSearch=""
                    guildId={guildId}
                    onPageChange={(pg) => setUserHistoryPage(pg)}
                    onSortToggle={() => {}}
                    onActionFilterChange={() => {}}
                    onUserSearchChange={() => {}}
                    onClearFilters={() => {}}
                  />
                </div>
              ) : (
                <EmptyState
                  icon={Search}
                  title="Search a user"
                  description="Enter a Discord user ID to inspect their moderation case history."
                  className="min-h-0"
                />
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
