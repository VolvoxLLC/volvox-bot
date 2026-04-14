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
import { inputClasses } from '@/components/dashboard/config-editor-utils';
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
const CHANNEL_LOADING_SKELETONS = [
  'channel-skeleton-1',
  'channel-skeleton-2',
  'channel-skeleton-3',
  'channel-skeleton-4',
  'channel-skeleton-5',
] as const;

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

type ChannelTypeFilter =
  | 'all'
  | 'text'
  | 'voice'
  | 'announcement'
  | 'thread'
  | 'forum'
  | 'category';

interface ChannelSelectorProps {
  guildId: string;
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  maxSelections?: number;
  filter?: ChannelTypeFilter;
  id?: string;
  /** Pre-fetched channel list — when provided, skips internal fetch */
  channels?: DiscordChannel[];
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
      case 'category':
        return channel.type === CHANNEL_TYPES.GUILD_CATEGORY;
      default:
        return true;
    }
  });
}

/**
 * Renders a searchable popover UI for selecting Discord channels from a guild.
 *
 * Displays a button that opens a searchable list of channels fetched from the provided guild.
 * Shows selected channels as removable badges, includes handling for unknown/removed channel IDs,
 * and respects an optional maximum selection limit and channel-type filter.
 *
 * @param guildId - ID of the guild whose channels will be fetched and listed
 * @param selected - Array of currently selected channel IDs
 * @param onChange - Callback invoked with the updated array of selected channel IDs
 * @param placeholder - Text shown when no channels are selected
 * @param disabled - When true, disables interaction with the selector and remove buttons
 * @param className - Additional class names applied to the root container
 * @param maxSelections - Optional maximum number of channels that can be selected
 * @param filter - Optional channel-type filter to limit which channels are shown
 * @returns A JSX element that renders the channel selector UI
 */
export function ChannelSelector({
  guildId,
  selected,
  onChange,
  placeholder = 'Select channels...',
  disabled = false,
  className,
  maxSelections,
  filter = 'all',
  id,
  channels: externalChannels,
}: ChannelSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [channels, setChannels] = React.useState<DiscordChannel[]>(externalChannels ?? []);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const hasFetchedRef = React.useRef(false);

  // Reset fetch state when guild changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-run on guild change
  React.useEffect(() => {
    hasFetchedRef.current = false;
  }, [guildId]);

  // Fetch channels when the popover opens, or eagerly on mount when there
  // are pre-selected IDs (so they display names instead of "unknown channel").
  React.useEffect(() => {
    if (!guildId) return;
    // Skip internal fetch when channels are provided externally
    if (externalChannels) {
      setChannels(externalChannels);
      hasFetchedRef.current = true;
      return;
    }
    const needsEagerFetch = selected.length > 0 && !hasFetchedRef.current;
    if (!open && !needsEagerFetch) return;

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

        if (abortControllerRef.current === controller) {
          setChannels(sortedChannels);
          hasFetchedRef.current = true;
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (abortControllerRef.current === controller) {
          setError(err instanceof Error ? err.message : 'Failed to load channels');
        }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selected.length triggers eager fetch once via hasFetchedRef
  }, [guildId, open, selected.length, externalChannels]);

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
            className={cn(
              inputClasses,
              'h-auto min-h-[42px] py-2 px-4 justify-between font-medium text-muted-foreground transition-all duration-500 hover:bg-muted/30 hover:text-foreground hover:border-border focus:ring-primary/20 group',
            )}
            id={id}
          >
            <div className="flex items-center gap-2 truncate">
              {selected.length > 0 ? (
                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-[10px] font-black text-primary border border-primary/20">
                  {selected.length}
                </div>
              ) : (
                <Hash className="h-4 w-4 text-muted-foreground/60 group-hover:text-primary/60 transition-colors" />
              )}
              <span className="truncate">
                {selected.length > 0
                  ? `${selected.length} channel${selected.length === 1 ? '' : 's'} selected`
                  : placeholder}
              </span>
            </div>
            {loading ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin opacity-40" />
            ) : (
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-40 group-hover:opacity-80 transition-opacity" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[320px] p-0 border-border bg-popover/95 backdrop-blur-xl shadow-2xl rounded-2xl overflow-hidden"
          align="start"
        >
          <Command className="bg-transparent">
            <CommandInput
              placeholder="Search channels..."
              className="h-12 border-none focus:ring-0 bg-transparent text-sm"
            />
            <CommandList className="max-h-[300px] scrollbar-thin scrollbar-thumb-primary/10 scrollbar-track-transparent">
              <CommandEmpty className="py-8 text-center">
                {loading ? (
                  <div className="flex flex-col gap-3 p-4">
                    {CHANNEL_LOADING_SKELETONS.map((skeletonId) => (
                      <div key={skeletonId} className="flex items-center gap-3 animate-pulse">
                        <div className="h-8 w-8 rounded-lg bg-muted/50" />
                        <div className="h-4 flex-1 rounded bg-muted/50" />
                      </div>
                    ))}
                  </div>
                ) : error ? (
                  <div className="text-destructive font-bold px-4">{error}</div>
                ) : (
                  <span className="text-muted-foreground text-xs font-medium uppercase tracking-widest">
                    No channels found
                  </span>
                )}
              </CommandEmpty>
              <CommandGroup className="p-2">
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
                        'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 cursor-pointer mb-1',
                        isSelected
                          ? 'bg-primary/10 text-primary shadow-[inset_0_0_12px_hsl(var(--primary)/0.1)] border border-primary/20'
                          : 'text-muted-foreground hover:bg-muted/10 border border-transparent',
                        (isDisabled || isCategory) && 'cursor-not-allowed opacity-40',
                        isCategory &&
                          'font-black uppercase tracking-[0.1em] text-[10px] text-muted-foreground bg-muted/20 mt-4 mb-2 border-border',
                      )}
                    >
                      {icon && (
                        <span
                          className={cn(
                            'shrink-0',
                            isSelected ? 'text-primary' : 'text-muted-foreground/60',
                          )}
                        >
                          {icon}
                        </span>
                      )}
                      <span className="flex-1 truncate font-medium">{channel.name}</span>
                      {!isCategory && (
                        <div
                          className={cn(
                            'w-4 h-4 rounded-full border transition-all duration-300 flex items-center justify-center',
                            isSelected ? 'bg-primary border-primary' : 'border-border',
                          )}
                        >
                          {isSelected && (
                            <Check
                              className="h-2.5 w-2.5 text-primary-foreground"
                              strokeWidth={4}
                            />
                          )}
                        </div>
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
        <div className="flex flex-wrap gap-2 pt-1">
          {selectedChannels.map((channel) => {
            const icon = getChannelIcon(channel.type);
            return (
              <Badge
                key={channel.id}
                className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg border border-border bg-muted/30 text-muted-foreground shadow-sm hover:bg-muted/50 transition-colors group/badge"
              >
                {icon && (
                  <span className="text-muted-foreground/60 group-hover/badge:text-primary/60 transition-colors">
                    {React.cloneElement(icon as React.ReactElement<{ className?: string }>, {
                      className: 'h-3 w-3',
                    })}
                  </span>
                )}
                <span className="text-[11px] font-bold tracking-tight">#{channel.name}</span>
                <button
                  type="button"
                  onClick={() => removeChannel(channel.id)}
                  className="ml-1 rounded-md p-1 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-all"
                  disabled={disabled}
                  aria-label={`Remove #${channel.name}`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            );
          })}
          {unknownSelectedIds.map((id) => (
            <Badge
              key={id}
              className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg border border-border bg-muted/30 text-muted-foreground group/badge"
            >
              <Hash className="h-3 w-3 text-muted-foreground/40 group-hover/badge:text-muted-foreground/60 transition-colors" />
              <span className="text-[11px] font-bold tracking-tight">#unknown</span>
              <button
                type="button"
                onClick={() => removeChannel(id)}
                className="ml-1 rounded-md p-1 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-all"
                disabled={disabled}
                aria-label={`Remove unknown channel ${id}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {maxSelections !== undefined && (
        <div className="flex items-center gap-2 px-1">
          <div className="h-1 flex-1 bg-muted/50 rounded-full overflow-hidden shadow-inner">
            <div
              className="h-full bg-primary/40 transition-all duration-500 shadow-[0_0_8px_hsl(var(--primary)/0.5)]"
              style={{ width: `${(selected.length / maxSelections) * 100}%` }}
            />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
            {selected.length} / {maxSelections}
          </p>
        </div>
      )}
    </div>
  );
}

export type { ChannelTypeFilter };
export { CHANNEL_TYPES, getChannelIcon, getChannelTypeLabel };
