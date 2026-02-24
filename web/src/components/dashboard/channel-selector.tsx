"use client";

import { Hash, Volume2, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DiscordChannel } from "@/types/discord";
import { cn } from "@/lib/utils";

/** discord.js ChannelType numeric values we care about */
const VOICE_TYPES = new Set([2, 13]);

interface ChannelSelectorProps {
  channels: DiscordChannel[];
  value: string | null;
  onChange: (channelId: string | null) => void;
  placeholder?: string;
  className?: string;
}

function ChannelIcon({ type }: { type: number }) {
  if (VOICE_TYPES.has(type)) {
    return <Volume2 className="h-4 w-4 shrink-0 text-muted-foreground" />;
  }
  return <Hash className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

export function ChannelSelector({
  channels,
  value,
  onChange,
  placeholder = "Select channel",
  className,
}: ChannelSelectorProps) {
  const selected = channels.find((c) => c.id === value) ?? null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn("w-full justify-between", className)}
        >
          <span className="flex items-center gap-2 truncate">
            {selected ? (
              <>
                <ChannelIcon type={selected.type} />
                <span className="truncate">{selected.name}</span>
              </>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-60 w-56 overflow-y-auto" align="start">
        <DropdownMenuLabel>Channels</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {channels.length === 0 ? (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            No channels available
          </div>
        ) : (
          channels.map((channel) => (
            <DropdownMenuItem
              key={channel.id}
              onClick={() => onChange(channel.id)}
              className="flex items-center gap-2"
            >
              <ChannelIcon type={channel.type} />
              <span className="truncate">{channel.name}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
