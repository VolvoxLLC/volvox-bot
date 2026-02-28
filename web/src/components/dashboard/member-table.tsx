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

/**
 * Formats an ISO 8601 timestamp into a concise human-readable relative time.
 *
 * @param iso - An ISO 8601 timestamp string or `null`. When `null`, no time is available.
 * @returns `'—'` if `iso` is `null`; otherwise one of:
 * - `'just now'` for times less than 60 seconds ago
 * - `'<N>m ago'` for minutes
 * - `'<N>h ago'` for hours
 * - `'<N>d ago'` for days
 * - `'<N>mo ago'` for months
 * - `'<N>y ago'` for years
 */

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

/**
 * Format a number using the runtime's locale conventions.
 *
 * @param n - The number to format with locale-aware separators and digit grouping
 * @returns The string representation of `n` formatted according to the runtime's default locale
 */
function formatNumber(n: number): string {
  return n.toLocaleString();
}

/**
 * Format an ISO date string into a locale-aware short/medium date, or return a dash when no date is provided.
 *
 * @param iso - An ISO 8601 date string (or `null` / empty) to format
 * @returns The formatted date string, or `'—'` if `iso` is `null` or empty
 */
function formatDateShort(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso));
}

/**
 * Renders a table header cell with a clickable label that activates sorting for a specific column.
 *
 * @param column - The sort column this header represents.
 * @param label - Visible text displayed in the header button.
 * @param currentColumn - The column currently used for sorting; used to determine active state.
 * @param currentOrder - The current sort order (`'asc'` or `'desc'`) shown when `column` is active.
 * @param onSort - Callback invoked with `column` when the header is clicked.
 * @param className - Optional additional CSS class names applied to the header cell.
 * @returns A table header cell element containing a sort button and, when active, a direction icon.
 */

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
        type="button"
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

/**
 * Renders a table-shaped loading skeleton with eight placeholder rows matching the member table's columns.
 *
 * @returns A React fragment containing eight table rows, each filled with Skeleton cells sized to mirror the table's avatar, username, display name, messages, XP/level, warnings, last active, and joined columns.
 */

function TableSkeleton() {
  return (
    <>
      {(['mt-0', 'mt-1', 'mt-2', 'mt-3', 'mt-4', 'mt-5', 'mt-6', 'mt-7'] as const).map((key) => (
        <TableRow key={key}>
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

/**
 * Enable activating a table row via Enter or Space to support keyboard interaction.
 *
 * @param e - Keyboard event from the table row
 * @param userId - Identifier of the row's target user to pass to the click handler
 * @param onClick - Handler invoked with `userId` when Enter or Space is pressed
 */

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

/**
 * Render a responsive, sortable members table with avatars, stats, warnings, activity, and a load-more control.
 *
 * Renders header columns (including clickable sortable headers for client-side sortable fields), loading skeletons, an empty state, and one interactive row per member. Rows are keyboard-accessible and invoke `onRowClick` when activated.
 *
 * @param members - The list of member records to display.
 * @param onSort - Callback invoked with a `SortColumn` when a sortable header is activated.
 * @param sortColumn - The currently active sort column.
 * @param sortOrder - The current sort direction (`'asc' | 'desc'`).
 * @param onLoadMore - Callback invoked when the "Load More" button is clicked.
 * @param hasMore - Whether more members can be loaded (controls visibility of the load-more button).
 * @param loading - Whether the table is in a loading state (controls skeletons and disables loading actions).
 * @param onRowClick - Callback invoked with a member id when a row is clicked or activated via keyboard.
 * @returns The rendered JSX element for the member table.
 */

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
