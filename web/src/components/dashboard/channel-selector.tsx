"use client";

import { Hash, Volume2, ChevronsUpDown, Check, X } from "lucide-react";
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

interface SingleSelectProps {
  multiple?: false;
  value: string | null;
  onChange: (channelId: string | null) => void;
}

interface MultiSelectProps {
  multiple: true;
  value: string[];
  onChange: (channelIds: string[]) => void;
}

type ChannelSelectorProps = (SingleSelectProps | MultiSelectProps) & {
  channels: DiscordChannel[];
  placeholder?: string;
  className?: string;
};

function ChannelIcon({ type }: { type: number }) {
  if (VOICE_TYPES.has(type)) {
    return <Volume2 className="h-4 w-4 shrink-0 text-muted-foreground" />;
  }
  return <Hash className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

export function ChannelSelector(props: ChannelSelectorProps) {
  const { channels, placeholder = "Select channel", className } = props;
  const isMulti = props.multiple === true;

  const selectedSet = new Set(
    isMulti ? props.value : props.value ? [props.value] : [],
  );

  function handleSelect(channelId: string) {
    if (isMulti) {
      const next = selectedSet.has(channelId)
        ? props.value.filter((id) => id !== channelId)
        : [...props.value, channelId];
      props.onChange(next);
    } else {
      props.onChange(channelId);
    }
  }

  function handleRemove(channelId: string) {
    if (isMulti) {
      props.onChange(props.value.filter((id) => id !== channelId));
    }
  }

  // Build trigger label
  const selectedChannels = channels.filter((c) => selectedSet.has(c.id));
  const hasSelection = selectedChannels.length > 0;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between"
          >
            <span className="flex items-center gap-2 truncate">
              {!isMulti && hasSelection ? (
                <>
                  <ChannelIcon type={selectedChannels[0].type} />
                  <span className="truncate">{selectedChannels[0].name}</span>
                </>
              ) : isMulti && hasSelection ? (
                <span className="truncate">
                  {selectedChannels.length} channel{selectedChannels.length !== 1 ? "s" : ""} selected
                </span>
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
            channels.map((channel) => {
              const isSelected = selectedSet.has(channel.id);
              return (
                <DropdownMenuItem
                  key={channel.id}
                  onClick={(e) => {
                    if (isMulti) e.preventDefault();
                    handleSelect(channel.id);
                  }}
                  className="flex items-center gap-2"
                >
                  {isMulti && (
                    <Check
                      className={cn(
                        "h-4 w-4 shrink-0",
                        isSelected ? "opacity-100" : "opacity-0",
                      )}
                    />
                  )}
                  <ChannelIcon type={channel.type} />
                  <span className="truncate">{channel.name}</span>
                </DropdownMenuItem>
              );
            })
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Selected tags for multi-select */}
      {isMulti && selectedChannels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedChannels.map((ch) => (
            <span
              key={ch.id}
              className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
            >
              <ChannelIcon type={ch.type} />
              {ch.name}
              <button
                type="button"
                onClick={() => handleRemove(ch.id)}
                className="ml-0.5 rounded-sm hover:bg-accent hover:text-accent-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
