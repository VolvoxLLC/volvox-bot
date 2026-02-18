"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import { ChevronsUpDown, Server, RefreshCw, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MutualGuild } from "@/types/discord";
import { getBotInviteUrl, getGuildIconUrl } from "@/lib/discord";
import {
  broadcastSelectedGuild,
  SELECTED_GUILD_KEY,
} from "@/lib/guild-selection";
import { cn } from "@/lib/utils";

interface ServerSelectorProps {
  className?: string;
}

export function ServerSelector({ className }: ServerSelectorProps) {
  const [guilds, setGuilds] = useState<MutualGuild[]>([]);
  const [selectedGuild, setSelectedGuild] = useState<MutualGuild | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Persist selected guild to localStorage
  const selectGuild = (guild: MutualGuild) => {
    setSelectedGuild(guild);
    try {
      localStorage.setItem(SELECTED_GUILD_KEY, guild.id);
    } catch {
      // localStorage may be unavailable (e.g. incognito)
    }
    broadcastSelectedGuild(guild.id);
  };

  const loadGuilds = useCallback(async () => {
    // Abort any previous in-flight request before starting a new one.
    // Always uses the ref-based controller so both the initial mount
    // and retry button share a single cancellation path.
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(false);
    try {
      const response = await fetch("/api/guilds", { signal: controller.signal });
      if (response.status === 401) {
        // Auth failure — redirect to login instead of showing a misleading retry
        window.location.href = "/login";
        return;
      }
      if (!response.ok) throw new Error("Failed to fetch");
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw new Error("Invalid response: expected array");
      const fetchedGuilds = data as MutualGuild[];
      setGuilds(fetchedGuilds);

      // Restore previously selected guild from localStorage
      let restored = false;
      try {
        const savedId = localStorage.getItem(SELECTED_GUILD_KEY);
        if (savedId) {
          const saved = data.find((g: MutualGuild) => g.id === savedId);
          if (saved) {
            setSelectedGuild(saved);
            broadcastSelectedGuild(saved.id);
            restored = true;
          }
        }
      } catch {
        // localStorage unavailable
      }

      if (!restored && data.length > 0) {
        selectGuild(data[0]);
      }
    } catch (err) {
      // Don't treat aborted fetches as errors
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(true);
    } finally {
      // Only reset loading if this request is still the current one.
      // When loadGuilds is called again (e.g. retry), the previous request
      // is aborted and a new controller replaces the ref. Without this
      // guard the aborted request's finally block would set loading=false,
      // cancelling out the new request's loading=true.
      if (abortControllerRef.current === controller) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadGuilds();
    return () => abortControllerRef.current?.abort();
  }, [loadGuilds]);

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
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => loadGuilds()}
        >
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
        <span className="text-xs">
          Bill Bot isn&apos;t in any of your Discord servers yet.
        </span>
        {inviteUrl ? (
          <a href={inviteUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="discord" size="sm" className="gap-1">
              <Bot className="h-3 w-3" />
              Invite Bill Bot
            </Button>
          </a>
        ) : (
          <span className="text-xs">
            Ask a server admin to add the bot, or check that{" "}
            <code className="text-[0.7rem]">NEXT_PUBLIC_DISCORD_CLIENT_ID</code>{" "}
            is set for the invite link.
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
          className={cn("w-full justify-between", className)}
        >
          <div className="flex items-center gap-2 truncate">
            {selectedGuild?.icon ? (
              <Image
                src={getGuildIconUrl(selectedGuild.id, selectedGuild.icon, 64)!}
                alt={selectedGuild.name}
                width={20}
                height={20}
                className="rounded-full"
              />
            ) : (
              <Server className="h-4 w-4 shrink-0" />
            )}
            <span className="truncate">
              {selectedGuild?.name ?? "Select server"}
            </span>
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
            onClick={() => selectGuild(guild)}
            className="flex items-center gap-2"
          >
            {guild.icon ? (
              <Image
                src={getGuildIconUrl(guild.id, guild.icon, 64)!}
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
