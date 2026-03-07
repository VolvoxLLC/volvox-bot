'use client';

import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { parseNumberInput } from '@/lib/config-normalization';
import type { GuildConfig } from '@/lib/config-utils';
import { ToggleSwitch } from '../toggle-switch';

interface GitHubSectionProps {
  draftConfig: GuildConfig;
  saving: boolean;
  onFieldChange: (field: string, value: unknown) => void;
}

/** Shared input styling for text inputs. */
const inputClasses =
  'w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Render the GitHub Activity Feed configuration panel inside a Card.
 *
 * Renders controls to enable/disable the feed, set the feed channel ID, and configure the poll interval.
 *
 * @param draftConfig - Current guild configuration draft containing optional `github.feed` values.
 * @param saving - When true, disables all inputs to prevent interaction while saving.
 * @param onFieldChange - Callback invoked with (`field`, `value`) when a control changes.
 * @returns The JSX element for the GitHub Activity Feed configuration section.
 */
export function GitHubSection({ draftConfig, saving, onFieldChange }: GitHubSectionProps) {
  const feed = draftConfig.github?.feed ?? {};

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">GitHub Activity Feed</CardTitle>
          <ToggleSwitch
            checked={feed.enabled ?? false}
            onChange={(v) => onFieldChange('enabled', v)}
            disabled={saving}
            label="GitHub Feed"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label htmlFor="feed-channel-id" className="space-y-2">
            <span className="text-sm font-medium">Feed Channel ID</span>
            <input
              id="feed-channel-id"
              type="text"
              value={feed.channelId ?? ''}
              onChange={(e) => onFieldChange('channelId', e.target.value.trim() || null)}
              disabled={saving}
              className={inputClasses}
              placeholder="Channel ID for GitHub updates"
            />
          </label>
          <label htmlFor="poll-interval-minutes" className="space-y-2">
            <span className="text-sm font-medium">Poll Interval (minutes)</span>
            <input
              id="poll-interval-minutes"
              type="number"
              min={1}
              value={feed.pollIntervalMinutes ?? 5}
              onChange={(e) => {
                const num = parseNumberInput(e.target.value, 1);
                if (num !== undefined) onFieldChange('pollIntervalMinutes', num);
              }}
              disabled={saving}
              className={inputClasses}
            />
          </label>
        </div>
      </CardContent>
    </Card>
  );
}
