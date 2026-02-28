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

export interface MemberRow {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_hash: string | null;
  messages: number;
  xp: number;
  level: number;
  warnings: number;
  last_active: string | null;
  joined_at: string | null;
}

export type SortColumn =
  | 'username'
  | 'display_name'
  | 'messages'
  | 'xp'
  | 'level'
  | 'warnings'
  | 'last_active'
  | 'joined_at';

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

function avatarUrl(userId: string, hash: string | null): string | null {
  if (!hash) return null;
  return `https://cdn.discordapp.com/avatars/${userId}/${hash}.png?size=64`;
}

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
              <SortableHead
                column="username"
                label="Username"
                currentColumn={sortColumn}
                currentOrder={sortOrder}
                onSort={onSort}
              />
              <SortableHead
                column="display_name"
                label="Display Name"
                currentColumn={sortColumn}
                currentOrder={sortOrder}
                onSort={onSort}
              />
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
              <SortableHead
                column="last_active"
                label="Last Active"
                currentColumn={sortColumn}
                currentOrder={sortOrder}
                onSort={onSort}
              />
              <SortableHead
                column="joined_at"
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
                  key={m.user_id}
                  className="cursor-pointer"
                  onClick={() => onRowClick(m.user_id)}
                >
                  {/* Avatar */}
                  <TableCell>
                    <Avatar className="h-8 w-8">
                      {avatarUrl(m.user_id, m.avatar_hash) ? (
                        <Image
                          src={avatarUrl(m.user_id, m.avatar_hash)!}
                          alt={m.username}
                          width={32}
                          height={32}
                          className="aspect-square h-full w-full rounded-full"
                        />
                      ) : (
                        <AvatarFallback className="text-xs">
                          {(m.display_name || m.username).charAt(0).toUpperCase()}
                        </AvatarFallback>
                      )}
                    </Avatar>
                  </TableCell>

                  {/* Username */}
                  <TableCell className="font-mono text-sm">{m.username}</TableCell>

                  {/* Display Name */}
                  <TableCell className="text-sm">
                    {m.display_name || (
                      <span className="text-muted-foreground italic">—</span>
                    )}
                  </TableCell>

                  {/* Messages (hidden on mobile) */}
                  <TableCell className="hidden md:table-cell font-mono text-sm tabular-nums">
                    {formatNumber(m.messages)}
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
                    {m.warnings > 0 ? (
                      <Badge variant="destructive" className="text-xs">
                        {m.warnings}
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
                    {formatDateShort(m.joined_at)}
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
