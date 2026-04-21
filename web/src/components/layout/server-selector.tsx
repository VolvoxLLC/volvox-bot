'use client';

import { Bot, ChevronsUpDown, ExternalLink, RefreshCw, Server } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/material-dropdown-menu';
import { canInviteBot, isGuildManageable } from '@/hooks/use-guild-role';
import { getBotInviteUrl, getGuildIconUrl } from '@/lib/discord';
import { broadcastSelectedGuild, SELECTED_GUILD_KEY } from '@/lib/guild-selection';
import { cn } from '@/lib/utils';
import type { MutualGuild } from '@/types/discord';
import { useGuildDirectory } from './guild-directory-context';

interface ServerSelectorProps {
  readonly className?: string;
  readonly onSelect?: () => void;
}

function formatServerCount(count: number, label: string): string {
  return `${count} ${label}${count === 1 ? '' : 's'}`;
}

function formatUnknownStatusCount(count: number): string {
  return count === 1 ? '1 status unknown' : `${count} statuses unknown`;
}

/** Compact guild icon + name row used in both sections of the dropdown. */
function GuildRow({ guild }: { readonly guild: MutualGuild }) {
  return (
    <>
      {guild.icon ? (
        <Image
          src={getGuildIconUrl(guild.id, guild.icon, 64) ?? ''}
          alt={guild.name}
          width={20}
          height={20}
          className="shrink-0 rounded-full"
        />
      ) : (
        <Server className="h-4 w-4 shrink-0" />
      )}
      <span className="truncate text-sm">{guild.name}</span>
    </>
  );
}

function SectionBadge({
  children,
  tone = 'default',
}: Readonly<{
  children: ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'muted';
}>) {
  const toneClassName =
    tone === 'success'
      ? 'border-primary/20 bg-primary/10 text-primary'
      : tone === 'warning'
        ? 'border-orange-500/25 bg-orange-500/10 text-orange-600 dark:text-orange-300'
        : tone === 'muted'
          ? 'border-border/40 bg-muted/30 text-muted-foreground'
          : 'border-border/30 bg-background/60 text-foreground/70';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em]',
        toneClassName,
      )}
    >
      {children}
    </span>
  );
}

function CategoryHeader({
  title,
  description,
  badge,
}: Readonly<{
  title: string;
  description: string;
  badge: ReactNode;
}>) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/50">
          {title}
        </span>
        <span className="text-[11px] font-bold text-muted-foreground/50">{description}</span>
      </div>
      <div className="shrink-0">{badge}</div>
    </div>
  );
}

function CategoryEmptyState({
  title,
  description,
}: Readonly<{
  title: string;
  description: string;
}>) {
  return (
    <div className="mx-2 rounded-[20px] border border-dashed border-border/40 bg-muted/20 px-4 py-3 text-left">
      <p className="text-xs font-semibold text-foreground/80">{title}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{description}</p>
    </div>
  );
}

function LoadingCategory({ title }: Readonly<{ title: string }>) {
  return (
    <div className="rounded-[18px] border border-border/40 bg-card/80 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/50">
          {title}
        </span>
        <div className="h-5 w-16 animate-pulse rounded-full bg-muted/50" />
      </div>
      <div className="space-y-2">
        <div className="h-11 animate-pulse rounded-[16px] bg-muted/40" />
        <div className="h-11 animate-pulse rounded-[16px] bg-muted/25" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Extracted section components (reduce cognitive complexity)          */
/* ------------------------------------------------------------------ */

function InfrastructureSection({
  infrastructure,
  selectedGuild,
  selectGuild,
  onSelect,
}: Readonly<{
  infrastructure: MutualGuild[];
  selectedGuild: MutualGuild | null;
  selectGuild: (guild: MutualGuild) => void;
  onSelect?: () => void;
}>) {
  return (
    <div className="space-y-1.5">
      {infrastructure.length > 0 ? (
        infrastructure.map((guild) => (
          <DropdownMenuItem
            key={guild.id}
            onSelect={() => {
              if (selectedGuild?.id === guild.id) {
                onSelect?.();
                return;
              }
              selectGuild(guild);
              onSelect?.();
            }}
            className={cn(
              'rounded-[20px] border border-transparent transition-all active:scale-[0.98]',
              'select-none',
              selectedGuild?.id === guild.id
                ? 'border-primary/20 bg-primary/10 text-primary shadow-[inset_0_1px_1px_hsl(var(--foreground)/0.05)]'
                : 'hover:border-border/40 hover:bg-muted/40 hover:shadow-[inset_0_1px_1px_hsl(var(--foreground)/0.05)]',
            )}
          >
            <GuildRow guild={guild} />
            <SectionBadge tone={guild.botPresent === undefined ? 'warning' : 'success'}>
              {guild.botPresent === undefined ? 'Status unknown' : 'Live'}
            </SectionBadge>
            {selectedGuild?.id === guild.id && (
              <div className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 p-1 shadow-[0_0_16px_hsl(var(--primary)/0.4)]">
                <div className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
              </div>
            )}
          </DropdownMenuItem>
        ))
      ) : (
        <CategoryEmptyState
          title="No dashboard hubs yet"
          description="Install Volvox.Bot in a server you manage to unlock the full dashboard here."
        />
      )}
    </div>
  );
}

function AddBotSection({ addBot }: Readonly<{ addBot: MutualGuild[] }>) {
  return (
    <div className="space-y-1.5">
      {addBot.length > 0 ? (
        addBot.map((guild) => {
          const inviteUrl = getBotInviteUrl(guild.id);

          return inviteUrl ? (
            <DropdownMenuItem
              key={guild.id}
              onClick={() => {
                window.open(inviteUrl, '_blank', 'noopener,noreferrer');
              }}
              onSelect={() => {
                window.open(inviteUrl, '_blank', 'noopener,noreferrer');
              }}
              className="rounded-[20px] border border-orange-500/20 bg-orange-500/5 px-4 py-3 shadow-[inset_0_1px_1px_hsl(var(--foreground)/0.05)] hover:border-orange-500/30 hover:bg-orange-500/10"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <GuildRow guild={guild} />
              </div>
              <span className="pointer-events-none inline-flex h-8 items-center gap-1 rounded-full bg-orange-500 px-3 text-sm font-medium text-white shadow-xs transition-colors">
                <Bot className="h-3 w-3" />
                Invite Bot
              </span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              key={guild.id}
              disabled
              className="rounded-[20px] border border-orange-500/20 bg-orange-500/5 px-4 py-3 opacity-100"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <GuildRow guild={guild} />
              </div>
              <SectionBadge tone="warning">Invite unavailable</SectionBadge>
            </DropdownMenuItem>
          );
        })
      ) : (
        <CategoryEmptyState
          title="Nothing waiting on an invite"
          description="Any server where you can add Volvox.Bot will show up here with a one-click invite flow."
        />
      )}
    </div>
  );
}

function CommunitySection({
  community,
  onSelect,
  onNavigate,
}: Readonly<{
  community: MutualGuild[];
  onSelect?: () => void;
  onNavigate: (path: string) => void;
}>) {
  return (
    <div className="space-y-1.5">
      {community.length > 0 ? (
        community.map((guild) => (
          <DropdownMenuItem
            key={guild.id}
            className="rounded-[20px] border border-transparent transition-all hover:border-border/40 hover:bg-muted/40 active:scale-[0.98]"
            onClick={() => {
              onNavigate(`/community/${guild.id}`);
              onSelect?.();
            }}
            onSelect={() => {
              onNavigate(`/community/${guild.id}`);
              onSelect?.();
            }}
          >
            <GuildRow guild={guild} />
            <SectionBadge tone="muted">
              {guild.botPresent === undefined ? 'Status unknown' : 'Read only'}
            </SectionBadge>
            <ExternalLink className="ml-auto h-3 w-3 shrink-0 opacity-20" />
          </DropdownMenuItem>
        ))
      ) : (
        <CategoryEmptyState
          title="No community hubs to browse"
          description="Only servers with public community data available appear here."
        />
      )}
    </div>
  );
}

export function ServerSelector({ className, onSelect }: ServerSelectorProps) {
  const router = useRouter();
  const [selectedGuild, setSelectedGuild] = useState<MutualGuild | null>(null);
  const { error, guilds, loading, refreshGuilds } = useGuildDirectory();

  const { addBot, community, infrastructure } = useMemo(() => {
    const infrastructureGuilds = guilds.filter(
      (guild) =>
        (guild.botPresent === true || guild.botPresent === undefined) && isGuildManageable(guild),
    );
    const addBotGuilds = guilds.filter(
      (guild) => guild.botPresent === false && canInviteBot(guild),
    );
    const infrastructureIds = new Set(infrastructureGuilds.map((guild) => guild.id));
    const addBotIds = new Set(addBotGuilds.map((guild) => guild.id));

    return {
      infrastructure: infrastructureGuilds,
      addBot: addBotGuilds,
      community: guilds.filter(
        (guild) => !infrastructureIds.has(guild.id) && !addBotIds.has(guild.id),
      ),
    };
  }, [guilds]);

  const accessSummary = useMemo(() => {
    const unknownInfrastructureCount = infrastructure.filter(
      (guild) => guild.botPresent === undefined,
    ).length;
    const summaryParts = [
      infrastructure.length > 0 ? formatServerCount(infrastructure.length, 'dashboard hub') : null,
      unknownInfrastructureCount > 0 ? formatUnknownStatusCount(unknownInfrastructureCount) : null,
      addBot.length > 0 ? formatServerCount(addBot.length, 'ready-to-add server') : null,
      community.length > 0 ? formatServerCount(community.length, 'community hub') : null,
    ].filter(Boolean);

    return summaryParts.length > 0 ? summaryParts.join(' • ') : 'No server access yet';
  }, [addBot, community, infrastructure]);

  const triggerEyebrow =
    infrastructure.length > 0 ? 'Workspace' : addBot.length > 0 ? 'Bot Setup' : 'Community';
  const triggerTitle =
    infrastructure.length > 0
      ? (selectedGuild?.name ?? 'Select Hub')
      : addBot.length > 0
        ? 'Invite Volvox.Bot'
        : community.length > 0
          ? 'Community Hubs'
          : 'No Access';

  const selectGuild = useCallback((guild: MutualGuild) => {
    setSelectedGuild(guild);
    broadcastSelectedGuild(guild.id);
  }, []);

  useEffect(() => {
    if (infrastructure.length === 0) {
      setSelectedGuild(null);
      return;
    }

    const currentGuild = selectedGuild
      ? (infrastructure.find((guild) => guild.id === selectedGuild.id) ?? null)
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
        ? (infrastructure.find((guild) => guild.id === savedGuildId) ?? null)
        : null;

      if (restoredGuild) {
        setSelectedGuild(restoredGuild);
        return;
      }
    } catch {
      // localStorage may be unavailable (e.g. incognito)
    }

    selectGuild(infrastructure[0]);
  }, [infrastructure, selectGuild, selectedGuild]);

  if (loading) {
    return (
      <div className="dashboard-chip flex min-w-0 flex-col gap-3 rounded-[22px] border border-border/40 bg-card p-3 text-sm shadow-2xl">
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Loading hub categories...</span>
        </div>
        <LoadingCategory title="Infrastructure Hubs" />
        <LoadingCategory title="Add Bot" />
        <LoadingCategory title="Community Hubs" />
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
            'group relative flex h-16 w-full items-center justify-start overflow-hidden px-2.5 text-left shadow-2xl transition-all',
            'rounded-[22px] border border-border/40 bg-card',
            'shadow-[inset_0_1px_1px_hsl(var(--background)/0.08),0_12px_24px_-8px_hsl(var(--background)/0.2)]',
            'before:absolute before:inset-0 before:bg-primary/5 before:opacity-0 before:transition-opacity hover:before:opacity-100',
            className,
          )}
        >
          <div className="relative z-10 flex min-w-0 flex-1 items-center gap-2.5 pr-10">
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-br from-foreground/15 to-foreground/5 p-[1px] shadow-sm transition-transform group-hover:scale-105 active:scale-95">
              <div className="flex h-full w-full items-center justify-center rounded-[13px] bg-background/50 backdrop-blur-md">
                {selectedGuild?.icon ? (
                  <Image
                    src={getGuildIconUrl(selectedGuild.id, selectedGuild.icon, 128) ?? ''}
                    alt={selectedGuild.name}
                    width={28}
                    height={28}
                    className="rounded-full shadow-inner"
                  />
                ) : addBot.length > 0 && infrastructure.length === 0 ? (
                  <Bot className="h-4 w-4 shrink-0 text-orange-500 dark:text-orange-300" />
                ) : (
                  <Server className="h-4 w-4 shrink-0 opacity-40" />
                )}
              </div>
            </div>
            <div className="flex min-w-0 flex-col py-0.5 text-left">
              <span className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground/40">
                {triggerEyebrow}
              </span>
              <span className="truncate text-[13px] font-black tracking-tight text-foreground/90">
                {triggerTitle}
              </span>
              <span className="truncate text-[11px] text-muted-foreground/60">{accessSummary}</span>
            </div>
          </div>
          <div className="absolute right-1 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 shrink-0 items-center justify-center rounded-lg border border-border/40 bg-muted/30 transition-colors group-hover:bg-muted/50">
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
          <DropdownMenuLabel className="px-4 pt-4 pb-2">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60">
                Server Directory
              </span>
              <span className="text-[11px] font-bold text-muted-foreground/40">
                {accessSummary}
              </span>
            </div>
          </DropdownMenuLabel>

          <CategoryHeader
            title="Infrastructure Hubs"
            description="Manageable servers with Volvox.Bot live or a temporarily unavailable status check."
            badge={<SectionBadge tone="success">Dashboard</SectionBadge>}
          />
          <InfrastructureSection
            infrastructure={infrastructure}
            selectedGuild={selectedGuild}
            selectGuild={selectGuild}
            onSelect={onSelect}
          />

          <DropdownMenuSeparator className="mx-2 my-3 bg-border/20" />
          <CategoryHeader
            title="Add Bot"
            description="Servers you can invite Volvox.Bot into right now."
            badge={<SectionBadge tone="warning">Invite</SectionBadge>}
          />
          <AddBotSection addBot={addBot} />

          <DropdownMenuSeparator className="mx-2 my-3 bg-border/20" />
          <CategoryHeader
            title="Community Hubs"
            description="Read-only spaces and servers without install access."
            badge={<SectionBadge tone="muted">Community</SectionBadge>}
          />
          <CommunitySection community={community} onSelect={onSelect} onNavigate={router.push} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
