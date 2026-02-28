'use client';

import {
  ArrowLeft,
  Calendar,
  Download,
  Loader2,
  MessageSquare,
  Smile,
  Sparkles,
  Zap,
} from 'lucide-react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ActionBadge } from '@/components/dashboard/action-badge';
import type { ModAction } from '@/components/dashboard/moderation-types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useGuildSelection } from '@/hooks/use-guild-selection';
import { formatDate } from '@/lib/format-time';

// ─── Types (aligned with backend response shapes) ─────────────────────────────

/** Matches GET /:id/members/:userId response */
interface MemberDetailResponse {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  roles: Array<{ id: string; name: string; color: string }>;
  joinedAt: string | null;
  stats: {
    messages_sent: number;
    reactions_given: number;
    reactions_received: number;
    days_active: number;
    first_seen: string | null;
    last_active: string | null;
  } | null;
  reputation: {
    xp: number;
    level: number;
    messages_count: number;
    voice_minutes: number;
    helps_given: number;
    last_xp_gain: string | null;
    next_level_xp: number | null;
  };
  warnings: {
    count: number;
    recent: MemberCase[];
  };
}

interface MemberCase {
  case_number: number;
  action: ModAction;
  reason: string | null;
  moderator_tag: string;
  created_at: string;
}

/**
 * Returns a CSS color for a role, falling back to the muted foreground when the provided color is missing or pure black.
 *
 * @param hexColor - The role color as a hex string (e.g., `#ff0000`). If falsy or `#000000`, a muted foreground HSL value is returned.
 * @returns The CSS color to use for the role (either `hexColor` or `hsl(var(--muted-foreground))`).
 */

function roleColorStyle(hexColor: string): string {
  if (!hexColor || hexColor === '#000000') return 'hsl(var(--muted-foreground))';
  return hexColor;
}

/**
 * Renders a compact statistic card with an icon, label, primary value, and optional subtext.
 *
 * @param label - Short descriptor shown above the value
 * @param value - Primary value to display; numbers are formatted with locale separators
 * @param icon - Icon component rendered inside a rounded background to the left of the text
 * @param subtext - Optional secondary content displayed beneath the primary value
 * @returns A React element representing the statistic card
 */

function StatCard({
  label,
  value,
  icon: Icon,
  subtext,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  subtext?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-muted p-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-bold font-mono tabular-nums truncate">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
            {subtext && <div className="mt-1">{subtext}</div>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Render an XP progress display showing the current level, current XP, and progress toward the next level.
 *
 * @param level - The member's current level.
 * @param xp - The member's current XP total.
 * @param nextLevelXp - The XP required to reach the next level, or `null` when the member is at max level.
 * @returns A React element containing a level badge, a progress bar, and a textual XP summary.
 */

function XpProgress({
  level,
  xp,
  nextLevelXp,
}: {
  level: number;
  xp: number;
  nextLevelXp: number | null;
}) {
  const pct = nextLevelXp ? Math.min(Math.max((xp / nextLevelXp) * 100, 0), 100) : 100;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-xs">
          Lv. {level}
        </Badge>
        {nextLevelXp && <span className="text-xs text-muted-foreground">→ Lv. {level + 1}</span>}
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        {xp.toLocaleString()} XP
        {nextLevelXp
          ? ` / ${nextLevelXp.toLocaleString()} · ${Math.round(pct)}% to next level`
          : ' (max level)'}
      </p>
    </div>
  );
}

/**
 * Page component that displays a guild member's profile, stats, warning history, and admin controls.
 *
 * Renders a detailed member view with avatar and roles, stat cards (messages, days active, XP, reactions),
 * a table of recent moderation cases, an XP adjustment form (with inline validation and success/error feedback),
 * and a CSV export action for all members.
 *
 * @returns A React element rendering the member detail page with interactive admin actions and data-driven UI states.
 */

export default function MemberDetailPage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.userId as string;

  const guildId = useGuildSelection();

  const [data, setData] = useState<MemberDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // XP adjustment form
  const [xpAmount, setXpAmount] = useState('');
  const [xpReason, setXpReason] = useState('');
  const [xpSubmitting, setXpSubmitting] = useState(false);
  const [xpSuccess, setXpSuccess] = useState<string | null>(null);
  const [xpError, setXpError] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Fetch member detail
  useEffect(() => {
    if (!guildId || !userId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await fetch(
          `/api/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}`,
        );
        if (res.status === 401) {
          router.replace('/login');
          return;
        }
        if (res.status === 404) {
          setError('Member not found');
          return;
        }
        if (!res.ok) {
          throw new Error(`Failed to load member (${res.status})`);
        }
        const responseData = (await res.json()) as MemberDetailResponse;
        if (!cancelled) {
          setData(responseData);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load member');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [guildId, userId, router]);

  // Adjust XP
  const handleAdjustXp = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!guildId || !userId || !xpAmount) return;

      const amount = parseInt(xpAmount, 10);
      if (Number.isNaN(amount)) {
        setXpError('Please enter a valid number');
        return;
      }

      setXpSubmitting(true);
      setXpError(null);
      setXpSuccess(null);

      try {
        const res = await fetch(
          `/api/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}/xp`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, reason: xpReason || undefined }),
          },
        );
        if (res.status === 401) {
          router.replace('/login');
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed to adjust XP (${res.status})`);
        }
        const result = await res.json();
        setXpSuccess(
          `XP adjusted by ${amount > 0 ? '+' : ''}${amount}. New total: ${result.xp?.toLocaleString() ?? 'updated'}`,
        );
        setXpAmount('');
        setXpReason('');

        // Update data in place with new XP/level
        if (result.xp !== undefined) {
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  reputation: {
                    ...prev.reputation,
                    xp: result.xp,
                    level: result.level ?? prev.reputation.level,
                  },
                }
              : prev,
          );
        }
      } catch (err) {
        setXpError(err instanceof Error ? err.message : 'Failed to adjust XP');
      } finally {
        setXpSubmitting(false);
      }
    },
    [guildId, userId, xpAmount, xpReason],
  );

  // Export CSV
  const handleExport = useCallback(async () => {
    if (!guildId) return;
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch(`/api/guilds/${encodeURIComponent(guildId)}/members/export`);
      if (res.status === 401) {
        router.replace('/login');
        return;
      }
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `members-${guildId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Failed to export CSV');
    } finally {
      setExporting(false);
    }
  }, [guildId]);

  // ─── Loading state ───────────────────────────────────────────────────────

  if (!guildId || !userId) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">No member selected.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-20 w-20 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // ─── Error state ─────────────────────────────────────────────────────────

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
          onClick={() => router.push('/dashboard/members')}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Members
        </Button>
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {error || 'Member not found'}
        </div>
      </div>
    );
  }

  const cases = data.warnings.recent;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        className="gap-2"
        onClick={() => router.push('/dashboard/members')}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Members
      </Button>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar className="h-20 w-20">
          {data.avatar ? (
            <Image
              src={data.avatar}
              alt={data.username}
              width={80}
              height={80}
              className="aspect-square h-full w-full rounded-full"
            />
          ) : (
            <AvatarFallback className="text-2xl">
              {(data.displayName || data.username).charAt(0).toUpperCase()}
            </AvatarFallback>
          )}
        </Avatar>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{data.displayName || data.username}</h2>
          <p className="font-mono text-sm text-muted-foreground">@{data.username}</p>
          {data.roles.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {data.roles.map((role) => (
                <span
                  key={role.id}
                  className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border"
                  style={{
                    color: roleColorStyle(role.color),
                    borderColor: `${roleColorStyle(role.color)}40`,
                    backgroundColor: `${roleColorStyle(role.color)}15`,
                  }}
                >
                  {role.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Messages Sent"
          value={data.stats?.messages_sent ?? 0}
          icon={MessageSquare}
        />
        <StatCard label="Days Active" value={data.stats?.days_active ?? 0} icon={Calendar} />
        <StatCard
          label="XP"
          value={data.reputation.xp}
          icon={Sparkles}
          subtext={
            <XpProgress
              level={data.reputation.level}
              xp={data.reputation.xp}
              nextLevelXp={data.reputation.next_level_xp}
            />
          }
        />
        <StatCard
          label="Reactions"
          value={`${data.stats?.reactions_given ?? 0} / ${data.stats?.reactions_received ?? 0}`}
          icon={Smile}
          subtext={<p className="text-xs text-muted-foreground">Given / Received</p>}
        />
      </div>

      {/* Warning History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Warning History</CardTitle>
          <CardDescription>
            {cases.length === 0
              ? 'No warnings on record.'
              : `${data.warnings.count} ${data.warnings.count === 1 ? 'warning' : 'warnings'} total · showing ${cases.length} most recent`}
          </CardDescription>
        </CardHeader>
        {cases.length > 0 && (
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Case #</TableHead>
                    <TableHead className="w-28">Action</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="hidden md:table-cell">Moderator</TableHead>
                    <TableHead className="w-36">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cases.map((c) => (
                    <TableRow key={c.case_number}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        #{c.case_number}
                      </TableCell>
                      <TableCell>
                        <ActionBadge action={c.action} />
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate text-sm">
                        {c.reason ?? <span className="italic text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {c.moderator_tag}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(c.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Admin Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Admin Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Adjust XP */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Adjust XP
            </h4>
            <form
              onSubmit={handleAdjustXp}
              className="flex flex-col gap-2 sm:flex-row sm:items-end"
            >
              <div className="space-y-1">
                <label htmlFor="xp-amount" className="text-xs text-muted-foreground">
                  Amount (negative to subtract)
                </label>
                <Input
                  id="xp-amount"
                  type="number"
                  placeholder="e.g. 100 or -50"
                  value={xpAmount}
                  onChange={(e) => setXpAmount(e.target.value)}
                  className="w-40"
                />
              </div>
              <div className="flex-1 space-y-1">
                <label htmlFor="xp-reason" className="text-xs text-muted-foreground">
                  Reason (optional)
                </label>
                <Input
                  id="xp-reason"
                  placeholder="Reason for adjustment..."
                  value={xpReason}
                  onChange={(e) => setXpReason(e.target.value)}
                />
              </div>
              <Button type="submit" size="sm" disabled={!xpAmount || xpSubmitting}>
                {xpSubmitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Submit
              </Button>
            </form>
            {xpSuccess && <p className="text-sm text-green-500">{xpSuccess}</p>}
            {xpError && <p className="text-sm text-destructive">{xpError}</p>}
          </div>

          {/* Export */}
          <div className="flex flex-col gap-2 pt-2 border-t">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleExport}
                disabled={exporting}
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Export All Members (CSV)
              </Button>
            </div>
            {exportError && <p className="text-sm text-destructive">{exportError}</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
