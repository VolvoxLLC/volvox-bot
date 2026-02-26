"use client";

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Search, X } from "lucide-react";
import { useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CaseDetail } from "./case-detail";
import { ACTION_META } from "./moderation-types";
import type { ModCase, ModAction, CaseListResponse } from "./moderation-types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

function ActionBadge({ action }: { action: ModAction }) {
  const meta = ACTION_META[action];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
        meta?.badge ?? "bg-muted text-muted-foreground"
      }`}
    >
      {meta?.label ?? action}
    </span>
  );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────

interface FilterBarProps {
  actionFilter: string;
  userSearch: string;
  onActionChange: (val: string) => void;
  onUserSearchChange: (val: string) => void;
  onClear: () => void;
}

const ACTION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All actions" },
  ...Object.entries(ACTION_META).map(([value, meta]) => ({
    value,
    label: meta.label,
  })),
];

function FilterBar({
  actionFilter,
  userSearch,
  onActionChange,
  onUserSearchChange,
  onClear,
}: FilterBarProps) {
  const hasFilters = actionFilter !== "all" || userSearch.trim().length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Action filter */}
      <Select value={actionFilter} onValueChange={onActionChange}>
        <SelectTrigger className="h-8 w-[160px] text-xs">
          <SelectValue placeholder="All actions" />
        </SelectTrigger>
        <SelectContent>
          {ACTION_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* User search */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-8 w-[180px] pl-7 text-xs"
          placeholder="Search user..."
          value={userSearch}
          onChange={(e) => onUserSearchChange(e.target.value)}
        />
      </div>

      {/* Clear filters */}
      {hasFilters && (
        <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={onClear}>
          <X className="mr-1 h-3.5 w-3.5" />
          Clear
        </Button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface CaseTableProps {
  data: CaseListResponse | null;
  loading: boolean;
  error: string | null;
  page: number;
  sortDesc: boolean;
  actionFilter: string;
  userSearch: string;
  onPageChange: (page: number) => void;
  onSortToggle: () => void;
  onActionFilterChange: (val: string) => void;
  onUserSearchChange: (val: string) => void;
  onClearFilters: () => void;
}

export function CaseTable({
  data,
  loading,
  error,
  page,
  sortDesc,
  actionFilter,
  userSearch,
  onPageChange,
  onSortToggle,
  onActionFilterChange,
  onUserSearchChange,
  onClearFilters,
}: CaseTableProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const toggleExpand = useCallback((id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
      >
        <strong>Failed to load cases:</strong> {error}
      </div>
    );
  }

  const cases: ModCase[] = data?.cases ?? [];
  const totalPages = data?.pages ?? 1;
  const total = data?.total ?? 0;

  return (
    <div className="space-y-3">
      {/* Filters */}
      <FilterBar
        actionFilter={actionFilter}
        userSearch={userSearch}
        onActionChange={(val) => {
          onActionFilterChange(val);
          onPageChange(1);
        }}
        onUserSearchChange={(val) => {
          onUserSearchChange(val);
          onPageChange(1);
        }}
        onClear={onClearFilters}
      />

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Case #</TableHead>
              <TableHead className="w-28">Action</TableHead>
              <TableHead>Target</TableHead>
              <TableHead className="hidden md:table-cell">Moderator</TableHead>
              <TableHead className="hidden lg:table-cell">Reason</TableHead>
              <TableHead className="w-36">
                <button
                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                  onClick={onSortToggle}
                >
                  Date
                  {sortDesc ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronUp className="h-3.5 w-3.5" />
                  )}
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {[1, 2, 3, 4, 5, 6].map((j) => (
                    <TableCell key={j}>
                      <div className="h-4 animate-pulse rounded bg-muted" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : cases.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No cases found.
                </TableCell>
              </TableRow>
            ) : (
              cases.map((c) => (
                <>
                  <TableRow
                    key={c.id}
                    className="cursor-pointer"
                    onClick={() => toggleExpand(c.id)}
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      #{c.case_number}
                    </TableCell>
                    <TableCell>
                      <ActionBadge action={c.action} />
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate text-sm">
                      {c.target_tag}
                    </TableCell>
                    <TableCell className="hidden max-w-[140px] truncate text-sm md:table-cell">
                      {c.moderator_tag}
                    </TableCell>
                    <TableCell className="hidden max-w-[200px] truncate text-sm text-muted-foreground lg:table-cell">
                      {c.reason ?? <span className="italic">—</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(c.created_at)}
                    </TableCell>
                  </TableRow>

                  {expandedId === c.id && (
                    <TableRow key={`${c.id}-detail`}>
                      <TableCell colSpan={6} className="bg-muted/30 p-4">
                        <CaseDetail modCase={c} />
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{total} total cases</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2"
            disabled={page <= 1 || loading}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="tabular-nums">
            Page {page} of {totalPages || 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2"
            disabled={page >= totalPages || loading}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
