'use client';

import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react';
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

export interface DiscordRole {
  id: string;
  name: string;
  color: number;
}

interface RoleSelectorProps {
  guildId: string;
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  maxSelections?: number;
}

function discordColorToHex(color: number): string | null {
  if (!color) return null;
  return `#${color.toString(16).padStart(6, '0')}`;
}

export function RoleSelector({
  guildId,
  selected,
  onChange,
  placeholder = 'Select roles...',
  disabled = false,
  className,
  maxSelections,
}: RoleSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [roles, setRoles] = React.useState<DiscordRole[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    if (!guildId || !open) return;

    async function fetchRoles() {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoading(true);
      setRoles([]);
      setError(null);

      try {
        const response = await fetch(`/api/guilds/${encodeURIComponent(guildId)}/roles`, {
          signal: controller.signal,
        });

        if (response.status === 401) {
          window.location.href = '/login';
          return;
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch roles: ${response.statusText}`);
        }

        const data: unknown = await response.json();

        if (!Array.isArray(data)) {
          throw new Error('Invalid response: expected array');
        }

        const fetchedRoles = data.filter(
          (r): r is DiscordRole =>
            typeof r === 'object' &&
            r !== null &&
            typeof (r as Record<string, unknown>).id === 'string' &&
            typeof (r as Record<string, unknown>).name === 'string' &&
            typeof (r as Record<string, unknown>).color === 'number',
        );

        setRoles(fetchedRoles);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load roles');
      } finally {
        if (abortControllerRef.current === controller) {
          setLoading(false);
        }
      }
    }

    void fetchRoles();

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [guildId, open]);

  const toggleRole = React.useCallback(
    (roleId: string) => {
      if (selected.includes(roleId)) {
        onChange(selected.filter((id) => id !== roleId));
      } else if (!maxSelections || selected.length < maxSelections) {
        onChange([...selected, roleId]);
      }
    },
    [selected, onChange, maxSelections],
  );

  const removeRole = React.useCallback(
    (roleId: string) => {
      onChange(selected.filter((id) => id !== roleId));
    },
    [selected, onChange],
  );

  const selectedRoles = React.useMemo(
    () => roles.filter((role) => selected.includes(role.id)),
    [roles, selected],
  );

  const unknownSelectedIds = React.useMemo(
    () => selected.filter((id) => !roles.some((role) => role.id === id)),
    [roles, selected],
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
                ? `${selected.length} role${selected.length === 1 ? '' : 's'} selected`
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
            <CommandInput placeholder="Search roles..." />
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
                  'No roles found.'
                )}
              </CommandEmpty>
              <CommandGroup>
                {roles.map((role) => {
                  const isSelected = selected.includes(role.id);
                  const isDisabled = !isSelected && atMaxSelection;
                  const colorHex = discordColorToHex(role.color);

                  return (
                    <CommandItem
                      key={role.id}
                      value={role.name}
                      onSelect={() => toggleRole(role.id)}
                      disabled={isDisabled}
                      className={cn(
                        'flex items-center gap-2',
                        isDisabled && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      <div
                        className="h-3 w-3 rounded-full border border-black/10"
                        style={{ backgroundColor: colorHex ?? '#99aab5' }}
                      />
                      <span className="flex-1 truncate">{role.name}</span>
                      <Check className={cn('h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')} />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {(selectedRoles.length > 0 || unknownSelectedIds.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {selectedRoles.map((role) => {
            const colorHex = discordColorToHex(role.color);
            return (
              <Badge
                key={role.id}
                variant="secondary"
                className="flex items-center gap-1 pr-1"
                style={
                  colorHex
                    ? {
                        backgroundColor: `${colorHex}20`,
                        borderColor: colorHex,
                        color: colorHex,
                      }
                    : undefined
                }
              >
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: colorHex ?? '#99aab5' }}
                />
                <span className="truncate max-w-[150px]">{role.name}</span>
                <button
                  type="button"
                  onClick={() => removeRole(role.id)}
                  className="ml-1 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
                  disabled={disabled}
                  aria-label={`Remove ${role.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
          {unknownSelectedIds.map((id) => (
            <Badge key={id} variant="secondary" className="flex items-center gap-1 pr-1">
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: '#99aab5' }}
              />
              <span className="truncate max-w-[150px]">Unknown role</span>
              <button
                type="button"
                onClick={() => removeRole(id)}
                className="ml-1 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
                disabled={disabled}
                aria-label={`Remove unknown role ${id}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {maxSelections !== undefined && (
        <p className="text-muted-foreground text-xs">
          {selected.length} of {maxSelections} maximum roles selected
        </p>
      )}
    </div>
  );
}
