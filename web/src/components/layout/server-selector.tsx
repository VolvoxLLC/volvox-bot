'use client';

import { Bot, ChevronsUpDown, ExternalLink, RefreshCw, Server } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/material-dropdown-menu';
import { isGuildManageable } from '@/hooks/use-guild-role';
import { getBotInviteUrl, getGuildIconUrl } from '@/lib/discord';
import { broadcastSelectedGuild, SELECTED_GUILD_KEY } from '@/lib/guild-selection';
import { cn } from '@/lib/utils';
import type { MutualGuild } from '@/types/discord';
import { useGuildDirectory } from './guild-directory-context';

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
  const [selectedGuild, setSelectedGuild] = useState<MutualGuild | null>(null);
  const { error, guilds, loading, refreshGuilds } = useGuildDirectory();

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

  // Persist and broadcast selected guild through the shared selection bus.
  const selectGuild = useCallback((guild: MutualGuild) => {
    setSelectedGuild(guild);
    broadcastSelectedGuild(guild.id);
  }, []);

  useEffect(() => {
    if (manageable.length === 0) {
      setSelectedGuild(null);
      return;
    }

    const currentGuild = selectedGuild
      ? (manageable.find((guild) => guild.id === selectedGuild.id) ?? null)
      : null;

    if (currentGuild) {
      if (currentGuild !== selectedGuild) {
        setSelectedGuild(currentGuild);
      }
      return;
    }

    try {
      const savedGuildId = localStorage.getItem(SELECTED_GUILD_KEY);
      const restoredGuild = savedGuildId
        ? (manageable.find((guild) => guild.id === savedGuildId) ?? null)
        : null;

      if (restoredGuild) {
        setSelectedGuild(restoredGuild);
        return;
      }
    } catch {
      // localStorage may be unavailable (e.g. incognito)
    }

    selectGuild(manageable[0]);
  }, [manageable, selectGuild, selectedGuild]);

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
        <Button variant="outline" size="sm" className="gap-1" onClick={() => refreshGuilds()}>
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
    <div className="flex flex-col gap-4">
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            'group relative flex h-16 w-full items-center justify-start overflow-hidden px-2.5 transition-all text-left shadow-2xl',
            'rounded-[22px] border border-border/40 bg-card',
            'shadow-[inset_0_1px_1px_hsl(var(--background)/0.08),0_12px_24px_-8px_hsl(var(--background)/0.2)]',
            'before:absolute before:inset-0 before:bg-primary/5 before:opacity-0 before:transition-opacity hover:before:opacity-100',
            className,
          )}
        >
          <div className="relative z-10 flex min-w-0 flex-1 items-center gap-2.5 pr-10">
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-br from-foreground/15 to-foreground/5 shadow-sm p-[1px] transition-transform group-hover:scale-105 active:scale-95">
              <div className="flex h-full w-full items-center justify-center rounded-[13px] bg-background/50 backdrop-blur-md">
                {selectedGuild?.icon ? (
                  <Image
                    src={getGuildIconUrl(selectedGuild.id, selectedGuild.icon, 128) ?? ''}
                    alt={selectedGuild.name}
                    width={28}
                    height={28}
                    className="rounded-full shadow-inner"
                  />
                ) : (
                  <Server className="h-4 w-4 shrink-0 opacity-40" />
                )}
              </div>
            </div>
            <div className="flex min-w-0 flex-col py-0.5 text-left">
              <span className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground/40">
                Workspace
              </span>
              <span className="truncate text-[13px] font-black tracking-tight text-foreground/90">
                {manageable.length === 0 ? 'No Access' : (selectedGuild?.name ?? 'Select Hub')}
              </span>
            </div>
          </div>
          <div className="absolute right-1 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 shrink-0 items-center justify-center rounded-lg bg-muted/30 border border-border/40 transition-colors group-hover:bg-muted/50">
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-20 transition-opacity group-hover:opacity-60" />
          </div>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          className={cn(
            'w-80 rounded-[28px] p-2.5 backdrop-blur-3xl transition-all',
            'border-t border-border/40 bg-gradient-to-b from-popover/95 to-popover/60',
            'shadow-[inset_0_1px_1px_hsl(var(--foreground)/0.1),0_32px_64px_-16px_hsl(var(--foreground)/0.6)]',
          )}
          align="start"
          sideOffset={12}
        >
          {manageable.length > 0 ? (
            <>
              <DropdownMenuLabel className="px-4 pt-4 pb-2">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60">
                    Infrastructure hubs
                  </span>
                  <span className="text-[11px] font-bold text-muted-foreground/30">
                    {accessSummary}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="mx-2 mb-2 bg-border/20" />
              <div className="space-y-1.5">
                {manageable.map((guild) => (
                  <DropdownMenuItem
                    key={guild.id}
                    onClick={() => {
                      if (selectedGuild?.id === guild.id) return;
                      selectGuild(guild);
                    }}
                    className={cn(
                      'rounded-[20px] transition-all active:scale-[0.98]',
                      'border border-transparent select-none',
                      selectedGuild?.id === guild.id
                        ? 'bg-primary/10 border-primary/20 text-primary shadow-[inset_0_1px_1px_hsl(var(--foreground)/0.05)]'
                        : 'hover:bg-muted/40 hover:border-border/40 hover:shadow-[inset_0_1px_1px_hsl(var(--foreground)/0.05)]',
                    )}
                  >
                    <GuildRow guild={guild} />
                    {selectedGuild?.id === guild.id && (
                      <div className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 p-1 shadow-[0_0_16px_hsl(var(--primary)/0.4)]">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
                      </div>
                    )}
                  </DropdownMenuItem>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center px-6 py-12 text-center text-xs text-muted-foreground">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/30 shadow-inner ring-1 ring-border/40">
                <Server className="h-6 w-6 opacity-10" />
              </div>
              <span className="font-bold tracking-tight opacity-40">
                Administrative clearance required.
              </span>
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* ── Communities Section (Skeumorphic Card) ── */}
      {memberOnly.length > 0 && (
        <div className="mt-2 flex flex-col gap-2 rounded-2xl border border-border/30 bg-muted/10 p-1.5 shadow-inner">
          <div className="px-3 py-1.5">
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground/20">
              Community Hubs
            </p>
          </div>
          <div className="space-y-1">
            {memberOnly.map((guild) => (
              <Link
                key={guild.id}
                href={`/community/${guild.id}`}
                className="group flex items-center gap-3 rounded-[14px] border border-transparent px-3 py-2.5 text-sm transition-all hover:bg-muted/40 hover:border-border/20 hover:shadow-lg active:scale-[0.98]"
              >
                <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-b from-muted to-transparent p-[1px] shadow-sm transition-transform group-hover:scale-110">
                  <div className="flex h-full w-full items-center justify-center rounded-[7px] bg-background/60">
                    {guild.icon ? (
                      <Image
                        src={getGuildIconUrl(guild.id, guild.icon, 64) ?? ''}
                        alt={guild.name}
                        width={18}
                        height={18}
                        className="rounded-full opacity-50 grayscale transition-all group-hover:opacity-100 group-hover:grayscale-0"
                      />
                    ) : (
                      <Server className="h-3.5 w-3.5 shrink-0 opacity-20 group-hover:opacity-100" />
                    )}
                  </div>
                </div>
                <span className="truncate text-xs font-bold tracking-tight text-muted-foreground/40 transition-colors group-hover:text-foreground/90">
                  {guild.name}
                </span>
                <ExternalLink className="ml-auto h-3 w-3 shrink-0 opacity-0 transition-all group-hover:opacity-20" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
