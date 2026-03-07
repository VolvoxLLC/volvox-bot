'use client';

import { Card, CardContent, CardTitle } from '@/components/ui/card';
import type { GuildConfig } from '@/lib/config-utils';
import { ToggleSwitch } from '../toggle-switch';

interface ChallengesSectionProps {
  draftConfig: GuildConfig;
  saving: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onFieldChange: (field: string, value: unknown) => void;
}

/** Shared input styling for text inputs. */
const inputClasses =
  'w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Render the Daily Coding Challenges configuration card.
 *
 * Renders controls to enable/disable daily challenges and to edit channel ID, post time, and timezone.
 *
 * @param draftConfig - Current guild configuration draft containing `challenges` settings
 * @param saving - Whether configuration changes are being saved; when true inputs are disabled
 * @param onEnabledChange - Called with the new enabled state when the toggle is changed
 * @param onFieldChange - Called with a field name and value when an input changes (channelId is sent as `null` when empty)
 * @returns A React element containing the challenges configuration UI
 */
export function ChallengesSection({
  draftConfig,
  saving,
  onEnabledChange,
  onFieldChange,
}: ChallengesSectionProps) {
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Daily Coding Challenges</CardTitle>
          <ToggleSwitch
            checked={draftConfig.challenges?.enabled ?? false}
            onChange={onEnabledChange}
            disabled={saving}
            label="Challenges"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Auto-post a daily coding challenge with hint and solve tracking.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label htmlFor="challenge-channel-id" className="space-y-2">
            <span className="text-sm font-medium">Challenge Channel ID</span>
            <input
              id="challenge-channel-id"
              type="text"
              value={draftConfig.challenges?.channelId ?? ''}
              onChange={(e) => onFieldChange('channelId', e.target.value.trim() || null)}
              disabled={saving}
              className={inputClasses}
              placeholder="Channel ID for daily challenges"
            />
          </label>
          <label htmlFor="post-time-hh-mm" className="space-y-2">
            <span className="text-sm font-medium">Post Time (HH:MM)</span>
            <input
              id="post-time-hh-mm"
              type="text"
              value={draftConfig.challenges?.postTime ?? '09:00'}
              onChange={(e) => onFieldChange('postTime', e.target.value)}
              disabled={saving}
              className={inputClasses}
              placeholder="09:00"
            />
          </label>
          <label htmlFor="challenge-timezone" className="space-y-2 col-span-2">
            <span className="text-sm font-medium">Timezone</span>
            <input
              id="challenge-timezone"
              type="text"
              value={draftConfig.challenges?.timezone ?? 'America/New_York'}
              onChange={(e) => onFieldChange('timezone', e.target.value)}
              disabled={saving}
              className={inputClasses}
              placeholder="America/New_York"
            />
            <p className="text-xs text-muted-foreground">
              IANA timezone (e.g. America/Chicago, Europe/London)
            </p>
          </label>
        </div>
      </CardContent>
    </Card>
  );
}
