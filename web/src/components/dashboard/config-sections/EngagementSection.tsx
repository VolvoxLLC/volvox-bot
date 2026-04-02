'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { GuildConfig } from '@/lib/config-utils';

interface EngagementSectionProps {
  draftConfig: GuildConfig;
  saving: boolean;
  onActivityBadgesChange: (badges: Array<{ days?: number; label?: string }>) => void;
}

const DEFAULT_ACTIVITY_BADGES = [
  { days: 90, label: '👑 Legend' },
  { days: 30, label: '🌳 Veteran' },
  { days: 7, label: '🌿 Regular' },
  { days: 0, label: '🌱 Newcomer' },
] as const;

/**
 * Engagement / Activity Badges configuration section.
 *
 * Provides controls for configuring badge tiers shown on /profile.
 */
export function EngagementSection({
  draftConfig,
  saving,
  onActivityBadgesChange,
}: EngagementSectionProps) {
  const badges = draftConfig.engagement?.activityBadges ?? [...DEFAULT_ACTIVITY_BADGES];

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <CardTitle className="text-base">Activity Badges</CardTitle>
        <p className="text-xs text-muted-foreground">
          Configure the badge tiers shown on /profile. Each badge requires a minimum number of
          active days.
        </p>
        {badges.map((badge, i) => (
          <div
            key={`badge-row-${badge.days ?? 0}-${badge.label ?? 'empty'}`}
            className="flex items-center gap-2"
          >
            <Input
              className="w-20"
              type="number"
              min={0}
              value={badge.days ?? 0}
              onChange={(e) => {
                const newBadges = [...badges];
                newBadges[i] = {
                  ...newBadges[i],
                  days: Math.max(0, parseInt(e.target.value, 10) || 0),
                };
                onActivityBadgesChange(newBadges);
              }}
              disabled={saving}
              aria-label={`Badge ${i + 1} minimum active days`}
            />
            <span className="text-xs text-muted-foreground">days →</span>
            <Input
              className="flex-1"
              value={badge.label ?? ''}
              onChange={(e) => {
                const newBadges = [...badges];
                newBadges[i] = { ...newBadges[i], label: e.target.value };
                onActivityBadgesChange(newBadges);
              }}
              disabled={saving}
              aria-label={`Badge ${i + 1} label`}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const newBadges = badges.filter((_, idx) => idx !== i);
                onActivityBadgesChange(newBadges);
              }}
              disabled={saving || badges.length <= 1}
              aria-label={`Remove badge ${badge.label ?? i + 1}`}
            >
              ✕
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const newBadges = [...badges, { days: 0, label: '🌟 New Badge' }];
            onActivityBadgesChange(newBadges);
          }}
          disabled={saving}
        >
          + Add Badge
        </Button>
      </CardContent>
    </Card>
  );
}
