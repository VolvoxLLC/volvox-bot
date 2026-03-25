'use client';

import { Bot, ChevronsUpDown, ExternalLink, RefreshCw, Server } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isGuildManageable } from '@/hooks/use-guild-role';
import { getBotInviteUrl, getGuildIconUrl } from '@/lib/discord';
import { broadcastSelectedGuild, SELECTED_GUILD_KEY } from '@/lib/guild-selection';
import { cn } from '@/lib/utils';
import type { MutualGuild } from '@/types/discord';

interface ServerSelectorProps {
  className?: string;
}

function formatServerCount(count: number, label: string): string {
  return `${count} ${label}${count === 1 ? '' : 's'}`;
}

/** Compact guild icon + name row used in both sections of the dropdown. */
function GuildRow({ guild }: { guild: MutualGuild }) {
  return (
    <>
      {guild.icon ? (
        <Image
          src={getGuildIconUrl(guild.id, guild.icon, 64) ?? ''}
          alt={guild.name}
          width={20}
          height={20}
          className="rounded-full shrink-0"
        />
      ) : (
        <Server className="h-4 w-4 shrink-0" />
      )}
      <span className="truncate text-sm">{guild.name}</span>
    </>
  );
}

export function ServerSelector({ className }: ServerSelectorProps) {
  const [guilds, setGuilds] = useState<MutualGuild[]>([]);
  const [selectedGuild, setSelectedGuild] = useState<MutualGuild | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Split guilds into manageable (mod/admin/owner) and member-only (viewer)
  const { manageable, memberOnly } = useMemo(
    () => ({
      manageable: guilds.filter(isGuildManageable),
      memberOnly: guilds.filter((g) => !isGuildManageable(g)),
    }),
    [guilds],
  );
  const accessSummary =
    manageable.length === 0
      ? memberOnly.length > 0
        ? `${formatServerCount(memberOnly.length, 'view-only community')}`
        : 'No server access yet'
      : memberOnly.length > 0
        ? `${formatServerCount(manageable.length, 'manageable server')} • ${formatServerCount(memberOnly.length, 'view-only community')}`
        : `${formatServerCount(manageable.length, 'manageable server')}`;

  // Persist selected guild to localStorage
  const selectGuild = useCallback((guild: MutualGuild) => {
    setSelectedGuild(guild);
    try {
      localStorage.setItem(SELECTED_GUILD_KEY, guild.id);
    } catch {
      // localStorage may be unavailable (e.g. incognito)
    }
    broadcastSelectedGuild(guild.id);
  }, []);

  const loadGuilds = useCallback(async () => {
    // Abort any previous in-flight request before starting a new one.
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(false);
    try {
      const response = await fetch('/api/guilds', { signal: controller.signal });
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!response.ok) throw new Error('Failed to fetch');
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw new Error('Invalid response: expected array');

      // Runtime shape check — permissions and owner required for isGuildManageable
      const fetchedGuilds = data.filter(
        (g): g is MutualGuild =>
          typeof g === 'object' &&
          g !== null &&
          typeof (g as Record<string, unknown>).id === 'string' &&
          typeof (g as Record<string, unknown>).name === 'string' &&
          typeof (g as Record<string, unknown>).permissions === 'string' &&
          typeof (g as Record<string, unknown>).owner === 'boolean',
      );
      setGuilds(fetchedGuilds);

      // Only manageable guilds can be selected as the active dashboard guild
      const manageableGuilds = fetchedGuilds.filter(isGuildManageable);

      // Restore previously selected guild from localStorage (must be manageable)
      let restored = false;
      try {
        const savedId = localStorage.getItem(SELECTED_GUILD_KEY);
        if (savedId) {
          const saved = manageableGuilds.find((g) => g.id === savedId);
          if (saved) {
            setSelectedGuild(saved);
            restored = true;
          }
        }
      } catch {
        // localStorage unavailable
      }

      if (!restored && manageableGuilds.length > 0) {
        selectGuild(manageableGuilds[0]);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(true);
    } finally {
      if (abortControllerRef.current === controller) {
        setLoading(false);
      }
    }
  }, [selectGuild]);

  useEffect(() => {
    loadGuilds();
    return () => abortControllerRef.current?.abort();
  }, [loadGuilds]);

  if (loading) {
    return (
      <div className="dashboard-chip flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground">
        <Server className="h-4 w-4 animate-pulse" />
        <span>Loading workspaces...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-chip flex flex-col items-start gap-2 rounded-xl px-3 py-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Couldn&apos;t load workspaces</span>
        <span className="text-xs text-muted-foreground">
          Refresh the list and we&apos;ll try again.
        </span>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => loadGuilds()}>
          <RefreshCw className="h-3 w-3" />
          Retry
        </Button>
      </div>
    );
  }

  if (guilds.length === 0) {
    const inviteUrl = getBotInviteUrl();
    return (
      <div className="dashboard-chip flex flex-col items-start gap-2 rounded-xl px-3 py-3 text-sm text-muted-foreground">
        <Bot className="h-5 w-5" />
        <span className="font-medium text-foreground">No shared servers yet</span>
        <span className="text-xs">Volvox.Bot isn&apos;t in any of your Discord servers yet.</span>
        {inviteUrl ? (
          <a href={inviteUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="discord" size="sm" className="gap-1">
              <Bot className="h-3 w-3" />
              Invite Volvox.Bot
            </Button>
          </a>
        ) : (
          <span className="text-xs">
            Ask a server admin to add the bot, or check that{' '}
            <code className="text-[0.7rem]">NEXT_PUBLIC_DISCORD_CLIENT_ID</code> is set for the
            invite link.
          </span>
        )}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'h-auto min-h-[3.85rem] w-full justify-between py-2.5',
            'rounded-xl border-border/70',
            'bg-card/80',
            'px-3 shadow-sm',
            className,
          )}
        >
          <div className="flex min-w-0 items-center gap-2 truncate">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background">
              {selectedGuild?.icon ? (
                <Image
                  src={getGuildIconUrl(selectedGuild.id, selectedGuild.icon, 64) ?? ''}
                  alt={selectedGuild.name}
                  width={20}
                  height={20}
                  className="rounded-full"
                />
              ) : (
                <Server className="h-4 w-4 shrink-0" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                Active server
              </span>
              <span className="block truncate text-sm font-medium leading-tight">
                {manageable.length === 0
                  ? 'No manageable servers'
                  : (selectedGuild?.name ?? 'Select server')}
              </span>
              <span className="block truncate text-xs text-muted-foreground">{accessSummary}</span>
            </span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-80 rounded-xl border-border/70 bg-popover p-1.5"
        align="start"
      >
        {/* ── Manageable servers (mod / admin / owner) ── */}
        {manageable.length > 0 ? (
          <>
            <DropdownMenuLabel className="px-2 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Workspace access
              <span className="mt-1 block normal-case tracking-normal text-xs font-normal text-muted-foreground/80">
                {accessSummary}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {manageable.map((guild) => (
              <DropdownMenuItem
                key={guild.id}
                onClick={() => {
                  if (selectedGuild?.id === guild.id) return;
                  selectGuild(guild);
                }}
                className="flex items-center gap-2 rounded-lg py-2"
              >
                <GuildRow guild={guild} />
              </DropdownMenuItem>
            ))}
          </>
        ) : (
          <div className="px-2 py-3 text-center text-xs text-muted-foreground">
            <Server className="mx-auto mb-1 h-4 w-4" />
            You need admin permissions to manage a server.
          </div>
        )}

        {/* ── Member-only servers ── */}
        {memberOnly.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex items-center gap-1 px-2 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              View only
            </DropdownMenuLabel>
            {memberOnly.map((guild) => (
              <DropdownMenuItem key={guild.id} asChild>
                <Link
                  href={`/community/${guild.id}`}
                  className="flex items-center gap-2 rounded-lg py-2 text-muted-foreground"
                >
                  <GuildRow guild={guild} />
                  <ExternalLink className="ml-auto h-3 w-3 shrink-0 opacity-50" />
                </Link>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
