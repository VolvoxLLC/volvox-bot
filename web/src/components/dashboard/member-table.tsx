'use client';

import { ChevronDown, ChevronUp, Loader2, Users } from 'lucide-react';
import Image from 'next/image';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Matches the enriched member shape returned by GET /:id/members */
export interface MemberRow {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  messages_sent: number;
  xp: number;
  level: number;
  warning_count: number;
  last_active: string | null;
  joinedAt: string | null;
}

/** API-supported sort columns. Client-only sorts (username, displayName) are excluded. */
export type SortColumn = 'messages' | 'xp' | 'warnings' | 'joined';

export type SortOrder = 'asc' | 'desc';

interface MemberTableProps {
  members: MemberRow[];
  onSort: (column: SortColumn) => void;
  sortColumn: SortColumn;
  sortOrder: SortOrder;
  onLoadMore: () => void;
  hasMore: boolean;
  loading: boolean;
  onRowClick: (userId: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatDateShort(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso));
}

// ─── Sort Header ──────────────────────────────────────────────────────────────

function SortableHead({
  column,
  label,
  currentColumn,
  currentOrder,
  onSort,
  className,
}: {
  column: SortColumn;
  label: string;
  currentColumn: SortColumn;
  currentOrder: SortOrder;
  onSort: (col: SortColumn) => void;
  className?: string;
}) {
  const isActive = column === currentColumn;
  return (
    <TableHead className={className}>
      <button
        className="flex items-center gap-1 hover:text-foreground transition-colors"
        onClick={() => onSort(column)}
        aria-label={`Sort by ${label}`}
      >
        {label}
        {isActive &&
          (currentOrder === 'desc' ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5" />
          ))}
      </button>
    </TableHead>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell>
            <Skeleton className="h-8 w-8 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-28" />
          </TableCell>
          <TableCell className="hidden md:table-cell">
            <Skeleton className="h-4 w-12" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-28" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-10" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-16" />
          </TableCell>
          <TableCell className="hidden md:table-cell">
            <Skeleton className="h-4 w-20" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

// ─── Keyboard handler for accessible rows ─────────────────────────────────────

function handleRowKeyDown(
  e: React.KeyboardEvent<HTMLTableRowElement>,
  userId: string,
  onClick: (id: string) => void,
) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    onClick(userId);
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function MemberTable({
  members,
  onSort,
  sortColumn,
  sortOrder,
  onLoadMore,
  hasMore,
  loading,
  onRowClick,
}: MemberTableProps) {
  const showEmpty = !loading && members.length === 0;

  return (
    <div className="space-y-3">
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12" />
              {/* Username & Display Name are not API-sortable, shown as plain headers */}
              <TableHead>Username</TableHead>
              <TableHead>Display Name</TableHead>
              <SortableHead
                column="messages"
                label="Messages"
                currentColumn={sortColumn}
                currentOrder={sortOrder}
                onSort={onSort}
                className="hidden md:table-cell"
              />
              <SortableHead
                column="xp"
                label="XP / Level"
                currentColumn={sortColumn}
                currentOrder={sortOrder}
                onSort={onSort}
              />
              <SortableHead
                column="warnings"
                label="Warnings"
                currentColumn={sortColumn}
                currentOrder={sortOrder}
                onSort={onSort}
              />
              <TableHead>Last Active</TableHead>
              <SortableHead
                column="joined"
                label="Joined"
                currentColumn={sortColumn}
                currentOrder={sortOrder}
                onSort={onSort}
                className="hidden md:table-cell"
              />
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading && members.length === 0 ? (
              <TableSkeleton />
            ) : showEmpty ? (
              <TableRow>
                <TableCell colSpan={8} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Users className="h-8 w-8" />
                    <p className="text-sm font-medium">No members found</p>
                    <p className="text-xs">Try adjusting your search or filters.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              members.map((m) => (
                <TableRow
                  key={m.id}
                  className="cursor-pointer"
                  tabIndex={0}
                  onClick={() => onRowClick(m.id)}
                  onKeyDown={(e) => handleRowKeyDown(e, m.id, onRowClick)}
                  role="link"
                  aria-label={`View details for ${m.displayName || m.username}`}
                >
                  {/* Avatar — backend returns full URL */}
                  <TableCell>
                    <Avatar className="h-8 w-8">
                      {m.avatar ? (
                        <Image
                          src={m.avatar}
                          alt={m.username}
                          width={32}
                          height={32}
                          className="aspect-square h-full w-full rounded-full"
                        />
                      ) : (
                        <AvatarFallback className="text-xs">
                          {(m.displayName || m.username).charAt(0).toUpperCase()}
                        </AvatarFallback>
                      )}
                    </Avatar>
                  </TableCell>

                  {/* Username */}
                  <TableCell className="font-mono text-sm">{m.username}</TableCell>

                  {/* Display Name */}
                  <TableCell className="text-sm">
                    {m.displayName || <span className="text-muted-foreground italic">—</span>}
                  </TableCell>

                  {/* Messages (hidden on mobile) */}
                  <TableCell className="hidden md:table-cell font-mono text-sm tabular-nums">
                    {formatNumber(m.messages_sent)}
                  </TableCell>

                  {/* XP / Level */}
                  <TableCell className="text-sm">
                    <span className="font-mono tabular-nums">{formatNumber(m.xp)} XP</span>
                    <span className="text-muted-foreground"> · </span>
                    <Badge variant="secondary" className="text-xs">
                      Lv. {m.level}
                    </Badge>
                  </TableCell>

                  {/* Warnings */}
                  <TableCell>
                    {m.warning_count > 0 ? (
                      <Badge variant="destructive" className="text-xs">
                        {m.warning_count}
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">0</span>
                    )}
                  </TableCell>

                  {/* Last Active */}
                  <TableCell className="text-xs text-muted-foreground">
                    {relativeTime(m.last_active)}
                  </TableCell>

                  {/* Joined (hidden on mobile) */}
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                    {formatDateShort(m.joinedAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Load More */}
      {hasMore && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            disabled={loading}
            className="gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Load More
          </Button>
        </div>
      )}
    </div>
  );
}
