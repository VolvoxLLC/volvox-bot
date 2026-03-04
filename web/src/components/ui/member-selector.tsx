'use client';

import { Check, ChevronsUpDown, Loader2, User, X } from 'lucide-react';
import * as React from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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

interface GuildMember {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
}

interface MembersResponse {
  members: GuildMember[];
}

interface MemberSelectorProps {
  guildId: string;
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  maxSelections?: number;
  id?: string;
}

function getMemberLabel(member: GuildMember): string {
  return member.displayName?.trim() || member.username;
}

function isMembersResponse(data: unknown): data is MembersResponse {
  if (typeof data !== 'object' || data === null) return false;
  const maybe = data as { members?: unknown };
  if (!Array.isArray(maybe.members)) return false;

  return maybe.members.every(
    (member) =>
      typeof member === 'object' &&
      member !== null &&
      typeof (member as Record<string, unknown>).id === 'string' &&
      typeof (member as Record<string, unknown>).username === 'string',
  );
}

/**
 * Searchable multi-select picker for guild members.
 */
export function MemberSelector({
  guildId,
  selected,
  onChange,
  placeholder = 'Select members...',
  disabled = false,
  className,
  maxSelections,
  id,
}: MemberSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [members, setMembers] = React.useState<GuildMember[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = React.useState('');

  const searchDebounceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    if (searchDebounceTimerRef.current) {
      clearTimeout(searchDebounceTimerRef.current);
    }

    searchDebounceTimerRef.current = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 250);

    return () => {
      if (searchDebounceTimerRef.current) {
        clearTimeout(searchDebounceTimerRef.current);
      }
    };
  }, [searchQuery]);

  React.useEffect(() => {
    if (!guildId || !open) return;

    async function fetchMembers() {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          limit: '50',
          sort: 'xp',
          order: 'desc',
        });

        if (debouncedSearchQuery) {
          params.set('search', debouncedSearchQuery);
        }

        const response = await fetch(
          `/api/guilds/${encodeURIComponent(guildId)}/members?${params.toString()}`,
          { signal: controller.signal },
        );

        if (response.status === 401) {
          window.location.href = '/login';
          return;
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch members: ${response.statusText}`);
        }

        const data: unknown = await response.json();
        if (!isMembersResponse(data)) {
          throw new Error('Invalid members response');
        }

        if (abortControllerRef.current === controller) {
          setMembers(data.members);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (abortControllerRef.current === controller) {
          setError(err instanceof Error ? err.message : 'Failed to load members');
        }
      } finally {
        if (abortControllerRef.current === controller) {
          setLoading(false);
        }
      }
    }

    void fetchMembers();

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [guildId, open, debouncedSearchQuery]);

  const toggleMember = React.useCallback(
    (memberId: string) => {
      if (selected.includes(memberId)) {
        onChange(selected.filter((id) => id !== memberId));
      } else if (!maxSelections || selected.length < maxSelections) {
        onChange([...selected, memberId]);
      }
    },
    [selected, onChange, maxSelections],
  );

  const removeMember = React.useCallback(
    (memberId: string) => {
      onChange(selected.filter((id) => id !== memberId));
    },
    [selected, onChange],
  );

  const selectedMembers = React.useMemo(
    () => members.filter((member) => selected.includes(member.id)),
    [members, selected],
  );

  const unknownSelectedIds = React.useMemo(
    () => selected.filter((id) => !members.some((member) => member.id === id)),
    [members, selected],
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
            id={id}
          >
            <span className="truncate">
              {selected.length > 0
                ? `${selected.length} member${selected.length === 1 ? '' : 's'} selected`
                : placeholder}
            </span>
            {loading ? (
              <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-50" />
            ) : (
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[360px] p-0">
          <Command>
            <CommandInput
              placeholder="Search members..."
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
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
                  'No members found.'
                )}
              </CommandEmpty>
              <CommandGroup>
                {members.map((member) => {
                  const isSelected = selected.includes(member.id);
                  const isDisabled = !isSelected && atMaxSelection;
                  const label = getMemberLabel(member);

                  return (
                    <CommandItem
                      key={member.id}
                      value={`${label} ${member.username} ${member.id}`}
                      onSelect={() => toggleMember(member.id)}
                      disabled={isDisabled}
                      className={cn(
                        'flex items-center gap-2',
                        isDisabled && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={member.avatar ?? undefined} alt={label} />
                        <AvatarFallback className="text-[10px]">
                          {label.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{label}</p>
                        <p className="truncate text-xs text-muted-foreground">@{member.username}</p>
                      </div>
                      <Check className={cn('h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')} />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {(selectedMembers.length > 0 || unknownSelectedIds.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {selectedMembers.map((member) => {
            const label = getMemberLabel(member);
            return (
              <Badge key={member.id} variant="secondary" className="flex items-center gap-1 pr-1">
                <Avatar className="h-4 w-4">
                  <AvatarImage src={member.avatar ?? undefined} alt={label} />
                  <AvatarFallback className="text-[9px]">
                    {label.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="max-w-[160px] truncate">{label}</span>
                <button
                  type="button"
                  onClick={() => removeMember(member.id)}
                  className="ml-1 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
                  disabled={disabled}
                  aria-label={`Remove ${label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}

          {unknownSelectedIds.map((memberId) => (
            <Badge key={memberId} variant="secondary" className="flex items-center gap-1 pr-1">
              <User className="h-3 w-3" />
              <span className="max-w-[160px] truncate">Unknown member</span>
              <button
                type="button"
                onClick={() => removeMember(memberId)}
                className="ml-1 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
                disabled={disabled}
                aria-label={`Remove unknown member ${memberId}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {maxSelections !== undefined && (
        <p className="text-muted-foreground text-xs">
          {selected.length} of {maxSelections} maximum members selected
        </p>
      )}
    </div>
  );
}
