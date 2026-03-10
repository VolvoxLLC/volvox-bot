'use client';

import { Hash, Loader2, Megaphone, RotateCcw, Search, StickyNote } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { GuildConfig } from '@/lib/config-utils';
import { cn } from '@/lib/utils';
import type { ChannelMode } from '@/types/config';

// ── Discord channel types ──────────────────────────────────────────────────

const GUILD_TEXT = 0;
const GUILD_CATEGORY = 4;
const GUILD_ANNOUNCEMENT = 5;
const GUILD_FORUM = 15;

const TEXT_LIKE_TYPES = new Set([GUILD_TEXT, GUILD_ANNOUNCEMENT, GUILD_FORUM]);

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
  isDefault,
}: {
  mode: ChannelMode;
  onChange: (mode: ChannelMode) => void;
  disabled: boolean;
  isDefault: boolean;
}) {
  const modes: { value: ChannelMode; label: string }[] = [
    { value: 'off', label: 'Off' },
    { value: 'mention', label: 'Mention' },
    { value: 'vibe', label: 'Vibe' },
  ];

  function activeClasses(m: ChannelMode) {
    if (mode !== m)
      return 'bg-transparent text-muted-foreground hover:bg-muted/60 border border-border';
    switch (m) {
      case 'off':
        return 'bg-destructive/10 text-destructive border border-destructive/30 font-medium';
      case 'mention':
        return 'bg-primary/10 text-primary border border-primary/30 font-medium';
      case 'vibe':
        return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-medium';
    }
  }

  return (
    <div className="flex shrink-0 rounded-md overflow-hidden divide-x divide-border">
      {modes.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          disabled={disabled}
          className={cn(
            'px-3 py-1 text-xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            activeClasses(value),
          )}
          aria-pressed={mode === value}
        >
          {label}
          {isDefault && value === mode && <span className="ml-1 opacity-60">✓</span>}
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

// ── Mode dot indicator ────────────────────────────────────────────────────

function ModeDot({ mode }: { mode: ChannelMode }) {
  const color =
    mode === 'off' ? 'bg-destructive' : mode === 'vibe' ? 'bg-emerald-500' : 'bg-primary';
  return <span className={cn('inline-block h-1.5 w-1.5 rounded-full shrink-0', color)} />;
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

    // Group by parentId
    const map = new Map<string | null, RawChannel[]>();
    for (const ch of visible) {
      const key = ch.parentId;
      if (!map.has(key)) map.set(key, []);
      const bucket = map.get(key);
      if (bucket) bucket.push(ch);
    }

    const result: Category[] = [];

    // Uncategorized first
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

  const hasOverrides = Object.keys(channelModes).length > 0;

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
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Per-Channel AI Mode</CardTitle>
        <CardDescription>
          Set the AI response mode per channel. Channels using the default inherit the setting
          below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Default mode */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-md border bg-muted/30 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Default mode for all channels</p>
            <p className="text-xs text-muted-foreground">
              Channels without an override inherit this mode.
            </p>
          </div>
          <ModeSelector
            mode={defaultMode}
            onChange={onDefaultModeChange}
            disabled={saving}
            isDefault={false}
          />
        </div>

        <hr className="border-border" />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search channels..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            disabled={saving || loading}
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
              (ch) => channelModes[ch.id] !== undefined && channelModes[ch.id] !== defaultMode,
            );
            const hasCategoryOverrides = categoryOverrides.length > 0;

            return (
              <div key={cat.id ?? '__uncategorized__'} className="space-y-1">
                {/* Category header */}
                <div className="flex items-center justify-between px-1 py-1">
                  <p className="text-xs font-semibold text-muted-foreground tracking-wider flex items-center gap-1.5">
                    <span>📁</span>
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
                <div className="rounded-md border overflow-hidden divide-y divide-border">
                  {cat.channels.map((ch) => {
                    const override = channelModes[ch.id] as ChannelMode | undefined;
                    const effectiveMode: ChannelMode = override ?? defaultMode;
                    const isOverridden = override !== undefined && override !== defaultMode;

                    return (
                      <div
                        key={ch.id}
                        className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between bg-card hover:bg-muted/30 transition-colors"
                      >
                        {/* Channel name */}
                        <div className="flex items-center gap-2 min-w-0">
                          <ChannelIcon type={ch.type} />
                          <span className="text-sm truncate">{ch.name}</span>
                          {isOverridden && <ModeDot mode={effectiveMode} />}
                        </div>

                        {/* Controls */}
                        <div className="flex items-center shrink-0">
                          <ModeSelector
                            mode={effectiveMode}
                            onChange={(m) => handleChannelMode(ch.id, m)}
                            disabled={saving}
                            isDefault={!isOverridden}
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
              variant="outline"
              size="sm"
              onClick={onResetAll}
              disabled={saving}
              className="gap-1.5 text-muted-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset all to default
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
