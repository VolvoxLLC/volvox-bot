'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChannelSelector } from '@/components/ui/channel-selector';
import { parseNumberInput } from '@/lib/config-normalization';
import type { GuildConfig } from '@/lib/config-utils';
import { ToggleSwitch } from '../toggle-switch';

interface StarboardSectionProps {
  draftConfig: GuildConfig;
  guildId: string;
  saving: boolean;
  onFieldChange: (field: string, value: unknown) => void;
}

/** Shared input styling for text inputs. */
const inputClasses =
  'w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Starboard configuration section.
 *
 * Provides controls for pinning popular messages to a starboard channel,
 * including threshold, emoji settings, and ignored channels.
 */
export function StarboardSection({
  draftConfig,
  guildId,
  saving,
  onFieldChange,
}: StarboardSectionProps) {
  // Local state for ignored channels raw input (parsed on blur)
  const ignoredChannelsDisplay = (draftConfig.starboard?.ignoredChannels ?? []).join(', ');
  const [ignoredChannelsRaw, setIgnoredChannelsRaw] = useState(ignoredChannelsDisplay);
  useEffect(() => {
    setIgnoredChannelsRaw(ignoredChannelsDisplay);
  }, [ignoredChannelsDisplay]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Starboard</CardTitle>
            <CardDescription>Pin popular messages to a starboard channel.</CardDescription>
          </div>
          <ToggleSwitch
            checked={draftConfig.starboard?.enabled ?? false}
            onChange={(v) => onFieldChange('enabled', v)}
            disabled={saving}
            label="Starboard"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <span className="text-sm font-medium">Starboard Channel</span>
          {guildId ? (
            <ChannelSelector
              guildId={guildId}
              selected={draftConfig.starboard?.channelId ? [draftConfig.starboard.channelId] : []}
              onChange={(selected) => onFieldChange('channelId', selected[0] ?? null)}
              placeholder="Select starboard channel..."
              disabled={saving}
              maxSelections={1}
            />
          ) : (
            <p className="text-muted-foreground text-sm">Select a server first</p>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label htmlFor="threshold" className="space-y-2">
            <span className="text-sm font-medium">Threshold</span>
            <input
              id="threshold"
              type="number"
              min={1}
              value={draftConfig.starboard?.threshold ?? 3}
              onChange={(e) => {
                const num = parseNumberInput(e.target.value, 1);
                if (num !== undefined) onFieldChange('threshold', num);
              }}
              disabled={saving}
              className={inputClasses}
            />
          </label>
          <label htmlFor="emoji" className="space-y-2">
            <span className="text-sm font-medium">Emoji</span>
            <div className="flex items-center gap-2">
              <input
                id="emoji"
                type="text"
                value={draftConfig.starboard?.emoji ?? '*'}
                onChange={(e) => onFieldChange('emoji', e.target.value.trim() || '*')}
                disabled={saving}
                className={inputClasses}
                placeholder="*"
              />
              <button
                type="button"
                onClick={() => onFieldChange('emoji', '*')}
                disabled={saving}
                className={`shrink-0 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                  (draftConfig.starboard?.emoji ?? '*') === '*'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
              >
                Any ✱
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Set a specific emoji (e.g. ⭐ 🔥 👍) or click <strong>Any</strong> to let any emoji
              trigger the starboard.
            </p>
          </label>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Allow Self-Star</span>
          <ToggleSwitch
            checked={draftConfig.starboard?.selfStarAllowed ?? false}
            onChange={(v) => onFieldChange('selfStarAllowed', v)}
            disabled={saving}
            label="Self-Star Allowed"
          />
        </div>
        <label htmlFor="ignored-channels" className="space-y-2">
          <span className="text-sm font-medium">Ignored Channels</span>
          <input
            id="ignored-channels"
            type="text"
            value={ignoredChannelsRaw}
            onChange={(e) => {
              const raw = e.target.value;
              setIgnoredChannelsRaw(raw);
              // Call onFieldChange on every change to prevent Ctrl+S data loss
              onFieldChange(
                'ignoredChannels',
                raw
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              );
            }}
            onBlur={() => {
              // Normalize on blur
              const normalized = ignoredChannelsRaw
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
                .join(', ');
              setIgnoredChannelsRaw(normalized);
            }}
            disabled={saving}
            className={inputClasses}
            placeholder="Comma-separated channel IDs"
          />
        </label>
      </CardContent>
    </Card>
  );
}
