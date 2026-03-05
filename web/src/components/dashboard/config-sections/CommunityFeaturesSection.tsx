'use client';

import { Card, CardContent, CardTitle } from '@/components/ui/card';
import type { GuildConfig } from '@/lib/config-utils';
import { ToggleSwitch } from '../toggle-switch';

interface CommunityFeaturesSectionProps {
  draftConfig: GuildConfig;
  saving: boolean;
  onToggleChange: (key: string, enabled: boolean) => void;
}

const COMMUNITY_FEATURES = [
  { key: 'help', label: 'Help / FAQ', desc: '/help command for server knowledge base' },
  { key: 'announce', label: 'Announcements', desc: '/announce for scheduled messages' },
  { key: 'snippet', label: 'Code Snippets', desc: '/snippet for saving and sharing code' },
  { key: 'poll', label: 'Polls', desc: '/poll for community voting' },
  {
    key: 'showcase',
    label: 'Project Showcase',
    desc: '/showcase to submit, browse, and upvote projects',
  },
  {
    key: 'review',
    label: 'Code Reviews',
    desc: '/review peer code review requests with claim workflow',
  },
  { key: 'tldr', label: 'TL;DR Summaries', desc: '/tldr for AI channel summaries' },
  { key: 'afk', label: 'AFK System', desc: '/afk auto-respond when members are away' },
  {
    key: 'engagement',
    label: 'Engagement Tracking',
    desc: '/profile stats — messages, reactions, days active',
  },
] as const;

/**
 * Render the Community Features configuration card with a toggle for each feature.
 *
 * Renders a titled card that lists community feature entries and a switch for enabling or disabling each feature for a guild.
 *
 * @param draftConfig - Guild draft configuration used to read each feature's `enabled` state (defaults to `false` when missing)
 * @param saving - When `true`, all toggles are disabled to prevent user interaction during save
 * @param onToggleChange - Callback invoked with the feature key and the new enabled state when a toggle changes
 * @returns The JSX element for the Community Features configuration section
 */
export function CommunityFeaturesSection({
  draftConfig,
  saving,
  onToggleChange,
}: CommunityFeaturesSectionProps) {
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Community Features</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">
          Enable or disable community commands per guild.
        </p>
        {COMMUNITY_FEATURES.map(({ key, label, desc }) => (
          <div key={key} className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium">{label}</span>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
            <ToggleSwitch
              checked={
                (draftConfig[key as keyof GuildConfig] as { enabled?: boolean } | undefined)
                  ?.enabled ?? false
              }
              onChange={(v) => onToggleChange(key, v)}
              disabled={saving}
              label={label}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
