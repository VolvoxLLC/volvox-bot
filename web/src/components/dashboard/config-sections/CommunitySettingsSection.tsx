'use client';

import { SettingsFeatureCard } from '@/components/dashboard/config-workspace/settings-feature-card';
import type {
  ConfigCategoryId,
  ConfigFeatureId,
} from '@/components/dashboard/config-workspace/types';
import { Button } from '@/components/ui/button';
import { ChannelSelector } from '@/components/ui/channel-selector';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RoleSelector } from '@/components/ui/role-selector';
import { Switch } from '@/components/ui/switch';
import type { BotConfig, DeepPartial } from '@/types/config';

type GuildConfig = DeepPartial<BotConfig>;
type Badge = { days?: number; label?: string };

interface CommunitySettingsSectionProps {
  draftConfig: GuildConfig;
  saving: boolean;
  guildId: string;
  inputClasses: string;
  defaultActivityBadges: readonly { days: number; label: string }[];
  parseNumberInput: (raw: string, min?: number, max?: number) => number | undefined;
  updateDraftConfig: (updater: (prev: GuildConfig) => GuildConfig) => void;
  activeCategoryId: ConfigCategoryId;
  visibleFeatureIds: Set<ConfigFeatureId>;
  forceOpenAdvancedFeatureId: ConfigFeatureId | null;
}

/**
 * Renders the Community settings UI as a set of feature-specific settings cards.
 *
 * Renders SettingsFeatureCard sections (Community Tools, Activity Badges, Reputation/XP, TL;DR & AFK,
 * Daily Coding Challenges, GitHub Activity Feed, Tickets) when a feature is visible and its category is active.
 * Controls are bound to `draftConfig` and updates are applied via `updateDraftConfig`; inputs are disabled while `saving` is true.
 *
 * @param draftConfig - Partial guild configuration used to populate control values
 * @param saving - When true, disable interactive inputs to prevent changes during persistence
 * @param guildId - Guild identifier passed to channel/role selectors
 * @param inputClasses - CSS classes applied to native input elements
 * @param defaultActivityBadges - Default badge list used when engagement activity badges are not set
 * @param parseNumberInput - Helper to parse and validate numeric input values (may accept min/max)
 * @param updateDraftConfig - Functional updater used to immutably modify `draftConfig`
 * @param activeCategoryId - Currently active configuration category; only cards matching this category are rendered
 * @param visibleFeatureIds - Set of feature ids that are allowed to be shown
 * @param forceOpenAdvancedFeatureId - Feature id whose advanced panel should be forced open, or null
 * @returns A React fragment containing the community-related settings cards and their controls
 */
export function CommunitySettingsSection({
  draftConfig,
  saving,
  guildId,
  inputClasses,
  defaultActivityBadges,
  parseNumberInput,
  updateDraftConfig,
  activeCategoryId,
  visibleFeatureIds,
  forceOpenAdvancedFeatureId,
}: CommunitySettingsSectionProps) {
  const showFeature = (featureId: ConfigFeatureId) => visibleFeatureIds.has(featureId);

  const tldrDefaultMessages = draftConfig.tldr?.defaultMessages ?? 25;
  const tldrMaxMessages = draftConfig.tldr?.maxMessages ?? 100;
  const tldrCooldownSeconds = draftConfig.tldr?.cooldownSeconds ?? 30;

  return (
    <>
      {showFeature('community-tools') && activeCategoryId === 'community-tools' && (
        <SettingsFeatureCard
          featureId="community-tools"
          title="Community Tools"
          description="Enable or disable member-facing commands for this guild."
          basicContent={
            <div className="space-y-3">
              {(
                [
                  {
                    key: 'help',
                    label: 'Help / FAQ',
                    desc: '/help command for server knowledge base',
                  },
                  {
                    key: 'announce',
                    label: 'Announcements',
                    desc: '/announce for scheduled messages',
                  },
                  {
                    key: 'snippet',
                    label: 'Code Snippets',
                    desc: '/snippet for saving and sharing code',
                  },
                  { key: 'poll', label: 'Polls', desc: '/poll for community voting' },
                  {
                    key: 'showcase',
                    label: 'Project Showcase',
                    desc: '/showcase to submit, browse, and upvote projects',
                  },
                  {
                    key: 'review',
                    label: 'Code Reviews',
                    desc: '/review peer review requests with claim workflow',
                  },
                ] as const
              ).map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <Switch
                    checked={draftConfig[key]?.enabled ?? false}
                    onCheckedChange={(value) => {
                      updateDraftConfig((prev) => ({
                        ...prev,
                        [key]: { ...prev[key], enabled: value },
                      }));
                    }}
                    disabled={saving}
                    aria-label={`Toggle ${label}`}
                  />
                </div>
              ))}
            </div>
          }
          advancedContent={
            <p className="text-xs text-muted-foreground">
              Advanced command-level policies are managed in command modules and permission rules.
            </p>
          }
          forceOpenAdvanced={forceOpenAdvancedFeatureId === 'community-tools'}
        />
      )}

      {showFeature('engagement') && activeCategoryId === 'onboarding-growth' && (
        <SettingsFeatureCard
          featureId="engagement"
          title="Activity Badges"
          description="Configure profile activity tiers and engagement tracking behavior."
          enabled={draftConfig.engagement?.enabled ?? false}
          onEnabledChange={(value) =>
            updateDraftConfig((prev) => ({
              ...prev,
              engagement: { ...prev.engagement, enabled: value },
            }))
          }
          disabled={saving}
          basicContent={
            <div className="space-y-3">
              {(draftConfig.engagement?.activityBadges ?? defaultActivityBadges).map(
                (badge: Badge, index: number) => (
                  <div key={`badge-${index}`} className="flex items-center gap-2">
                    <Input
                      className="w-20"
                      type="number"
                      min={0}
                      value={badge.days ?? 0}
                      onChange={(event) => {
                        const badges = [
                          ...(draftConfig.engagement?.activityBadges ?? defaultActivityBadges),
                        ];
                        badges[index] = {
                          ...badges[index],
                          days: Math.max(0, parseInt(event.target.value, 10) || 0),
                        };
                        updateDraftConfig((prev) => ({
                          ...prev,
                          engagement: { ...prev.engagement, activityBadges: badges },
                        }));
                      }}
                      disabled={saving}
                    />
                    <span className="text-xs text-muted-foreground">days →</span>
                    <Input
                      className="flex-1"
                      value={badge.label ?? ''}
                      onChange={(event) => {
                        const badges = [
                          ...(draftConfig.engagement?.activityBadges ?? defaultActivityBadges),
                        ];
                        badges[index] = { ...badges[index], label: event.target.value };
                        updateDraftConfig((prev) => ({
                          ...prev,
                          engagement: { ...prev.engagement, activityBadges: badges },
                        }));
                      }}
                      disabled={saving}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const badges = [
                          ...(draftConfig.engagement?.activityBadges ?? defaultActivityBadges),
                        ].filter((_, idx) => idx !== index);
                        updateDraftConfig((prev) => ({
                          ...prev,
                          engagement: { ...prev.engagement, activityBadges: badges },
                        }));
                      }}
                      disabled={
                        saving ||
                        (draftConfig.engagement?.activityBadges ?? defaultActivityBadges).length <=
                          1
                      }
                    >
                      ✕
                    </Button>
                  </div>
                ),
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const badges = [
                    ...(draftConfig.engagement?.activityBadges ?? defaultActivityBadges),
                    { days: 0, label: 'New Badge' },
                  ];
                  updateDraftConfig((prev) => ({
                    ...prev,
                    engagement: { ...prev.engagement, activityBadges: badges },
                  }));
                }}
                disabled={saving}
              >
                + Add Badge
              </Button>
            </div>
          }
          advancedContent={
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="track-messages" className="text-sm text-muted-foreground">
                  Track messages
                </Label>
                <Switch
                  id="track-messages"
                  checked={draftConfig.engagement?.trackMessages ?? true}
                  onCheckedChange={(value) =>
                    updateDraftConfig((prev) => ({
                      ...prev,
                      engagement: { ...prev.engagement, trackMessages: value },
                    }))
                  }
                  disabled={saving}
                  aria-label="Track messages"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="track-reactions" className="text-sm text-muted-foreground">
                  Track reactions
                </Label>
                <Switch
                  id="track-reactions"
                  checked={draftConfig.engagement?.trackReactions ?? true}
                  onCheckedChange={(value) =>
                    updateDraftConfig((prev) => ({
                      ...prev,
                      engagement: { ...prev.engagement, trackReactions: value },
                    }))
                  }
                  disabled={saving}
                  aria-label="Track reactions"
                />
              </div>
            </div>
          }
          forceOpenAdvanced={forceOpenAdvancedFeatureId === 'engagement'}
        />
      )}

      {showFeature('reputation') && activeCategoryId === 'onboarding-growth' && (
        <SettingsFeatureCard
          featureId="reputation"
          title="Reputation / XP"
          description="Tune XP ranges, cooldowns, and progression thresholds."
          enabled={draftConfig.reputation?.enabled ?? false}
          onEnabledChange={(value) =>
            updateDraftConfig((prev) => ({
              ...prev,
              reputation: { ...prev.reputation, enabled: value },
            }))
          }
          disabled={saving}
          basicContent={
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <label htmlFor="xp-per-message-min" className="space-y-2">
                  <span className="text-sm font-medium">XP per Message (min)</span>
                  <input
                    id="xp-per-message-min"
                    type="number"
                    min={1}
                    max={100}
                    value={draftConfig.reputation?.xpPerMessage?.[0] ?? 5}
                    onChange={(event) => {
                      const num = parseNumberInput(event.target.value, 1, 100);
                      if (num !== undefined) {
                        const range = draftConfig.reputation?.xpPerMessage ?? [5, 15];
                        const newMax = num > range[1] ? num : range[1];
                        updateDraftConfig((prev) => ({
                          ...prev,
                          reputation: { ...prev.reputation, xpPerMessage: [num, newMax] },
                        }));
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
                    value={draftConfig.reputation?.xpPerMessage?.[1] ?? 15}
                    onChange={(event) => {
                      const num = parseNumberInput(event.target.value, 1, 100);
                      if (num !== undefined) {
                        const range = draftConfig.reputation?.xpPerMessage ?? [5, 15];
                        const newMin = num < range[0] ? num : range[0];
                        updateDraftConfig((prev) => ({
                          ...prev,
                          reputation: { ...prev.reputation, xpPerMessage: [newMin, num] },
                        }));
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
                    onChange={(event) => {
                      const num = parseNumberInput(event.target.value, 0);
                      if (num !== undefined)
                        updateDraftConfig((prev) => ({
                          ...prev,
                          reputation: { ...prev.reputation, xpCooldownSeconds: num },
                        }));
                    }}
                    disabled={saving}
                    className={inputClasses}
                  />
                </label>
                <label htmlFor="announce-channel-id" className="space-y-2">
                  <span className="text-sm font-medium">Announce Channel ID</span>
                  <ChannelSelector
                    id="announce-channel-id"
                    guildId={guildId}
                    selected={
                      draftConfig.reputation?.announceChannelId
                        ? [draftConfig.reputation.announceChannelId]
                        : []
                    }
                    onChange={(selected) =>
                      updateDraftConfig((prev) => ({
                        ...prev,
                        reputation: {
                          ...prev.reputation,
                          announceChannelId: selected[0] ?? null,
                        },
                      }))
                    }
                    disabled={saving}
                    placeholder="Select announcement channel"
                    maxSelections={1}
                    filter="text"
                  />
                </label>
              </div>
            </div>
          }
          advancedContent={
            <label htmlFor="level-thresholds-comma-separated" className="space-y-2 block">
              <span className="text-sm font-medium">Level Thresholds (comma-separated)</span>
              <input
                id="level-thresholds-comma-separated"
                type="text"
                value={(
                  draftConfig.reputation?.levelThresholds ?? [
                    100, 300, 600, 1000, 1500, 2500, 4000, 6000, 8500, 12000,
                  ]
                ).join(', ')}
                onChange={(event) => {
                  const nums = event.target.value
                    .split(',')
                    .map((value) => Number(value.trim()))
                    .filter((value) => Number.isFinite(value) && value > 0);
                  if (nums.length > 0) {
                    const sorted = [...nums].sort((a, b) => a - b);
                    updateDraftConfig((prev) => ({
                      ...prev,
                      reputation: { ...prev.reputation, levelThresholds: sorted },
                    }));
                  }
                }}
                disabled={saving}
                className={inputClasses}
                placeholder="100, 300, 600, 1000"
              />
              <p className="text-xs text-muted-foreground">
                XP required for each level (L1, L2, L3...).
              </p>
            </label>
          }
          forceOpenAdvanced={forceOpenAdvancedFeatureId === 'reputation'}
        />
      )}

      {showFeature('tldr-afk') && activeCategoryId === 'onboarding-growth' && (
        <SettingsFeatureCard
          featureId="tldr-afk"
          title="TL;DR & AFK"
          description="Quick toggles for summary and away-state features."
          basicContent={
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">TL;DR Summaries</p>
                  <p className="text-xs text-muted-foreground">Enable `/tldr` channel summaries.</p>
                </div>
                <Switch
                  checked={draftConfig.tldr?.enabled ?? false}
                  onCheckedChange={(value) =>
                    updateDraftConfig((prev) => ({
                      ...prev,
                      tldr: { ...prev.tldr, enabled: value },
                    }))
                  }
                  disabled={saving}
                  aria-label="Toggle TL;DR summaries"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">AFK System</p>
                  <p className="text-xs text-muted-foreground">Enable `/afk` away responses.</p>
                </div>
                <Switch
                  checked={draftConfig.afk?.enabled ?? false}
                  onCheckedChange={(value) =>
                    updateDraftConfig((prev) => ({
                      ...prev,
                      afk: { ...prev.afk, enabled: value },
                    }))
                  }
                  disabled={saving}
                  aria-label="Toggle AFK system"
                />
              </div>
            </div>
          }
          advancedContent={
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <label htmlFor="tldr-default-messages" className="space-y-2">
                <span className="text-sm font-medium">Default Messages</span>
                <input
                  id="tldr-default-messages"
                  type="number"
                  min={1}
                  value={tldrDefaultMessages}
                  onChange={(event) => {
                    const value = parseNumberInput(event.target.value, 1);
                    if (value === undefined) return;
                    updateDraftConfig((prev) => ({
                      ...prev,
                      tldr: { ...prev.tldr, defaultMessages: value },
                    }));
                  }}
                  disabled={saving}
                  className={inputClasses}
                />
              </label>
              <label htmlFor="tldr-max-messages" className="space-y-2">
                <span className="text-sm font-medium">Max Messages</span>
                <input
                  id="tldr-max-messages"
                  type="number"
                  min={1}
                  value={tldrMaxMessages}
                  onChange={(event) => {
                    const value = parseNumberInput(event.target.value, 1);
                    if (value === undefined) return;
                    updateDraftConfig((prev) => ({
                      ...prev,
                      tldr: { ...prev.tldr, maxMessages: value },
                    }));
                  }}
                  disabled={saving}
                  className={inputClasses}
                />
              </label>
              <label htmlFor="tldr-cooldown" className="space-y-2">
                <span className="text-sm font-medium">Cooldown (seconds)</span>
                <input
                  id="tldr-cooldown"
                  type="number"
                  min={0}
                  value={tldrCooldownSeconds}
                  onChange={(event) => {
                    const value = parseNumberInput(event.target.value, 0);
                    if (value === undefined) return;
                    updateDraftConfig((prev) => ({
                      ...prev,
                      tldr: { ...prev.tldr, cooldownSeconds: value },
                    }));
                  }}
                  disabled={saving}
                  className={inputClasses}
                />
              </label>
            </div>
          }
          forceOpenAdvanced={forceOpenAdvancedFeatureId === 'tldr-afk'}
        />
      )}

      {showFeature('challenges') && activeCategoryId === 'onboarding-growth' && (
        <SettingsFeatureCard
          featureId="challenges"
          title="Daily Coding Challenges"
          description="Auto-post a daily challenge with solve tracking."
          enabled={draftConfig.challenges?.enabled ?? false}
          onEnabledChange={(value) =>
            updateDraftConfig((prev) => ({
              ...prev,
              challenges: { ...prev.challenges, enabled: value },
            }))
          }
          disabled={saving}
          basicContent={
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label htmlFor="challenge-channel-id" className="space-y-2">
                <span className="text-sm font-medium">Challenge Channel ID</span>
                <ChannelSelector
                  id="challenge-channel-id"
                  guildId={guildId}
                  selected={
                    draftConfig.challenges?.channelId ? [draftConfig.challenges.channelId] : []
                  }
                  onChange={(selected) =>
                    updateDraftConfig((prev) => ({
                      ...prev,
                      challenges: {
                        ...prev.challenges,
                        channelId: selected[0] ?? null,
                      },
                    }))
                  }
                  disabled={saving}
                  placeholder="Select challenges channel"
                  maxSelections={1}
                  filter="text"
                />
              </label>
              <label htmlFor="post-time-hh-mm" className="space-y-2">
                <span className="text-sm font-medium">Post Time (HH:MM)</span>
                <input
                  id="post-time-hh-mm"
                  type="text"
                  value={draftConfig.challenges?.postTime ?? '09:00'}
                  onChange={(event) =>
                    updateDraftConfig((prev) => ({
                      ...prev,
                      challenges: { ...prev.challenges, postTime: event.target.value },
                    }))
                  }
                  disabled={saving}
                  className={inputClasses}
                  placeholder="09:00"
                />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm font-medium">Timezone</span>
                <input
                  type="text"
                  value={draftConfig.challenges?.timezone ?? 'America/New_York'}
                  onChange={(event) =>
                    updateDraftConfig((prev) => ({
                      ...prev,
                      challenges: { ...prev.challenges, timezone: event.target.value },
                    }))
                  }
                  disabled={saving}
                  className={inputClasses}
                  placeholder="America/New_York"
                />
                <p className="text-xs text-muted-foreground">
                  IANA timezone (e.g. America/Chicago, Europe/London)
                </p>
              </label>
            </div>
          }
          advancedContent={
            <p className="text-xs text-muted-foreground">
              Challenge content generation strategy is configured in scheduler/service modules.
            </p>
          }
          forceOpenAdvanced={forceOpenAdvancedFeatureId === 'challenges'}
        />
      )}

      {showFeature('github-feed') && activeCategoryId === 'support-integrations' && (
        <SettingsFeatureCard
          featureId="github-feed"
          title="GitHub Activity Feed"
          description="Post repository updates into a Discord channel."
          enabled={draftConfig.github?.feed?.enabled ?? false}
          onEnabledChange={(value) =>
            updateDraftConfig((prev) => ({
              ...prev,
              github: { ...prev.github, feed: { ...prev.github?.feed, enabled: value } },
            }))
          }
          disabled={saving}
          basicContent={
            <label htmlFor="feed-channel-id" className="space-y-2 block">
              <span className="text-sm font-medium">Feed Channel ID</span>
              <ChannelSelector
                id="feed-channel-id"
                guildId={guildId}
                selected={
                  draftConfig.github?.feed?.channelId ? [draftConfig.github.feed.channelId] : []
                }
                onChange={(selected) =>
                  updateDraftConfig((prev) => ({
                    ...prev,
                    github: {
                      ...prev.github,
                      feed: { ...prev.github?.feed, channelId: selected[0] ?? null },
                    },
                  }))
                }
                disabled={saving}
                placeholder="Select GitHub feed channel"
                maxSelections={1}
                filter="text"
              />
            </label>
          }
          advancedContent={
            <label htmlFor="poll-interval-minutes" className="space-y-2 block">
              <span className="text-sm font-medium">Poll Interval (minutes)</span>
              <input
                id="poll-interval-minutes"
                type="number"
                min={1}
                value={draftConfig.github?.feed?.pollIntervalMinutes ?? 5}
                onChange={(event) => {
                  const value = parseNumberInput(event.target.value, 1);
                  if (value !== undefined) {
                    updateDraftConfig((prev) => ({
                      ...prev,
                      github: {
                        ...prev.github,
                        feed: { ...prev.github?.feed, pollIntervalMinutes: value },
                      },
                    }));
                  }
                }}
                disabled={saving}
                className={inputClasses}
              />
            </label>
          }
          forceOpenAdvanced={forceOpenAdvancedFeatureId === 'github-feed'}
        />
      )}

      {showFeature('tickets') && activeCategoryId === 'support-integrations' && (
        <SettingsFeatureCard
          featureId="tickets"
          title="Tickets"
          description="Configure support ticket routing and lifecycle limits."
          enabled={draftConfig.tickets?.enabled ?? false}
          onEnabledChange={(value) =>
            updateDraftConfig((prev) => ({
              ...prev,
              tickets: { ...prev.tickets, enabled: value },
            }))
          }
          disabled={saving}
          basicContent={
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label htmlFor="ticket-mode" className="space-y-2 md:col-span-2">
                <span className="text-sm font-medium">Ticket Mode</span>
                <select
                  id="ticket-mode"
                  value={draftConfig.tickets?.mode ?? 'thread'}
                  onChange={(event) =>
                    updateDraftConfig((prev) => ({
                      ...prev,
                      tickets: {
                        ...prev.tickets,
                        mode: event.target.value as 'thread' | 'channel',
                      },
                    }))
                  }
                  disabled={saving}
                  className={inputClasses}
                >
                  <option value="thread">Thread (private thread per ticket)</option>
                  <option value="channel">Channel (dedicated text channel per ticket)</option>
                </select>
              </label>

              <label htmlFor="support-role-id" className="space-y-2">
                <span className="text-sm font-medium">Support Role ID</span>
                <RoleSelector
                  id="support-role-id"
                  guildId={guildId}
                  selected={
                    draftConfig.tickets?.supportRole ? [draftConfig.tickets.supportRole] : []
                  }
                  onChange={(selected) =>
                    updateDraftConfig((prev) => ({
                      ...prev,
                      tickets: { ...prev.tickets, supportRole: selected[0] ?? null },
                    }))
                  }
                  disabled={saving}
                  placeholder="Select support role"
                  maxSelections={1}
                />
              </label>
              <label htmlFor="category-channel-id" className="space-y-2">
                <span className="text-sm font-medium">Category Channel ID</span>
                <ChannelSelector
                  id="category-channel-id"
                  guildId={guildId}
                  selected={draftConfig.tickets?.category ? [draftConfig.tickets.category] : []}
                  onChange={(selected) =>
                    updateDraftConfig((prev) => ({
                      ...prev,
                      tickets: { ...prev.tickets, category: selected[0] ?? null },
                    }))
                  }
                  disabled={saving}
                  placeholder="Select ticket category"
                  maxSelections={1}
                  filter="all"
                />
              </label>
            </div>
          }
          advancedContent={
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label htmlFor="auto-close-hours" className="space-y-2">
                <span className="text-sm font-medium">Auto-Close Hours</span>
                <input
                  id="auto-close-hours"
                  type="number"
                  min="1"
                  max="720"
                  value={draftConfig.tickets?.autoCloseHours ?? 48}
                  onChange={(event) => {
                    const value = parseNumberInput(event.target.value, 1, 720);
                    if (value !== undefined) {
                      updateDraftConfig((prev) => ({
                        ...prev,
                        tickets: { ...prev.tickets, autoCloseHours: value },
                      }));
                    }
                  }}
                  disabled={saving}
                  className={inputClasses}
                />
              </label>
              <label htmlFor="max-open-per-user" className="space-y-2">
                <span className="text-sm font-medium">Max Open Per User</span>
                <input
                  id="max-open-per-user"
                  type="number"
                  min="1"
                  max="20"
                  value={draftConfig.tickets?.maxOpenPerUser ?? 3}
                  onChange={(event) => {
                    const value = parseNumberInput(event.target.value, 1, 20);
                    if (value !== undefined) {
                      updateDraftConfig((prev) => ({
                        ...prev,
                        tickets: { ...prev.tickets, maxOpenPerUser: value },
                      }));
                    }
                  }}
                  disabled={saving}
                  className={inputClasses}
                />
              </label>
              <label htmlFor="transcript-channel-id" className="space-y-2 md:col-span-2">
                <span className="text-sm font-medium">Transcript Channel ID</span>
                <ChannelSelector
                  id="transcript-channel-id"
                  guildId={guildId}
                  selected={
                    draftConfig.tickets?.transcriptChannel
                      ? [draftConfig.tickets.transcriptChannel]
                      : []
                  }
                  onChange={(selected) =>
                    updateDraftConfig((prev) => ({
                      ...prev,
                      tickets: {
                        ...prev.tickets,
                        transcriptChannel: selected[0] ?? null,
                      },
                    }))
                  }
                  disabled={saving}
                  placeholder="Select transcript channel"
                  maxSelections={1}
                  filter="text"
                />
              </label>
            </div>
          }
          forceOpenAdvanced={forceOpenAdvancedFeatureId === 'tickets'}
        />
      )}
    </>
  );
}
