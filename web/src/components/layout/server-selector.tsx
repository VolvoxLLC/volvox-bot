'use client';

import { Bot, ChevronsUpDown, RefreshCw, Server } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDashboardGuild } from '@/contexts/dashboard-guild-context';
import { getBotInviteUrl, getGuildIconUrl } from '@/lib/discord';
import { cn } from '@/lib/utils';

interface ServerSelectorProps {
  className?: string;
}

export function ServerSelector({ className }: ServerSelectorProps) {
  const { guilds, selectedGuild, selectGuild, loadGuilds, loading, error } = useDashboardGuild();

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
        <Server className="h-4 w-4 animate-pulse" />
        <span>Loading servers...</span>
      </div>
    );
  }

  // Error state — allow retry
  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
        <span>Failed to load servers</span>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => loadGuilds()}>
          <RefreshCw className="h-3 w-3" />
          Retry
        </Button>
      </div>
    );
  }

  // Empty state — distinguish between "no mutual servers" and "no guilds at all"
  if (guilds.length === 0) {
    const inviteUrl = getBotInviteUrl();
    return (
      <div className="flex flex-col items-center gap-2 px-3 py-2 text-sm text-muted-foreground text-center">
        <Bot className="h-5 w-5" />
        <span className="font-medium">No mutual servers</span>
        <span className="text-xs">Bill Bot isn&apos;t in any of your Discord servers yet.</span>
        {inviteUrl ? (
          <a href={inviteUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="discord" size="sm" className="gap-1">
              <Bot className="h-3 w-3" />
              Invite Bill Bot
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
        <Button variant="outline" className={cn('w-full justify-between', className)}>
          <div className="flex items-center gap-2 truncate">
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
            <span className="truncate">{selectedGuild?.name ?? 'Select server'}</span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start">
        <DropdownMenuLabel>Your Servers</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {guilds.map((guild) => (
          <DropdownMenuItem
            key={guild.id}
            onClick={() => {
              if (selectedGuild?.id !== guild.id) selectGuild(guild);
            }}
            className="flex items-center gap-2"
          >
            {guild.icon ? (
              <Image
                src={getGuildIconUrl(guild.id, guild.icon, 64) ?? ''}
                alt={guild.name}
                width={20}
                height={20}
                className="rounded-full"
              />
            ) : (
              <Server className="h-4 w-4 shrink-0" />
            )}
            <span className="truncate">{guild.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
