'use client';

import { Hash, Loader2, Megaphone, RotateCcw, Search, StickyNote } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { inputClasses } from '@/components/dashboard/config-editor-utils';
import { Button } from '@/components/ui/button';
import { CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { GuildConfig } from '@/lib/config-utils';
import { cn } from '@/lib/utils';
import type { ChannelMode } from '@/types/config';

// ── Discord channel types ──────────────────────────────────────────────────

const GUILD_TEXT = 0;
const GUILD_CATEGORY = 4;
const GUILD_ANNOUNCEMENT = 5;
const GUILD_FORUM = 15;
const GUILD_MEDIA = 16;

const TEXT_LIKE_TYPES = new Set([GUILD_TEXT, GUILD_ANNOUNCEMENT, GUILD_FORUM, GUILD_MEDIA]);

interface RawChannel {
  id: string;
  name: string;
  type: number;
  parentId: string | null;
  position: number;
}

interface Category {
  id: string | null; // null = uncategorized
  name: string;
  position: number;
  channels: RawChannel[];
}

// ── ModeSelector ──────────────────────────────────────────────────────────

function ModeSelector({
  mode,
  onChange,
  disabled,
  ariaLabelContext,
}: {
  mode: ChannelMode;
  onChange: (mode: ChannelMode) => void;
  disabled: boolean;
  ariaLabelContext: string;
}) {
  const modes: { value: ChannelMode; label: string }[] = [
    { value: 'off', label: 'Off' },
    { value: 'mention', label: 'Mention' },
    { value: 'vibe', label: 'Vibe' },
  ];

  function activeClasses(m: ChannelMode) {
    if (mode !== m)
      return 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/10 border-transparent';
    switch (m) {
      case 'off':
        return 'bg-background dark:bg-zinc-800/80 text-destructive shadow-sm dark:shadow-[0_2px_8px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.05)] border-border dark:border-white/10 font-bold';
      case 'mention':
        return 'bg-background dark:bg-zinc-800/80 text-primary shadow-sm dark:shadow-[0_2px_8px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.05)] border-border dark:border-white/10 font-bold';
      case 'vibe':
        return 'bg-background dark:bg-zinc-800/80 text-emerald-500 shadow-sm dark:shadow-[0_2px_8px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.05)] border-border dark:border-white/10 font-bold';
    }
  }

  return (
    <div className="flex shrink-0 p-1.5 rounded-2xl bg-muted/40 dark:bg-black/40 border border-border dark:border-white/5 backdrop-blur-md shadow-inner">
      {modes.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          disabled={disabled}
          className={cn(
            'px-4 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all duration-300 cursor-pointer rounded-xl border',
            activeClasses(value),
          )}
          aria-pressed={mode === value}
          aria-label={`${ariaLabelContext} - ${label} mode`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Channel icon helpers ───────────────────────────────────────────────────

function ChannelIcon({ type }: { type: number }) {
  switch (type) {
    case GUILD_ANNOUNCEMENT:
      return <Megaphone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
    case GUILD_FORUM:
      return <StickyNote className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
    default:
      return <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
  }
}

// ── Props ─────────────────────────────────────────────────────────────────

export interface ChannelModeSectionProps {
  draftConfig: GuildConfig;
  saving: boolean;
  guildId: string;
  onChannelModeChange: (channelId: string, mode: ChannelMode | undefined) => void;
  onDefaultModeChange: (mode: ChannelMode) => void;
  onResetAll: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────

/**
 * Per-channel AI response mode section.
 *
 * Displays a segmented Off/Mention/Vibe control for each text channel,
 * grouped by Discord category, with search filtering.
 */
export function ChannelModeSection({
  draftConfig,
  saving,
  guildId,
  onChannelModeChange,
  onDefaultModeChange,
  onResetAll,
}: ChannelModeSectionProps) {
  const [rawChannels, setRawChannels] = useState<RawChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const channelModes = useMemo(
    () => (draftConfig.ai?.channelModes ?? {}) as Record<string, ChannelMode>,
    [draftConfig.ai?.channelModes],
  );
  const defaultMode: ChannelMode = (draftConfig.ai?.defaultChannelMode as ChannelMode) ?? 'mention';

  // Fetch channels on mount
  useEffect(() => {
    if (!guildId) return;

    async function fetchChannels() {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/guilds/${encodeURIComponent(guildId)}/channels`, {
          signal: controller.signal,
        });

        if (res.status === 401) {
          window.location.href = '/login';
          return;
        }

        if (!res.ok) throw new Error(`Failed to fetch channels: ${res.statusText}`);

        const data: unknown = await res.json();
        if (!Array.isArray(data)) throw new Error('Invalid response');

        const channels: RawChannel[] = data
          .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
          .filter(
            (c) =>
              typeof c.id === 'string' && typeof c.name === 'string' && typeof c.type === 'number',
          )
          .map((c) => ({
            id: c.id as string,
            name: c.name as string,
            type: c.type as number,
            parentId: typeof c.parentId === 'string' ? c.parentId : null,
            position: typeof c.position === 'number' ? c.position : 0,
          }));

        if (abortRef.current === controller) {
          setRawChannels(channels);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (abortRef.current === controller) {
          setError(err instanceof Error ? err.message : 'Failed to load channels');
        }
      } finally {
        if (abortRef.current === controller) {
          setLoading(false);
        }
      }
    }

    void fetchChannels();
    return () => abortRef.current?.abort();
  }, [guildId]);

  // Build grouped structure
  const categories = useMemo<Category[]>(() => {
    const categoryChannels = rawChannels.filter((c) => c.type === GUILD_CATEGORY);
    const textChannels = rawChannels.filter((c) => TEXT_LIKE_TYPES.has(c.type));

    // Filter by search
    const lc = search.toLowerCase();
    const visible = lc
      ? textChannels.filter((c) => c.name.toLowerCase().includes(lc))
      : textChannels;

    // Build a set of known category IDs for orphan detection
    const knownCategoryIds = new Set(categoryChannels.map((c) => c.id));

    // Group by parentId; channels whose parentId doesn't match any category
    // are treated as uncategorized (parentId → null)
    const map = new Map<string | null, RawChannel[]>();
    for (const ch of visible) {
      const key = ch.parentId !== null && knownCategoryIds.has(ch.parentId) ? ch.parentId : null;
      if (!map.has(key)) map.set(key, []);
      const bucket = map.get(key);
      if (bucket) bucket.push(ch);
    }

    const result: Category[] = [];

    // Uncategorized first (includes orphaned channels whose parent wasn't fetched)
    if (map.has(null) && (map.get(null)?.length ?? 0) > 0) {
      result.push({
        id: null,
        name: 'Uncategorized',
        position: -1,
        channels: (map.get(null) ?? []).sort((a, b) => a.position - b.position),
      });
    }

    // Sort categories by position
    const sortedCats = categoryChannels.sort((a, b) => a.position - b.position);
    for (const cat of sortedCats) {
      const channels = map.get(cat.id) ?? [];
      if (channels.length > 0 || !lc) {
        result.push({
          id: cat.id,
          name: cat.name.toUpperCase(),
          position: cat.position,
          channels: channels.sort((a, b) => a.position - b.position),
        });
      }
    }

    return result;
  }, [rawChannels, search]);

  const hasOverrides = Object.values(channelModes).some((v) => v != null);

  const handleChannelMode = useCallback(
    (channelId: string, mode: ChannelMode) => {
      // If set to default, remove the override
      if (mode === defaultMode) {
        onChannelModeChange(channelId, undefined);
      } else {
        onChannelModeChange(channelId, mode);
      }
    },
    [defaultMode, onChannelModeChange],
  );

  return (
    <div className="space-y-4">
      <CardHeader className="px-4 pt-4 pb-6">
        <div className="flex items-center gap-2">
          <div className="h-px w-8 bg-primary/40" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60">
            Intelli-Response
          </span>
        </div>
        <CardTitle className="text-2xl font-black tracking-tight text-foreground">
          Per-Channel AI Mode
        </CardTitle>
        <CardDescription className="text-xs font-medium text-muted-foreground max-w-lg leading-relaxed mt-1.5">
          Configure response behavior for specific channels. Use overrides to define unique
          interaction patterns outside the global default.
        </CardDescription>
      </CardHeader>
      <div className="space-y-6 p-4">
        {/* Default mode */}
        <div className="relative group overflow-hidden rounded-[24px] border border-border bg-muted/10 dark:bg-white/[0.02] p-5 shadow-2xl transition-all duration-500 hover:bg-muted/20 dark:hover:bg-white/[0.04] backdrop-blur-md">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
          <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-black tracking-tight text-foreground/90">
                Global Fallback Mode
              </p>
              <p className="text-xs font-medium text-muted-foreground leading-relaxed">
                Channels without explicit overrides will use this response behavior.
              </p>
            </div>
            <ModeSelector
              mode={defaultMode}
              onChange={onDefaultModeChange}
              disabled={saving}
              ariaLabelContext="Global fallback"
            />
          </div>
        </div>

        <div className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />

        {/* Search */}
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40 group-focus-within:text-primary transition-colors pointer-events-none" />
          <input
            placeholder="Search channels..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={(e) => e.target.select()}
            disabled={saving || loading}
            aria-label="Search channels by name"
            className={cn(
              inputClasses,
              'pl-11 h-12 bg-muted/10 dark:bg-black/20 focus:bg-muted/20 dark:focus:bg-black/40',
            )}
          />
        </div>

        {/* Channel list */}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading channels…</span>
          </div>
        )}

        {error && <p className="text-sm text-destructive py-4">{error}</p>}

        {!loading && !error && categories.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {search ? 'No channels match your search.' : 'No channels found.'}
          </p>
        )}

        {!loading &&
          !error &&
          categories.map((cat) => {
            const categoryOverrides = cat.channels.filter(
              (ch) => channelModes[ch.id] != null && channelModes[ch.id] !== defaultMode,
            );
            const hasCategoryOverrides = categoryOverrides.length > 0;

            return (
              <div key={cat.id ?? '__uncategorized__'} className="space-y-1">
                {/* Category header */}
                <div className="flex items-center justify-between px-1 py-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                    <span className="opacity-40">📁</span>
                    {cat.name}
                  </p>
                  {hasCategoryOverrides && (
                    <button
                      type="button"
                      onClick={() => {
                        for (const ch of categoryOverrides) {
                          onChannelModeChange(ch.id, undefined);
                        }
                      }}
                      disabled={saving}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                      aria-label={`Reset all channels in ${cat.name} to default`}
                    >
                      <RotateCcw className="h-3 w-3" />
                      Reset
                    </button>
                  )}
                </div>

                {/* Channels */}
                <div className="rounded-[24px] border border-border dark:border-white/5 bg-background dark:bg-white/[0.01] overflow-hidden shadow-sm">
                  {cat.channels.map((ch) => {
                    const override = channelModes[ch.id] as ChannelMode | null | undefined;
                    const effectiveMode: ChannelMode = override ?? defaultMode;
                    const isOverridden = override != null && override !== defaultMode;

                    return (
                      <div
                        key={ch.id}
                        className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/50 dark:border-white/[0.03] last:border-0 hover:bg-muted/10 transition-all duration-300"
                      >
                        {/* Channel name */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={cn(
                              'flex h-8 w-8 items-center justify-center rounded-lg border border-border shadow-inner transition-colors',
                              isOverridden
                                ? 'bg-primary/10 text-primary'
                                : 'bg-muted/20 text-muted-foreground/60',
                            )}
                          >
                            <ChannelIcon type={ch.type} />
                          </div>
                          <span
                            className={cn(
                              'text-xs font-bold tracking-tight truncate',
                              isOverridden ? 'text-foreground' : 'text-muted-foreground',
                            )}
                          >
                            {ch.name}
                          </span>
                          {isOverridden && (
                            <div className="flex h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.5)]" />
                          )}
                        </div>

                        {/* Controls */}
                        <div className="flex items-center shrink-0">
                          <ModeSelector
                            mode={effectiveMode}
                            onChange={(m) => handleChannelMode(ch.id, m)}
                            disabled={saving}
                            ariaLabelContext={`Channel #${ch.name}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

        {/* Reset all */}
        {hasOverrides && (
          <div className="flex justify-end pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onResetAll}
              disabled={saving}
              className="h-8 rounded-xl px-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 hover:text-destructive hover:bg-destructive/5 group transition-all"
            >
              <RotateCcw className="h-3 w-3 mr-2 group-hover:rotate-[-120deg] transition-transform" />
              Reset All Overrides
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
