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
import { toast } from 'sonner';
import { ActionBadge } from '@/components/dashboard/action-badge';
import type { ModAction } from '@/components/dashboard/moderation-types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/ui/error-boundary';
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

// ─── Types ────────────────────────────────────────────────────────────────────

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

function roleColorStyle(hexColor: string): string {
  if (!hexColor || hexColor === '#000000') return '#6b7280';
  return hexColor;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  subtext,
  gradient,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  subtext?: React.ReactNode;
  gradient?: string;
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-[24px] border border-border/40 bg-card/40 p-6 backdrop-blur-2xl shadow-lg transition-all hover:bg-card/55 hover:shadow-xl ${gradient ?? ''}`}
    >
      {/* Ambient icon */}
      <Icon className="absolute -right-2 -top-2 h-20 w-20 rotate-12 text-foreground/[0.04] transition-transform duration-500 group-hover:rotate-6 group-hover:scale-110" />
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-3 truncate bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-3xl font-bold tabular-nums tracking-tight text-transparent md:text-4xl">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {subtext && <div className="mt-2">{subtext}</div>}
    </div>
  );
}

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
    <div className="space-y-1.5 mt-1">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">
          Lv. {level}
        </span>
        {nextLevelXp && (
          <span className="text-[10px] font-medium text-muted-foreground/70">
            → Lv. {level + 1}
          </span>
        )}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] font-medium tabular-nums text-muted-foreground/60">
        {xp.toLocaleString()} XP
        {nextLevelXp ? ` / ${nextLevelXp.toLocaleString()} · ${Math.round(pct)}%` : ' (max level)'}
      </p>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function MemberDetailPage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.userId as string;

  const guildId = useGuildSelection();

  const [data, setData] = useState<MemberDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [xpAmount, setXpAmount] = useState('');
  const [xpReason, setXpReason] = useState('');
  const [xpSubmitting, setXpSubmitting] = useState(false);
  const [xpSuccess, setXpSuccess] = useState<string | null>(null);
  const [xpError, setXpError] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

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
        if (!res.ok) throw new Error(`Failed to load member (${res.status})`);
        const responseData = (await res.json()) as MemberDetailResponse;
        if (!cancelled) setData(responseData);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load member');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [guildId, userId, router]);

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
        const successMsg = `XP adjusted by ${amount > 0 ? '+' : ''}${amount}. New total: ${result.xp?.toLocaleString() ?? 'updated'}`;
        setXpSuccess(successMsg);
        toast.success('XP adjusted', { description: successMsg });
        setXpAmount('');
        setXpReason('');
        if (result.xp !== undefined) {
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  reputation: {
                    ...prev.reputation,
                    xp: result.xp,
                    level: result.level ?? prev.reputation.level,
                    next_level_xp: result.next_level_xp ?? prev.reputation.next_level_xp,
                  },
                }
              : prev,
          );
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Failed to adjust XP';
        setXpError(errMsg);
        toast.error('XP adjustment failed', { description: errMsg });
      } finally {
        setXpSubmitting(false);
      }
    },
    [guildId, userId, xpAmount, xpReason, router],
  );

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
      setTimeout(() => URL.revokeObjectURL(url), 100);
      toast.success('Export downloaded', { description: `members-${guildId}.csv` });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to export CSV';
      setExportError(errMsg);
      toast.error('Export failed', { description: errMsg });
    } finally {
      setExporting(false);
    }
  }, [guildId, router]);

  // ─── Loading ──────────────────────────────────────────────────────────────

  if (!guildId || !userId) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">No member selected.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32 rounded-xl" />
        <div className="relative overflow-hidden rounded-[28px] border border-border/40 bg-card/40 p-6 backdrop-blur-2xl shadow-lg">
          <div className="flex items-center gap-5">
            <Skeleton className="h-20 w-20 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
              <div className="flex gap-2 mt-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            </div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(['sk-0', 'sk-1', 'sk-2', 'sk-3'] as const).map((key) => (
            <Skeleton key={key} className="h-32 rounded-[24px]" />
          ))}
        </div>
      </div>
    );
  }

  // ─── Error ────────────────────────────────────────────────────────────────

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground hover:text-foreground rounded-xl"
          onClick={() => router.push('/dashboard/members')}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Members
        </Button>
        <div
          role="alert"
          className="rounded-[20px] border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive backdrop-blur-xl"
        >
          {error || 'Member not found'}
        </div>
      </div>
    );
  }

  const cases = data.warnings.recent;
  const displayName = data.displayName || data.username;

  return (
    <ErrorBoundary
      title="Member details failed to load"
      description="There was a problem loading this member's details. Try again or refresh the page."
    >
      <div className="space-y-6">
        {/* Back button */}
        <button
          type="button"
          onClick={() => router.push('/dashboard/members')}
          className="group inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-card/40 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70 backdrop-blur-sm shadow-sm transition-all hover:bg-card/60 hover:text-foreground active:scale-95"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
          Back to Members
        </button>

        {/* Hero Header Panel */}
        <div className="group relative overflow-hidden rounded-[28px] border border-border/40 bg-card/40 p-6 backdrop-blur-2xl shadow-xl transition-all hover:bg-card/50 md:p-8">
          {/* Decorative ambient glow */}
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-secondary/10 blur-2xl" />

          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div className="h-20 w-20 overflow-hidden rounded-full ring-2 ring-primary/20 ring-offset-2 ring-offset-card/40 shadow-lg">
                {data.avatar ? (
                  <Image
                    src={data.avatar}
                    alt={data.username}
                    width={80}
                    height={80}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Avatar className="h-20 w-20">
                    <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
                      {displayName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-2xl font-bold tracking-tight">{displayName}</h2>
              <p className="mt-0.5 font-mono text-sm text-muted-foreground/70">@{data.username}</p>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground/50">{data.id}</p>
              {data.joinedAt && (
                <p className="mt-1 text-xs text-muted-foreground/60">
                  Joined {formatDate(data.joinedAt)}
                </p>
              )}
              {data.roles.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {data.roles.map((role) => (
                    <span
                      key={role.id}
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold border"
                      style={{
                        color: roleColorStyle(role.color),
                        borderColor: `${roleColorStyle(role.color)}40`,
                        backgroundColor: `${roleColorStyle(role.color)}12`,
                      }}
                    >
                      {role.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Reputation Badge */}
            <div className="shrink-0 flex flex-col items-center gap-1 rounded-[20px] border border-border/40 bg-background/30 px-5 py-4 backdrop-blur-sm shadow-inner">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                Level
              </span>
              <span className="text-4xl font-black tabular-nums text-foreground">
                {data.reputation.level}
              </span>
              <div className="h-1 w-12 overflow-hidden rounded-full bg-white/5 mt-1">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60"
                  style={{
                    width: `${data.reputation.next_level_xp ? Math.min((data.reputation.xp / data.reputation.next_level_xp) * 100, 100) : 100}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Messages Sent"
            value={data.stats?.messages_sent ?? 0}
            icon={MessageSquare}
            gradient="bg-gradient-to-br from-primary/10 to-transparent"
          />
          <StatCard
            label="Days Active"
            value={data.stats?.days_active ?? 0}
            icon={Calendar}
            gradient="bg-gradient-to-br from-sky-500/8 to-transparent"
          />
          <StatCard
            label="Total XP"
            value={data.reputation.xp}
            icon={Sparkles}
            gradient="bg-gradient-to-br from-amber-500/8 to-transparent"
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
            gradient="bg-gradient-to-br from-rose-500/8 to-transparent"
            subtext={
              <p className="text-[11px] font-medium text-muted-foreground/60 mt-0.5">
                Given / Received
              </p>
            }
          />
        </div>

        {/* Warning History */}
        <div className="group relative overflow-hidden rounded-[24px] border border-border/40 bg-card/40 backdrop-blur-2xl shadow-lg transition-all">
          <div className="border-b border-border/30 px-6 py-5">
            <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-foreground/80">
              Warning History
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground/60">
              {cases.length === 0
                ? 'No warnings on record.'
                : `${data.warnings.count} ${data.warnings.count === 1 ? 'warning' : 'warnings'} total · showing ${cases.length} most recent`}
            </p>
          </div>
          {cases.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/20 hover:bg-transparent">
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 w-20">
                      Case #
                    </TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 w-28">
                      Action
                    </TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                      Reason
                    </TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 hidden md:table-cell">
                      Moderator
                    </TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 w-36">
                      Date
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cases.map((c) => (
                    <TableRow
                      key={c.case_number}
                      className="border-border/10 hover:bg-white/[0.02]"
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground/60">
                        #{c.case_number}
                      </TableCell>
                      <TableCell>
                        <ActionBadge action={c.action} />
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate text-sm text-foreground/80">
                        {c.reason ?? <span className="italic text-muted-foreground/40">—</span>}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground/60">
                        {c.moderator_tag}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground/50">
                        {formatDate(c.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="px-6 pb-6 pt-2">
              <p className="text-sm text-muted-foreground/50 italic">
                Clean record — no moderation actions found.
              </p>
            </div>
          )}
        </div>

        {/* Admin Actions */}
        <div className="group relative overflow-hidden rounded-[24px] border border-border/40 bg-card/40 backdrop-blur-2xl shadow-lg transition-all">
          <div className="border-b border-border/30 px-6 py-4">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground/60">
              Admin Actions
            </h3>
          </div>
          <div className="p-6 space-y-5">
            {/* Adjust XP */}
            <div className="rounded-[18px] border border-border/30 bg-background/20 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                  <Zap className="h-3.5 w-3.5 text-primary" />
                </div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-foreground/70">
                  Adjust XP
                </h4>
              </div>
              <form
                onSubmit={handleAdjustXp}
                className="grid grid-cols-1 gap-3 sm:grid-cols-[9rem_1fr_auto] sm:items-end"
              >
                <div className="space-y-1.5">
                  <label
                    htmlFor="xp-amount"
                    className="block text-[11px] font-medium text-muted-foreground/50"
                  >
                    Amount
                  </label>
                  <Input
                    id="xp-amount"
                    type="number"
                    placeholder="e.g. 100 or -50"
                    value={xpAmount}
                    onChange={(e) => setXpAmount(e.target.value)}
                    className="h-9 rounded-xl border-border/40 bg-background/50 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="xp-reason"
                    className="block text-[11px] font-medium text-muted-foreground/50"
                  >
                    Reason <span className="text-muted-foreground/30">(optional)</span>
                  </label>
                  <Input
                    id="xp-reason"
                    placeholder="Reason for adjustment..."
                    value={xpReason}
                    onChange={(e) => setXpReason(e.target.value)}
                    className="h-9 rounded-xl border-border/40 bg-background/50 text-sm"
                  />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!xpAmount || xpSubmitting}
                  className="h-9 rounded-xl px-5"
                >
                  {xpSubmitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Apply
                </Button>
              </form>
              {xpSuccess && <p className="text-xs font-medium text-emerald-500">{xpSuccess}</p>}
              {xpError && <p className="text-xs font-medium text-destructive">{xpError}</p>}
            </div>

            {/* Export */}
            <div className="rounded-[18px] border border-border/30 bg-background/20 p-5">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted/60">
                    <Download className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-widest text-foreground/70">
                      Export Members
                    </h4>
                    <p className="text-[11px] text-muted-foreground/50">
                      Download all guild members as CSV
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 rounded-xl border-border/40 bg-background/40 hover:bg-background/60 text-xs font-bold uppercase tracking-wider"
                  onClick={handleExport}
                  disabled={exporting}
                >
                  {exporting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  {exporting ? 'Exporting…' : 'Download CSV'}
                </Button>
              </div>
              {exportError && (
                <p className="mt-3 text-xs font-medium text-destructive">{exportError}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
