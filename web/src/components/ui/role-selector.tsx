'use client';

import { Check, ChevronsUpDown, Loader2, Users, X } from 'lucide-react';
import * as React from 'react';
import { inputClasses } from '@/components/dashboard/config-editor-utils';
import { useGuildRoles } from '@/components/layout/role-directory-context';
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

export type { DiscordRole } from '@/types/discord';

const ROLE_LOADING_SKELETONS = [
  'role-skeleton-1',
  'role-skeleton-2',
  'role-skeleton-3',
  'role-skeleton-4',
] as const;

interface RoleSelectorProps {
  guildId: string;
  selected: string[];
  id?: string;
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

/**
 * Render a role selection UI for a guild, allowing users to search, select, and remove roles.
 *
 * @param guildId - The guild ID used to fetch available roles; when not provided no fetch is performed.
 * @param selected - Array of selected role IDs.
 * @param onChange - Callback invoked with the updated array of selected role IDs whenever the selection changes.
 * @param placeholder - Text shown in the trigger when no roles are selected.
 * @param disabled - When true, disables user interaction with the selector.
 * @param className - Optional additional CSS class names applied to the outer container.
 * @param maxSelections - Optional maximum number of roles that may be selected; further selections are prevented when reached.
 * @returns A React element that displays the role picker, selected role badges, and selection controls.
 */
export function RoleSelector({
  guildId,
  selected,
  onChange,
  placeholder = 'Select roles...',
  disabled = false,
  className,
  maxSelections,
  id,
}: RoleSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const { roles, loading, error } = useGuildRoles(guildId);

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
                <Users className="h-4 w-4 text-muted-foreground/60 group-hover:text-primary/60 transition-colors" />
              )}
              <span className="truncate">
                {selected.length > 0
                  ? `${selected.length} role${selected.length === 1 ? '' : 's'} selected`
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
              placeholder="Search roles..."
              className="h-12 border-none focus:ring-0 bg-transparent text-sm"
            />
            <CommandList className="max-h-[300px] scrollbar-thin scrollbar-thumb-primary/10 scrollbar-track-transparent">
              <CommandEmpty className="py-8 text-center">
                {loading ? (
                  <div className="flex flex-col gap-3 p-4">
                    {ROLE_LOADING_SKELETONS.map((skeletonId) => (
                      <div key={skeletonId} className="flex items-center gap-3 animate-pulse">
                        <div className="h-4 w-4 rounded-full bg-muted/50" />
                        <div className="h-4 flex-1 rounded bg-muted/50" />
                      </div>
                    ))}
                  </div>
                ) : error ? (
                  <div className="text-destructive font-bold px-4">{error}</div>
                ) : (
                  <span className="text-muted-foreground text-xs font-medium uppercase tracking-widest">
                    No roles found
                  </span>
                )}
              </CommandEmpty>
              <CommandGroup className="p-2">
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
                        'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 cursor-pointer mb-1',
                        isSelected
                          ? 'bg-primary/10 text-primary shadow-[inset_0_0_12px_hsl(var(--primary)/0.1)] border border-primary/20'
                          : 'text-muted-foreground hover:bg-muted/10 border border-transparent',
                        isDisabled && 'cursor-not-allowed opacity-40',
                      )}
                    >
                      <div
                        className="h-3 w-3 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)] border border-border/50"
                        style={{ backgroundColor: colorHex ?? '#99aab5' }}
                      />
                      <span className="flex-1 truncate font-medium">{role.name}</span>
                      <div
                        className={cn(
                          'w-4 h-4 rounded-full border transition-all duration-300 flex items-center justify-center',
                          isSelected ? 'bg-primary border-primary' : 'border-border',
                        )}
                      >
                        {isSelected && (
                          <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={4} />
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {(selectedRoles.length > 0 || unknownSelectedIds.length > 0) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {selectedRoles.map((role) => {
            const colorHex = discordColorToHex(role.color);
            return (
              <Badge
                key={role.id}
                className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg border border-border bg-muted/30 text-muted-foreground shadow-sm hover:bg-muted/50 transition-colors group/badge"
                style={
                  colorHex
                    ? {
                        backgroundColor: `${colorHex}15`,
                        borderColor: `${colorHex}40`,
                        color: colorHex,
                      }
                    : undefined
                }
              >
                <div
                  className="h-2 w-2 rounded-full shadow-[0_0_4px_rgba(0,0,0,0.3)]"
                  style={{ backgroundColor: colorHex ?? '#99aab5' }}
                />
                <span className="text-[11px] font-bold tracking-tight">{role.name}</span>
                <button
                  type="button"
                  onClick={() => removeRole(role.id)}
                  className="ml-1 rounded-md p-1 text-muted-foreground/60 hover:text-destructive hover:bg-muted/10 transition-all"
                  disabled={disabled}
                  aria-label={`Remove ${role.name}`}
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
              <div className="h-2 w-2 rounded-full bg-muted-foreground/40 shadow-[0_0_4px_rgba(0,0,0,0.3)]" />
              <span className="text-[11px] font-bold tracking-tight">Unknown</span>
              <button
                type="button"
                onClick={() => removeRole(id)}
                className="ml-1 rounded-md p-1 text-muted-foreground/60 hover:text-destructive hover:bg-muted/10 transition-all"
                disabled={disabled}
                aria-label={`Remove unknown role ${id}`}
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
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">
            {selected.length} / {maxSelections}
          </p>
        </div>
      )}
    </div>
  );
}
