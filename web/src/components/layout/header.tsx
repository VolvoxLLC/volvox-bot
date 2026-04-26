'use client';

import {
  BookOpen,
  Calendar,
  Download,
  FileText,
  LogOut,
  Moon,
  MoreVertical,
  RefreshCw,
  Sun,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useTheme } from 'next-themes';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useConfigContext } from '@/components/dashboard/config-context';
import { ConfigSearch } from '@/components/dashboard/config-workspace/config-search';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPage,
  DropdownMenuPageTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/material-dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useAnalytics } from '@/contexts/analytics-context';
import { useGuildSelection } from '@/hooks/use-guild-selection';
import { getDashboardPageTitle } from '@/lib/page-titles';
import { cn } from '@/lib/utils';
import { useAuditLogStore } from '@/stores/audit-log-store';
import { useConversationsStore } from '@/stores/conversations-store';
import { useHealthStore } from '@/stores/health-store';
import { useMembersStore } from '@/stores/members-store';
import { useModerationStore } from '@/stores/moderation-store';
import { useTempRolesStore } from '@/stores/temp-roles-store';
import { useTicketsStore } from '@/stores/tickets-store';
import { MobileSidebar } from './mobile-sidebar';

// ─── Shared compact button classes ──────────────────────────────────────────
// Extracted from the repeated inline Tailwind strings across ~8 dashboard
// refresh-button sections (CodeRabbit PRRT_kwDORICdSM56CdQO).

const COMPACT_BTN_BASE =
  'group relative flex h-8 md:h-10 items-center justify-center gap-1.5 md:gap-2 overflow-hidden rounded-[14px] md:rounded-2xl border border-white/10 px-2.5 md:px-4 text-[10px] md:text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80 transition-all hover:bg-white/[0.05] hover:text-foreground active:scale-95 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.5)]';

const COMPACT_BTN_OVERLAY =
  'before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/[0.12] before:to-transparent before:pointer-events-none before:opacity-60';

const COMPACT_BTN_DISABLED = 'opacity-50 cursor-not-allowed active:scale-100';

/**
 * Renders the top navigation header for the Volvox.Bot Dashboard, including branding, a theme toggle, and a session-aware user menu.
 *
 * If the session reports a `RefreshTokenError`, initiates sign-out and redirects to `/login`; a guard prevents duplicate sign-out attempts.
 *
 * @returns The header element for the dashboard
 */
export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const { theme, setTheme } = useTheme();
  const signingOut = useRef(false);
  const currentPageTitle = getDashboardPageTitle(pathname);

  // Single handler for RefreshTokenError — sign out and redirect to login.
  // session.error is set by the JWT callback when refreshDiscordToken fails.
  // Note: This is the ONLY RefreshTokenError handler in the app (providers.tsx
  // delegates to this component to avoid race conditions).
  // The signingOut guard prevents duplicate sign-out attempts when the session
  // refetches and re-triggers this effect.
  const {
    rangePreset,
    setRangePreset,
    compareMode,
    setCompareMode,
    refresh,
    exportCsv,
    exportPdf,
    loading,
    customFromApplied,
    customToApplied,
    setCustomRange,
  } = useAnalytics();

  const isDashboard = pathname === '/dashboard';
  const isModerationDashboard = pathname === '/dashboard/moderation';
  const isMembersDashboard = pathname === '/dashboard/members';
  const isTicketsDashboard = pathname === '/dashboard/tickets';
  const isConversationsDashboard = pathname === '/dashboard/conversations';
  const isAuditLogDashboard = pathname === '/dashboard/audit-log';
  const isTempRolesDashboard = pathname === '/dashboard/temp-roles';
  const isPerformanceDashboard = pathname === '/dashboard/performance';
  const isLogsDashboard = pathname === '/dashboard/logs';

  // Global Guild State for Refresh Actions
  const guildId = useGuildSelection();

  // Moderation Refresh State
  const {
    fetchStats,
    fetchCases,
    fetchUserHistory,
    lookupUserId,
    userHistoryPage,
    statsLoading,
    casesLoading,
  } = useModerationStore();

  const handleModerationRefresh = React.useCallback(() => {
    if (!guildId) return;
    const controller = new AbortController();
    const signal = controller.signal;
    void (async () => {
      const [statsResult, casesResult] = await Promise.all([
        fetchStats(guildId, { signal }),
        fetchCases(guildId, { signal }),
      ]);
      if (lookupUserId) {
        const historyResult = await fetchUserHistory(guildId, lookupUserId, userHistoryPage, {
          signal,
        });
        if (historyResult === 'unauthorized') router.replace('/login');
      }
      if (statsResult === 'unauthorized' || casesResult === 'unauthorized') {
        router.replace('/login');
      }
    })();
  }, [guildId, lookupUserId, userHistoryPage, fetchStats, fetchCases, fetchUserHistory, router]);

  // Members Refresh State
  const { refresh: refreshMembers, loading: membersLoading } = useMembersStore();

  const handleMembersRefresh = React.useCallback(() => {
    if (!guildId) return;
    void (async () => {
      const result = await refreshMembers(guildId);
      if (result === 'unauthorized') router.replace('/login');
    })();
  }, [guildId, refreshMembers, router]);

  // Tickets Refresh State
  const { refresh: refreshTickets, loading: ticketsLoading } = useTicketsStore();

  const handleTicketsRefresh = React.useCallback(() => {
    if (!guildId) return;
    void (async () => {
      const result = await refreshTickets(guildId);
      if (result === 'unauthorized') router.replace('/login');
    })();
  }, [guildId, refreshTickets, router]);

  // Conversations Refresh State
  const { refresh: refreshConversations, loading: conversationsLoading } = useConversationsStore();
  const handleConversationsRefresh = React.useCallback(() => {
    if (guildId) void refreshConversations(guildId);
  }, [guildId, refreshConversations]);

  // Audit Log Refresh State
  const { refresh: refreshAuditLog, loading: auditLogLoading } = useAuditLogStore();
  const handleAuditLogRefresh = useCallback(() => {
    if (guildId) void refreshAuditLog(guildId);
  }, [guildId, refreshAuditLog]);

  // Temp Roles Refresh State
  const { refresh: refreshTempRoles, loading: tempRolesLoading } = useTempRolesStore();
  const handleTempRolesRefresh = useCallback(() => {
    if (guildId) void refreshTempRoles(guildId);
  }, [guildId, refreshTempRoles]);

  // Health Refresh State
  const { refresh: refreshHealth, loading: healthLoading } = useHealthStore();
  const handleHealthRefresh = useCallback(() => {
    if (guildId) void refreshHealth(guildId);
  }, [guildId, refreshHealth]);

  // Performance Refresh State
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const handlePerformanceRefresh = useCallback(() => {
    window.dispatchEvent(new CustomEvent('refresh-performance'));
  }, []);

  useEffect(() => {
    const handleStart = () => setPerformanceLoading(true);
    const handleEnd = () => setPerformanceLoading(false);
    window.addEventListener('performance-loading-start', handleStart);
    window.addEventListener('performance-loading-end', handleEnd);
    return () => {
      window.removeEventListener('performance-loading-start', handleStart);
      window.removeEventListener('performance-loading-end', handleEnd);
    };
  }, []);

  const [fromDraft, setFromDraft] = useState(customFromApplied);
  const [toDraft, setToDraft] = useState(customToApplied);

  useEffect(() => {
    setFromDraft(customFromApplied);
    setToDraft(customToApplied);
  }, [customFromApplied, customToApplied]);

  // Single handler for RefreshTokenError — sign out and redirect to login.
  useEffect(() => {
    if (session?.error === 'RefreshTokenError' && !signingOut.current) {
      signingOut.current = true;
      signOut({ callbackUrl: '/login' });
    }
  }, [session?.error]);

  const { activeCategoryId, searchQuery, searchResults, handleSearchChange, handleSearchSelect } =
    useConfigContext();

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-background/20 transition-all duration-300 shadow-[0_2px_5px_-2px_rgba(0,0,0,0.2)]">
      <div className="mx-auto flex h-12 md:h-14 w-full items-center gap-2 md:gap-4 px-2 md:px-4">
        <MobileSidebar />
        <div className="flex min-w-0 shrink-0 items-center gap-2 md:gap-3.5">
          <div
            className="group relative flex h-8 w-8 md:h-9 md:w-9 items-center justify-center rounded-xl md:rounded-2xl bg-gradient-to-br from-primary/80 to-secondary/80 p-[1px] shadow-lg shadow-primary/5 transition-all hover:scale-105 active:scale-95"
            style={{ WebkitMaskImage: '-webkit-radial-gradient(white, black)' }}
          >
            <div className="flex h-full w-full items-center justify-center rounded-[11px] md:rounded-[15px] bg-background/20 backdrop-blur-sm overflow-hidden">
              <Image
                src="/icon-192.png"
                alt="Volvox.Bot Logo"
                width={192}
                height={192}
                sizes="36px"
                className="h-full w-full drop-shadow-sm rounded-[inherit]"
              />
            </div>
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h2 className="text-xs md:text-sm font-black tracking-tight text-foreground/90">
                <span className="sm:hidden">
                  Volvox<span className="text-primary">.Bot</span>
                </span>
                <span className="hidden sm:inline italic">
                  VOLVOX<span className="text-primary not-italic">.BOT</span>
                </span>
              </h2>
              <div className="hidden h-1 w-1 rounded-full bg-border/40 sm:block" />
              <span className="hidden text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/30 sm:block">
                Control Room
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-[10px]">
              <div className="flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 font-bold uppercase tracking-widest text-primary ring-1 ring-primary/20">
                <span className="status-dot-live h-1 w-1" />
                Live
              </div>
              <span className="truncate font-medium text-muted-foreground/60 border-l border-border/40 pl-2">
                {currentPageTitle && currentPageTitle !== 'Overview'
                  ? currentPageTitle
                  : 'System Hub'}
              </span>
            </div>
          </div>
        </div>

        {/* Dynamic Search Bar for Settings */}
        {activeCategoryId && (
          <div className="flex-1 max-w-xl mx-auto hidden lg:block">
            <ConfigSearch
              value={searchQuery}
              onChange={handleSearchChange}
              results={searchResults}
              onSelect={handleSearchSelect}
            />
          </div>
        )}

        {isDashboard && (
          <div className="flex items-center gap-2">
            <div className="h-6 w-[1px] bg-border/40 mx-1 hidden md:block" />

            {/* Time Range Dropdown */}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger
                className={cn(
                  COMPACT_BTN_BASE,
                  COMPACT_BTN_OVERLAY,
                  rangePreset === 'custom' && 'text-primary border-primary/20',
                )}
              >
                <Calendar className="h-3 w-3 md:h-3.5 md:w-3.5 opacity-60" />
                <span>{rangePreset === 'custom' ? 'Custom Range' : rangePreset}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-56 p-2 rounded-[28px] backdrop-blur-3xl border-t border-border/20 bg-gradient-to-b from-popover/95 to-popover/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_32px_64px_-16px_rgba(0,0,0,0.6)]"
              >
                <DropdownMenuPage id="main">
                  <DropdownMenuRadioGroup
                    value={rangePreset}
                    onValueChange={(v) => v !== 'custom' && setRangePreset(v as typeof rangePreset)}
                  >
                    <DropdownMenuRadioItem value="today">Today</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="week">This Week</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="month">This Month</DropdownMenuRadioItem>
                    <DropdownMenuPageTrigger targetId="custom-range">
                      <span className={cn(rangePreset === 'custom' && 'text-primary')}>
                        Custom Range
                      </span>
                    </DropdownMenuPageTrigger>
                  </DropdownMenuRadioGroup>
                </DropdownMenuPage>

                <DropdownMenuPage id="custom-range">
                  <DropdownMenuLabel>Custom Range</DropdownMenuLabel>
                  <div className="p-3 space-y-3">
                    <div className="space-y-1">
                      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40">
                        From
                      </span>
                      <input
                        type="date"
                        value={fromDraft}
                        onChange={(e) => setFromDraft(e.target.value)}
                        className="w-full h-9 rounded-lg border border-white/10 bg-black/20 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40">
                        To
                      </span>
                      <input
                        type="date"
                        value={toDraft}
                        onChange={(e) => setToDraft(e.target.value)}
                        className="w-full h-9 rounded-lg border border-white/10 bg-black/20 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                    </div>
                    <Button
                      size="sm"
                      className="w-full rounded-xl text-[10px] font-black uppercase tracking-widest"
                      onClick={() => {
                        setCustomRange(fromDraft, toDraft);
                      }}
                    >
                      Apply Range
                    </Button>
                  </div>
                </DropdownMenuPage>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Actions Menu */}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger
                className={cn(
                  'group relative flex h-8 w-8 md:h-10 md:w-10 items-center justify-center overflow-hidden rounded-[14px] md:rounded-2xl border border-white/10 transition-all hover:bg-white/[0.05] text-muted-foreground/60 hover:text-foreground active:scale-95 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.5)]',
                  COMPACT_BTN_OVERLAY,
                )}
              >
                <MoreVertical className="h-3.5 w-3.5 md:h-4 md:w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 p-2 rounded-[28px] backdrop-blur-3xl border-t border-border/20 bg-gradient-to-b from-popover/95 to-popover/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_32px_64px_-16px_rgba(0,0,0,0.6)]"
              >
                <DropdownMenuPage id="main">
                  <DropdownMenuItem
                    onClick={() => refresh()}
                    disabled={loading}
                    className="hidden md:flex"
                  >
                    <RefreshCw
                      className={cn('h-3.5 w-3.5 opacity-60', loading && 'animate-spin')}
                    />
                    <span className="text-xs font-bold">Refresh Data</span>
                  </DropdownMenuItem>

                  <DropdownMenuCheckboxItem
                    checked={compareMode}
                    onCheckedChange={(c) => setCompareMode(!!c)}
                  >
                    <span className="text-xs font-bold">Compare Mode</span>
                  </DropdownMenuCheckboxItem>

                  <DropdownMenuSeparator className="mx-1 my-1 opacity-50" />

                  <DropdownMenuPageTrigger targetId="export">
                    <Download className="h-3.5 w-3.5 opacity-60" />
                    <span className="text-xs font-bold">Export Data</span>
                  </DropdownMenuPageTrigger>
                </DropdownMenuPage>

                <DropdownMenuPage id="export">
                  <DropdownMenuLabel>Export Options</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => exportCsv()}>
                    <FileText className="h-3.5 w-3.5 opacity-60" />
                    <span className="text-xs font-bold">Export to CSV</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportPdf()}>
                    <Download className="h-3.5 w-3.5 opacity-60" />
                    <span className="text-xs font-bold">Export to PDF</span>
                  </DropdownMenuItem>
                </DropdownMenuPage>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {isModerationDashboard && (
          <div className="hidden md:flex items-center gap-2">
            <div className="h-6 w-[1px] bg-border/40 mx-1" />
            <button
              type="button"
              onClick={handleModerationRefresh}
              disabled={!guildId || statsLoading || casesLoading}
              className={cn(
                `${COMPACT_BTN_BASE} bg-transparent `,
                COMPACT_BTN_OVERLAY,
                (!guildId || statsLoading || casesLoading) && COMPACT_BTN_DISABLED,
              )}
            >
              <RefreshCw
                className={cn(
                  'h-3 w-3 md:h-3.5 md:w-3.5 opacity-60',
                  (statsLoading || casesLoading) && 'animate-spin',
                )}
              />
              <span>Refresh Mod Data</span>
            </button>
          </div>
        )}

        {isMembersDashboard && (
          <div className="hidden md:flex items-center gap-2">
            <div className="h-6 w-[1px] bg-border/40 mx-1" />
            <button
              type="button"
              onClick={handleMembersRefresh}
              disabled={!guildId || membersLoading}
              className={cn(
                `${COMPACT_BTN_BASE} bg-transparent `,
                COMPACT_BTN_OVERLAY,
                (!guildId || membersLoading) && COMPACT_BTN_DISABLED,
              )}
            >
              <RefreshCw
                className={cn(
                  'h-3 w-3 md:h-3.5 md:w-3.5 opacity-60',
                  membersLoading && 'animate-spin',
                )}
              />
              <span>Refresh Members</span>
            </button>
          </div>
        )}

        {isTicketsDashboard && (
          <div className="hidden md:flex items-center gap-2">
            <div className="h-6 w-[1px] bg-border/40 mx-1" />
            <button
              type="button"
              onClick={handleTicketsRefresh}
              disabled={!guildId || ticketsLoading}
              className={cn(
                `${COMPACT_BTN_BASE} bg-transparent `,
                COMPACT_BTN_OVERLAY,
                (!guildId || ticketsLoading) && COMPACT_BTN_DISABLED,
              )}
            >
              <RefreshCw
                className={cn(
                  'h-3 w-3 md:h-3.5 md:w-3.5 opacity-60',
                  ticketsLoading && 'animate-spin',
                )}
              />
              <span>Refresh Tickets</span>
            </button>
          </div>
        )}

        {isConversationsDashboard && (
          <div className="hidden md:flex items-center gap-2">
            <div className="h-6 w-[1px] bg-border/40 mx-1" />
            <button
              type="button"
              onClick={handleConversationsRefresh}
              disabled={!guildId || conversationsLoading}
              className={cn(
                `${COMPACT_BTN_BASE} bg-transparent `,
                COMPACT_BTN_OVERLAY,
                (!guildId || conversationsLoading) && COMPACT_BTN_DISABLED,
              )}
            >
              <RefreshCw
                className={cn(
                  'h-3 w-3 md:h-3.5 md:w-3.5 opacity-60',
                  conversationsLoading && 'animate-spin',
                )}
              />
              <span>Refresh Conversations</span>
            </button>
          </div>
        )}

        {isAuditLogDashboard && (
          <div className="hidden md:flex items-center gap-2">
            <div className="h-6 w-[1px] bg-border/40 mx-1" />
            <button
              type="button"
              onClick={handleAuditLogRefresh}
              disabled={!guildId || auditLogLoading}
              className={cn(
                `${COMPACT_BTN_BASE} bg-transparent `,
                COMPACT_BTN_OVERLAY,
                (!guildId || auditLogLoading) && COMPACT_BTN_DISABLED,
              )}
            >
              <RefreshCw
                className={cn(
                  'h-3 w-3 md:h-3.5 md:w-3.5 opacity-60',
                  auditLogLoading && 'animate-spin',
                )}
              />
              <span>Refresh Audit Log</span>
            </button>
          </div>
        )}

        {isTempRolesDashboard && (
          <div className="hidden md:flex items-center gap-2">
            <div className="h-6 w-[1px] bg-border/40 mx-1" />
            <button
              type="button"
              onClick={handleTempRolesRefresh}
              disabled={!guildId || tempRolesLoading}
              className={cn(
                `${COMPACT_BTN_BASE} bg-transparent `,
                COMPACT_BTN_OVERLAY,
                (!guildId || tempRolesLoading) && COMPACT_BTN_DISABLED,
              )}
            >
              <RefreshCw
                className={cn(
                  'h-3 w-3 md:h-3.5 md:w-3.5 opacity-60',
                  tempRolesLoading && 'animate-spin',
                )}
              />
              <span>Refresh Temp Roles</span>
            </button>
          </div>
        )}

        {isPerformanceDashboard && (
          <div className="hidden md:flex items-center gap-2">
            <div className="h-6 w-[1px] bg-border/40 mx-1" />
            <button
              type="button"
              onClick={handlePerformanceRefresh}
              disabled={performanceLoading}
              className={cn(
                `${COMPACT_BTN_BASE} bg-transparent `,
                COMPACT_BTN_OVERLAY,
                performanceLoading && COMPACT_BTN_DISABLED,
              )}
            >
              <RefreshCw
                className={cn(
                  'h-3 w-3 md:h-3.5 md:w-3.5 opacity-60',
                  performanceLoading && 'animate-spin',
                )}
              />
              <span>Refresh Metrics</span>
            </button>
          </div>
        )}

        {isLogsDashboard && (
          <div className="hidden md:flex items-center gap-2">
            <div className="h-6 w-[1px] bg-border/40 mx-1" />
            <button
              type="button"
              onClick={handleHealthRefresh}
              disabled={!guildId || healthLoading}
              className={cn(
                `${COMPACT_BTN_BASE} bg-transparent `,
                COMPACT_BTN_OVERLAY,
                (!guildId || healthLoading) && COMPACT_BTN_DISABLED,
              )}
            >
              <RefreshCw
                className={cn(
                  'h-3 w-3 md:h-3.5 md:w-3.5 opacity-60',
                  healthLoading && 'animate-spin',
                )}
              />
              <span>Refresh Health</span>
            </button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-1 md:gap-2">
          {status === 'loading' && (
            <Skeleton className="h-8 w-8 rounded-full bg-white/5" data-testid="header-skeleton" />
          )}
          {status === 'unauthenticated' && (
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="rounded-xl px-4 text-[11px] font-bold uppercase tracking-wider hover:bg-primary/10 hover:text-primary"
            >
              <Link href="/login">Sign in</Link>
            </Button>
          )}

          {status === 'authenticated' && session?.user && (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger
                className="group relative flex h-8 w-8 md:h-10 md:w-10 overflow-hidden outline-none items-center justify-center rounded-xl md:rounded-2xl transition-all shadow-[0_2px_8px_-2px_rgba(0,0,0,0.5)] border border-white/10 hover:border-primary/30"
                data-testid="header-user-menu"
              >
                <div className="absolute inset-0 bg-gradient-to-b from-white/[0.08] to-transparent pointer-events-none" />
                <div className="relative z-10 w-full h-full flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
                  <Avatar className="h-7 w-7 md:h-[34px] md:w-[34px] rounded-[10px] md:rounded-[14px]">
                    <AvatarImage
                      src={session.user.image ?? ''}
                      alt={session.user.name ?? ''}
                      className="shadow-inner"
                    />
                    <AvatarFallback className="rounded-[10px] md:rounded-[14px] bg-background/50 font-black tracking-widest text-[9px] md:text-[10px] text-muted-foreground/60 shadow-inner">
                      {session.user.name?.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={12}
                className="w-64 rounded-[28px] p-0 backdrop-blur-3xl border-t border-border/20 bg-gradient-to-b from-popover/95 to-popover/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_32px_64px_-16px_rgba(0,0,0,0.6)]"
              >
                <DropdownMenuPage id="main">
                  <DropdownMenuLabel className="px-5 pt-4 pb-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60">
                        Operator
                      </span>
                      <span className="truncate text-sm font-black tracking-tight text-foreground/90">
                        {session.user.name}
                      </span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="mx-2 mb-2 bg-white/5" />

                  <div className="space-y-1">
                    <DropdownMenuPageTrigger targetId="appearance">
                      <Sun className="h-4 w-4 opacity-60" />
                      <span className="text-xs font-bold tracking-tight">Appearance</span>
                    </DropdownMenuPageTrigger>

                    <DropdownMenuItem asChild>
                      <a
                        href="https://docs.volvox.bot"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2"
                      >
                        <BookOpen className="h-4 w-4 opacity-60" />
                        <span className="text-xs font-bold tracking-tight">Documentation</span>
                      </a>
                    </DropdownMenuItem>
                  </div>
                  <DropdownMenuSeparator className="mx-2 my-2 bg-white/5" />
                  <DropdownMenuItem
                    className="cursor-pointer text-destructive focus:text-destructive"
                    onClick={() => signOut({ callbackUrl: '/' })}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span className="text-xs font-black tracking-widest uppercase">
                      Terminate Session
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuPage>

                <DropdownMenuPage id="appearance">
                  <DropdownMenuLabel className="px-5 pt-4 pb-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60">
                        Preferences
                      </span>
                      <span className="truncate text-sm font-black tracking-tight text-foreground/90">
                        Appearance
                      </span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="mx-2 mb-2 bg-white/5" />

                  <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                    <DropdownMenuRadioItem value="light">
                      <Sun className="h-3.5 w-3.5 opacity-60" />
                      <span className="text-xs font-bold tracking-tight">Light Aspect</span>
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="dark">
                      <Moon className="h-3.5 w-3.5 opacity-60" />
                      <span className="text-xs font-bold tracking-tight">Dark Protocol</span>
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="system">
                      <div className="flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-muted-foreground/20">
                        <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                      </div>
                      <span className="text-xs font-bold tracking-tight">System Default</span>
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuPage>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
}
