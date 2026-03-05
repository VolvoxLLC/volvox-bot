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
export function StarboardSection({ draftConfig, guildId, saving, onFieldChange }: StarboardSectionProps) {
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
        <label htmlFor="channel-id" className="space-y-2">
          <span className="text-sm font-medium">Channel ID</span>
          <input
            id="channel-id"
            type="text"
            value={draftConfig.starboard?.channelId ?? ''}
            onChange={(e) => onFieldChange('channelId', e.target.value)}
            disabled={saving}
            className={inputClasses}
            placeholder="Starboard channel ID"
          />
        </label>
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
            value={(draftConfig.starboard?.ignoredChannels ?? []).join(', ')}
            onChange={(e) =>
              onFieldChange(
                'ignoredChannels',
                e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
            disabled={saving}
            className={inputClasses}
            placeholder="Comma-separated channel IDs"
          />
        </label>
      </CardContent>
    </Card>
  );
}
