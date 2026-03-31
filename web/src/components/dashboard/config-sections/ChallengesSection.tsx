'use client';

import { useState } from 'react';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import type { GuildConfig } from '@/lib/config-utils';
import { ToggleSwitch } from '../toggle-switch';
import { inputClasses } from './shared';

interface ChallengesSectionProps {
  draftConfig: GuildConfig;
  saving: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onFieldChange: (field: string, value: unknown) => void;
}

const isValidTimezone = (tz: string) => {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

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
  const currentTimezone = draftConfig.challenges?.timezone ?? 'America/New_York';
  const [timezoneError, setTimezoneError] = useState<string | null>(null);

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
            <span className="text-sm font-medium">Post Time</span>
            <input
              id="post-time-hh-mm"
              type="time"
              value={draftConfig.challenges?.postTime ?? '09:00'}
              onChange={(e) => onFieldChange('postTime', e.target.value)}
              disabled={saving}
              className={inputClasses}
            />
          </label>
          <label htmlFor="challenge-timezone" className="space-y-2 col-span-2">
            <span className="text-sm font-medium">Timezone</span>
            <input
              id="challenge-timezone"
              type="text"
              value={currentTimezone}
              onChange={(e) => {
                const tz = e.target.value;
                onFieldChange('timezone', tz);
                if (tz && !isValidTimezone(tz)) {
                  setTimezoneError(`"${tz}" is not a valid IANA timezone`);
                } else {
                  setTimezoneError(null);
                }
              }}
              disabled={saving}
              className={inputClasses}
              placeholder="America/New_York"
            />
            {timezoneError ? (
              <p className="text-xs text-destructive">{timezoneError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                IANA timezone (e.g. America/Chicago, Europe/London)
              </p>
            )}
          </label>
        </div>
      </CardContent>
    </Card>
  );
}
