"use client";

import { Shield, ChevronsUpDown } from "lucide-react";
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

interface RoleSelectorProps {
  roles: DiscordRole[];
  value: string | null;
  onChange: (roleId: string | null) => void;
  placeholder?: string;
  className?: string;
}

function roleColorStyle(color: number): React.CSSProperties | undefined {
  if (color === 0) return undefined;
  return { backgroundColor: `#${color.toString(16).padStart(6, "0")}` };
}

export function RoleSelector({
  roles,
  value,
  onChange,
  placeholder = "Select role",
  className,
}: RoleSelectorProps) {
  const selected = roles.find((r) => r.id === value) ?? null;

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
                <span
                  className="h-3 w-3 shrink-0 rounded-full bg-muted-foreground"
                  style={roleColorStyle(selected.color)}
                />
                <span className="truncate">{selected.name}</span>
              </>
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
          roles.map((role) => (
            <DropdownMenuItem
              key={role.id}
              onClick={() => onChange(role.id)}
              className="flex items-center gap-2"
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full bg-muted-foreground"
                style={roleColorStyle(role.color)}
              />
              <span className="truncate">{role.name}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
