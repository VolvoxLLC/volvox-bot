"use client";

import { Shield, ChevronsUpDown, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DiscordRole } from "@/types/discord";
import { cn } from "@/lib/utils";

interface SingleSelectProps {
  multiple?: false;
  value: string | null;
  onChange: (roleId: string | null) => void;
}

interface MultiSelectProps {
  multiple: true;
  value: string[];
  onChange: (roleIds: string[]) => void;
}

type RoleSelectorProps = (SingleSelectProps | MultiSelectProps) & {
  roles: DiscordRole[];
  placeholder?: string;
  className?: string;
};

function roleColorStyle(color: number): React.CSSProperties | undefined {
  if (color === 0) return undefined;
  return { backgroundColor: `#${color.toString(16).padStart(6, "0")}` };
}

function RoleDot({ color }: { color: number }) {
  return (
    <span
      className="h-3 w-3 shrink-0 rounded-full bg-muted-foreground"
      style={roleColorStyle(color)}
    />
  );
}

export function RoleSelector(props: RoleSelectorProps) {
  const { roles, placeholder = "Select role", className } = props;
  const isMulti = props.multiple === true;

  const selectedSet = new Set(
    isMulti ? props.value : props.value ? [props.value] : [],
  );

  function handleSelect(roleId: string) {
    if (isMulti) {
      const next = selectedSet.has(roleId)
        ? props.value.filter((id) => id !== roleId)
        : [...props.value, roleId];
      props.onChange(next);
    } else {
      props.onChange(roleId);
    }
  }

  function handleRemove(roleId: string) {
    if (isMulti) {
      props.onChange(props.value.filter((id) => id !== roleId));
    }
  }

  const selectedRoles = roles.filter((r) => selectedSet.has(r.id));
  const hasSelection = selectedRoles.length > 0;

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
                  <RoleDot color={selectedRoles[0].color} />
                  <span className="truncate">{selectedRoles[0].name}</span>
                </>
              ) : isMulti && hasSelection ? (
                <span className="truncate">
                  {selectedRoles.length} role{selectedRoles.length !== 1 ? "s" : ""} selected
                </span>
              ) : (
                <>
                  <Shield className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground">{placeholder}</span>
                </>
              )}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-60 w-56 overflow-y-auto" align="start">
          <DropdownMenuLabel>Roles</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {roles.length === 0 ? (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              No roles available
            </div>
          ) : (
            roles.map((role) => {
              const isSelected = selectedSet.has(role.id);
              return (
                <DropdownMenuItem
                  key={role.id}
                  onClick={(e) => {
                    if (isMulti) e.preventDefault();
                    handleSelect(role.id);
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
                  <RoleDot color={role.color} />
                  <span className="truncate">{role.name}</span>
                </DropdownMenuItem>
              );
            })
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Selected tags for multi-select */}
      {isMulti && selectedRoles.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedRoles.map((role) => (
            <span
              key={role.id}
              className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
            >
              <RoleDot color={role.color} />
              {role.name}
              <button
                type="button"
                onClick={() => handleRemove(role.id)}
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
