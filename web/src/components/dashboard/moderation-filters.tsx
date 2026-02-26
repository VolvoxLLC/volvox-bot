"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, X } from "lucide-react";
import type { ModAction } from "./moderation-types";
import { ACTION_META } from "./moderation-types";

const ALL_ACTIONS = Object.keys(ACTION_META) as ModAction[];

export interface ModerationFiltersState {
  action: ModAction | "";
  targetId: string;
}

interface ModerationFiltersProps {
  filters: ModerationFiltersState;
  userSearchInput: string;
  onFilterChange: (filters: ModerationFiltersState) => void;
  onUserSearchInput: (value: string) => void;
  onUserSearch: (userId: string) => void;
  onClearUserSearch: () => void;
  isUserSearch: boolean;
  disabled?: boolean;
}

export function ModerationFilters({
  filters,
  userSearchInput,
  onFilterChange,
  onUserSearchInput,
  onUserSearch,
  onClearUserSearch,
  isUserSearch,
  disabled = false,
}: ModerationFiltersProps) {
  function handleActionChange(value: string) {
    onFilterChange({
      ...filters,
      action: value === "all" ? "" : (value as ModAction),
    });
  }

  function handleTargetIdChange(e: React.ChangeEvent<HTMLInputElement>) {
    onFilterChange({ ...filters, targetId: e.target.value });
  }

  function handleUserSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = userSearchInput.trim();
    if (trimmed) onUserSearch(trimmed);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
      {/* Action type filter */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Action Type</label>
        <Select
          value={filters.action || "all"}
          onValueChange={handleActionChange}
          disabled={disabled || isUserSearch}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {ALL_ACTIONS.map((action) => (
              <SelectItem key={action} value={action}>
                {ACTION_META[action].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Target user ID filter (for case list) */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">
          Filter by Target ID
        </label>
        <Input
          placeholder="User ID…"
          value={filters.targetId}
          onChange={handleTargetIdChange}
          disabled={disabled || isUserSearch}
          className="w-[200px]"
        />
      </div>

      <div className="hidden sm:block w-px self-stretch bg-border" />

      {/* User history lookup */}
      <form onSubmit={handleUserSearchSubmit} className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">
          User History Lookup
        </label>
        <div className="flex gap-2">
          <Input
            placeholder="Search by user ID…"
            value={userSearchInput}
            onChange={(e) => onUserSearchInput(e.target.value)}
            disabled={disabled}
            className="w-[220px]"
          />
          <Button type="submit" size="sm" variant="secondary" disabled={disabled || !userSearchInput.trim()}>
            <Search className="h-4 w-4" />
          </Button>
          {isUserSearch && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onClearUserSearch}
              title="Clear user search"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        {isUserSearch && (
          <p className="text-xs text-muted-foreground">
            Showing full history for <span className="font-mono">{userSearchInput}</span>
          </p>
        )}
      </form>
    </div>
  );
}
