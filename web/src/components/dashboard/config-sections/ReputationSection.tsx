'use client';

import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { parseNumberInput } from '@/lib/config-normalization';
import type { GuildConfig } from '@/lib/config-utils';
import { ToggleSwitch } from '../toggle-switch';

interface ReputationSectionProps {
  draftConfig: GuildConfig;
  saving: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onFieldChange: (field: string, value: unknown) => void;
}

/** Shared input styling for text inputs. */
const inputClasses =
  'w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

const DEFAULT_LEVEL_THRESHOLDS = [100, 300, 600, 1000, 1500, 2500, 4000, 6000, 8500, 12000];

/**
 * Reputation / XP configuration section.
 *
 * Provides controls for XP settings, cooldowns, level thresholds, and announcements.
 */
export function ReputationSection({
  draftConfig,
  saving,
  onEnabledChange,
  onFieldChange,
}: ReputationSectionProps) {
  const xpRange = draftConfig.reputation?.xpPerMessage ?? [5, 15];
  const levelThresholds = draftConfig.reputation?.levelThresholds ?? DEFAULT_LEVEL_THRESHOLDS;

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Reputation / XP</CardTitle>
          <ToggleSwitch
            checked={draftConfig.reputation?.enabled ?? false}
            onChange={onEnabledChange}
            disabled={saving}
            label="Reputation"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <label htmlFor="xp-per-message-min" className="space-y-2">
            <span className="text-sm font-medium">XP per Message (min)</span>
            <input
              id="xp-per-message-min"
              type="number"
              min={1}
              max={100}
              value={xpRange[0] ?? 5}
              onChange={(e) => {
                const num = parseNumberInput(e.target.value, 1, 100);
                if (num !== undefined) {
                  const newMax = num > (xpRange[1] ?? 15) ? num : (xpRange[1] ?? 15);
                  onFieldChange('xpPerMessage', [num, newMax]);
                }
              }}
              disabled={saving}
              className={inputClasses}
            />
          </label>
          <label htmlFor="xp-per-message-max" className="space-y-2">
            <span className="text-sm font-medium">XP per Message (max)</span>
            <input
              id="xp-per-message-max"
              type="number"
              min={1}
              max={100}
              value={xpRange[1] ?? 15}
              onChange={(e) => {
                const num = parseNumberInput(e.target.value, 1, 100);
                if (num !== undefined) {
                  const newMin = num < (xpRange[0] ?? 5) ? num : (xpRange[0] ?? 5);
                  onFieldChange('xpPerMessage', [newMin, num]);
                }
              }}
              disabled={saving}
              className={inputClasses}
            />
          </label>
          <label htmlFor="xp-cooldown-seconds" className="space-y-2">
            <span className="text-sm font-medium">XP Cooldown (seconds)</span>
            <input
              id="xp-cooldown-seconds"
              type="number"
              min={0}
              value={draftConfig.reputation?.xpCooldownSeconds ?? 60}
              onChange={(e) => {
                const num = parseNumberInput(e.target.value, 0);
                if (num !== undefined) onFieldChange('xpCooldownSeconds', num);
              }}
              disabled={saving}
              className={inputClasses}
            />
          </label>
          <label htmlFor="announce-channel-id" className="space-y-2">
            <span className="text-sm font-medium">Announce Channel ID</span>
            <input
              id="announce-channel-id"
              type="text"
              value={draftConfig.reputation?.announceChannelId ?? ''}
              onChange={(e) => onFieldChange('announceChannelId', e.target.value.trim() || null)}
              disabled={saving}
              className={inputClasses}
              placeholder="Channel ID for level-up announcements"
            />
          </label>
        </div>
        <label htmlFor="level-thresholds-comma-separated" className="space-y-2">
          <span className="text-sm font-medium">Level Thresholds (comma-separated XP values)</span>
          <input
            id="level-thresholds-comma-separated"
            type="text"
            value={levelThresholds.join(', ')}
            onChange={(e) => {
              const nums = e.target.value
                .split(',')
                .map((s) => Number(s.trim()))
                .filter((n) => Number.isFinite(n) && n > 0);
              if (nums.length > 0) {
                const sorted = [...nums].sort((a, b) => a - b);
                onFieldChange('levelThresholds', sorted);
              }
            }}
            disabled={saving}
            className={inputClasses}
            placeholder="100, 300, 600, 1000, ..."
          />
          <p className="text-xs text-muted-foreground">
            XP required for each level (L1, L2, L3, ...). Add more values for more levels.
          </p>
        </label>
      </CardContent>
    </Card>
  );
}
