'use client';

import {
  Check,
  ChevronsUpDown,
  Hash,
  Headphones,
  Loader2,
  Megaphone,
  StickyNote,
  Text,
  Video,
  X,
} from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface DiscordChannel {
  id: string;
  name: string;
  type: number;
}

// Discord channel types
const CHANNEL_TYPES = {
  GUILD_TEXT: 0,
  DM: 1,
  GUILD_VOICE: 2,
  GROUP_DM: 3,
  GUILD_CATEGORY: 4,
  GUILD_ANNOUNCEMENT: 5,
  ANNOUNCEMENT_THREAD: 10,
  PUBLIC_THREAD: 11,
  PRIVATE_THREAD: 12,
  GUILD_STAGE_VOICE: 13,
  GUILD_DIRECTORY: 14,
  GUILD_FORUM: 15,
  GUILD_MEDIA: 16,
} as const;

type ChannelTypeFilter = 'all' | 'text' | 'voice' | 'announcement' | 'thread' | 'forum';

interface ChannelSelectorProps {
  guildId: string;
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  maxSelections?: number;
  filter?: ChannelTypeFilter;
}

function getChannelIcon(type: number) {
  switch (type) {
    case CHANNEL_TYPES.GUILD_TEXT:
      return <Hash className="h-4 w-4" />;
    case CHANNEL_TYPES.GUILD_VOICE:
      return <Headphones className="h-4 w-4" />;
    case CHANNEL_TYPES.GUILD_ANNOUNCEMENT:
      return <Megaphone className="h-4 w-4" />;
    case CHANNEL_TYPES.ANNOUNCEMENT_THREAD:
    case CHANNEL_TYPES.PUBLIC_THREAD:
    case CHANNEL_TYPES.PRIVATE_THREAD:
      return <Text className="h-4 w-4" />;
    case CHANNEL_TYPES.GUILD_STAGE_VOICE:
      return <Video className="h-4 w-4" />;
    case CHANNEL_TYPES.GUILD_FORUM:
    case CHANNEL_TYPES.GUILD_MEDIA:
      return <StickyNote className="h-4 w-4" />;
    case CHANNEL_TYPES.GUILD_CATEGORY:
      return null;
    default:
      return <Hash className="h-4 w-4" />;
  }
}

function getChannelTypeLabel(type: number): string {
  switch (type) {
    case CHANNEL_TYPES.GUILD_TEXT:
      return 'Text';
    case CHANNEL_TYPES.GUILD_VOICE:
      return 'Voice';
    case CHANNEL_TYPES.GUILD_CATEGORY:
      return 'Category';
    case CHANNEL_TYPES.GUILD_ANNOUNCEMENT:
      return 'Announcement';
    case CHANNEL_TYPES.ANNOUNCEMENT_THREAD:
      return 'Thread';
    case CHANNEL_TYPES.PUBLIC_THREAD:
      return 'Thread';
    case CHANNEL_TYPES.PRIVATE_THREAD:
      return 'Private Thread';
    case CHANNEL_TYPES.GUILD_STAGE_VOICE:
      return 'Stage';
    case CHANNEL_TYPES.GUILD_FORUM:
      return 'Forum';
    case CHANNEL_TYPES.GUILD_MEDIA:
      return 'Media';
    default:
      return 'Channel';
  }
}

function filterChannelsByType(
  channels: DiscordChannel[],
  filter: ChannelTypeFilter,
): DiscordChannel[] {
  if (filter === 'all') return channels;

  return channels.filter((channel) => {
    switch (filter) {
      case 'text':
        return channel.type === CHANNEL_TYPES.GUILD_TEXT;
      case 'voice':
        return (
          channel.type === CHANNEL_TYPES.GUILD_VOICE ||
          channel.type === CHANNEL_TYPES.GUILD_STAGE_VOICE
        );
      case 'announcement':
        return channel.type === CHANNEL_TYPES.GUILD_ANNOUNCEMENT;
      case 'thread':
        return (
          channel.type === CHANNEL_TYPES.ANNOUNCEMENT_THREAD ||
          channel.type === CHANNEL_TYPES.PUBLIC_THREAD ||
          channel.type === CHANNEL_TYPES.PRIVATE_THREAD
        );
      case 'forum':
        return (
          channel.type === CHANNEL_TYPES.GUILD_FORUM || channel.type === CHANNEL_TYPES.GUILD_MEDIA
        );
      default:
        return true;
    }
  });
}

export function ChannelSelector({
  guildId,
  selected,
  onChange,
  placeholder = 'Select channels...',
  disabled = false,
  className,
  maxSelections,
  filter = 'all',
}: ChannelSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [channels, setChannels] = React.useState<DiscordChannel[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    if (!guildId || !open) return;

    async function fetchChannels() {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoading(true);
      setError(null);
      setChannels([]);

      try {
        const response = await fetch(`/api/guilds/${encodeURIComponent(guildId)}/channels`, {
          signal: controller.signal,
        });

        if (response.status === 401) {
          window.location.href = '/login';
          return;
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch channels: ${response.statusText}`);
        }

        const data: unknown = await response.json();

        if (!Array.isArray(data)) {
          throw new Error('Invalid response: expected array');
        }

        const fetchedChannels = data.filter(
          (c): c is DiscordChannel =>
            typeof c === 'object' &&
            c !== null &&
            typeof (c as Record<string, unknown>).id === 'string' &&
            typeof (c as Record<string, unknown>).name === 'string' &&
            typeof (c as Record<string, unknown>).type === 'number',
        );

        const sortedChannels = fetchedChannels.sort((a, b) => {
          if (a.type === CHANNEL_TYPES.GUILD_CATEGORY && b.type !== CHANNEL_TYPES.GUILD_CATEGORY)
            return 1;
          if (b.type === CHANNEL_TYPES.GUILD_CATEGORY && a.type !== CHANNEL_TYPES.GUILD_CATEGORY)
            return -1;
          return a.name.localeCompare(b.name);
        });

        setChannels(sortedChannels);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load channels');
      } finally {
        if (abortControllerRef.current === controller) {
          setLoading(false);
        }
      }
    }

    void fetchChannels();

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [guildId, open]);

  const filteredChannels = React.useMemo(
    () => filterChannelsByType(channels, filter),
    [channels, filter],
  );

  const toggleChannel = React.useCallback(
    (channelId: string) => {
      if (selected.includes(channelId)) {
        onChange(selected.filter((id) => id !== channelId));
      } else if (!maxSelections || selected.length < maxSelections) {
        onChange([...selected, channelId]);
      }
    },
    [selected, onChange, maxSelections],
  );

  const removeChannel = React.useCallback(
    (channelId: string) => {
      onChange(selected.filter((id) => id !== channelId));
    },
    [selected, onChange],
  );

  const selectedChannels = React.useMemo(
    () => channels.filter((channel) => selected.includes(channel.id)),
    [channels, selected],
  );

  const unknownSelectedIds = React.useMemo(
    () => selected.filter((id) => !channels.some((channel) => channel.id === id)),
    [channels, selected],
  );

  const atMaxSelection = maxSelections !== undefined && selected.length >= maxSelections;

  return (
    <div className={cn('space-y-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled || loading}
            className="w-full justify-between"
          >
            <span className="truncate">
              {selected.length > 0
                ? `${selected.length} channel${selected.length === 1 ? '' : 's'} selected`
                : placeholder}
            </span>
            {loading ? (
              <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-50" />
            ) : (
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0">
          <Command>
            <CommandInput placeholder="Search channels..." />
            <CommandList>
              <CommandEmpty>
                {loading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="ml-2">Loading...</span>
                  </div>
                ) : error ? (
                  <div className="text-destructive text-sm">{error}</div>
                ) : (
                  'No channels found.'
                )}
              </CommandEmpty>
              <CommandGroup>
                {filteredChannels.map((channel) => {
                  const isSelected = selected.includes(channel.id);
                  const isDisabled = !isSelected && atMaxSelection;
                  const isCategory = channel.type === CHANNEL_TYPES.GUILD_CATEGORY;
                  const icon = getChannelIcon(channel.type);

                  return (
                    <CommandItem
                      key={channel.id}
                      value={`${channel.name} ${getChannelTypeLabel(channel.type)}`}
                      onSelect={() => toggleChannel(channel.id)}
                      disabled={isDisabled || isCategory}
                      className={cn(
                        'flex items-center gap-2',
                        (isDisabled || isCategory) && 'cursor-not-allowed opacity-50',
                        isCategory && 'font-semibold bg-muted/50 mt-1',
                      )}
                    >
                      {icon && <span className="text-muted-foreground">{icon}</span>}
                      <span className="flex-1 truncate">{channel.name}</span>
                      {!isCategory && (
                        <Check
                          className={cn('h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')}
                        />
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {(selectedChannels.length > 0 || unknownSelectedIds.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {selectedChannels.map((channel) => {
            const icon = getChannelIcon(channel.type);
            return (
              <Badge key={channel.id} variant="secondary" className="flex items-center gap-1 pr-1">
                {icon && <span className="text-muted-foreground scale-75">{icon}</span>}
                <span className="truncate max-w-[150px]">#{channel.name}</span>
                <button
                  type="button"
                  onClick={() => removeChannel(channel.id)}
                  className="ml-1 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
                  disabled={disabled}
                  aria-label={`Remove #${channel.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
          {unknownSelectedIds.map((id) => (
            <Badge key={id} variant="secondary" className="flex items-center gap-1 pr-1">
              <span className="text-muted-foreground scale-75"><Hash className="h-4 w-4" /></span>
              <span className="truncate max-w-[150px]">#unknown-channel</span>
              <button
                type="button"
                onClick={() => removeChannel(id)}
                className="ml-1 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
                disabled={disabled}
                aria-label={`Remove unknown channel ${id}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {maxSelections !== undefined && (
        <p className="text-muted-foreground text-xs">
          {selected.length} of {maxSelections} maximum channels selected
        </p>
      )}
    </div>
  );
}

export { CHANNEL_TYPES, getChannelIcon, getChannelTypeLabel };
export type { ChannelTypeFilter };
