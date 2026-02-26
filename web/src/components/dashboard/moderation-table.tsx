"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ACTION_META } from "./moderation-types";
import type { ModCase, ModAction } from "./moderation-types";

function ActionBadge({ action }: { action: ModAction }) {
  const meta = ACTION_META[action];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${meta?.badge ?? "bg-muted text-muted-foreground border-muted"}`}
    >
      {meta?.label ?? action}
    </span>
  );
}

function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

interface ModerationTableProps {
  cases: ModCase[];
  total: number;
  page: number;
  pages: number;
  loading: boolean;
  onPageChange: (page: number) => void;
  onUserClick?: (userId: string, tag: string) => void;
}

export function ModerationTable({
  cases,
  total,
  page,
  pages,
  loading,
  onPageChange,
  onUserClick,
}: ModerationTableProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">#</TableHead>
              <TableHead className="w-[110px]">Action</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Moderator</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="w-[160px]">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : cases.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No cases found.
                </TableCell>
              </TableRow>
            ) : (
              cases.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {c.case_number}
                  </TableCell>
                  <TableCell>
                    <ActionBadge action={c.action} />
                  </TableCell>
                  <TableCell>
                    {onUserClick ? (
                      <button
                        type="button"
                        onClick={() => onUserClick(c.target_id, c.target_tag)}
                        className="text-left hover:underline focus:outline-none focus:ring-1 focus:ring-ring rounded"
                      >
                        <span className="text-sm font-medium">{c.target_tag}</span>
                        <br />
                        <span className="font-mono text-xs text-muted-foreground">
                          {c.target_id}
                        </span>
                      </button>
                    ) : (
                      <>
                        <span className="text-sm font-medium">{c.target_tag}</span>
                        <br />
                        <span className="font-mono text-xs text-muted-foreground">
                          {c.target_id}
                        </span>
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{c.moderator_tag}</span>
                    <br />
                    <span className="font-mono text-xs text-muted-foreground">
                      {c.moderator_id}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="max-w-[280px] truncate text-sm text-muted-foreground block">
                      {c.reason ?? <span className="italic opacity-60">No reason</span>}
                    </span>
                    {c.duration && (
                      <span className="text-xs text-muted-foreground">
                        Duration: {c.duration}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatTimestamp(c.created_at)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loading ? (
            <Skeleton className="h-4 w-40 inline-block" />
          ) : (
            <>
              {total === 0
                ? "No results"
                : `Showing page ${page} of ${pages} (${total} total)`}
            </>
          )}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={loading || page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || page >= pages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
