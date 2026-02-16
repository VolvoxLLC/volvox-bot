"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronsUpDown, Server } from "lucide-react";
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
import { getGuildIconUrl } from "@/lib/discord";

interface ServerSelectorProps {
  className?: string;
}

export function ServerSelector({ className }: ServerSelectorProps) {
  const [guilds, setGuilds] = useState<MutualGuild[]>([]);
  const [selectedGuild, setSelectedGuild] = useState<MutualGuild | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadGuilds() {
      try {
        const response = await fetch("/api/guilds");
        if (response.ok) {
          const data = await response.json();
          setGuilds(data);
          if (data.length > 0) {
            setSelectedGuild(data[0]);
          }
        }
      } catch {
        // Silently fail — guilds will be empty
      } finally {
        setLoading(false);
      }
    }
    loadGuilds();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
        <Server className="h-4 w-4 animate-pulse" />
        <span>Loading servers...</span>
      </div>
    );
  }

  if (guilds.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
        <Server className="h-4 w-4" />
        <span>No servers found</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={`w-full justify-between ${className ?? ""}`}
        >
          <div className="flex items-center gap-2 truncate">
            {selectedGuild?.icon ? (
              <Image
                src={getGuildIconUrl(selectedGuild.id, selectedGuild.icon, 64)}
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
            onClick={() => setSelectedGuild(guild)}
            className="flex items-center gap-2"
          >
            {guild.icon ? (
              <Image
                src={getGuildIconUrl(guild.id, guild.icon, 64)}
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
