'use client';

import {
  DEFAULT_ACTIVITY_BADGES,
  inputClasses,
  parseNumberInput,
} from '@/components/dashboard/config-editor-utils';
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
  updateDraftConfig: (updater: (prev: GuildConfig) => GuildConfig) => void;
  activeCategoryId: ConfigCategoryId;
  visibleFeatureIds: Set<ConfigFeatureId>;
  forceOpenAdvancedFeatureId: ConfigFeatureId | null;
}

/**
 * Renders the Community settings UI as a set of feature-specific settings cards.
 *
 * Renders SettingsFeatureCard sections (Community Tools, Activity Badges, Reputation/XP, TL;DR & AFK,
 * Daily Coding Challenges, Github Activity Feed, Tickets) when a feature is visible and its category is active.
 * Controls are bound to `draftConfig` and updates are applied via `updateDraftConfig`; inputs are disabled while `saving` is true.
 *
 * @param draftConfig - Partial guild configuration used to populate control values
 * @param saving - When true, disable interactive inputs to prevent changes during persistence
 * @param guildId - Guild identifier passed to channel/role selectors
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

      {showFeature('bot-status') && activeCategoryId === 'community-tools' && (
        <SettingsFeatureCard
          featureId="bot-status"
          title="Bot Presence"
          description="Set bot presence and rotate status messages."
          enabled={draftConfig.botStatus?.enabled ?? true}
          onEnabledChange={(value) =>
            updateDraftConfig((prev) => ({
              ...prev,
              botStatus: { ...prev.botStatus, enabled: value },
            }))
          }
          disabled={saving}
          basicContent={
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="bot-status-value">Presence Status</Label>
                <select
                  id="bot-status-value"
                  value={draftConfig.botStatus?.status ?? 'online'}
                  onChange={(event) =>
                    updateDraftConfig((prev) => ({
                      ...prev,
                      botStatus: {
                        ...prev.botStatus,
                        status: event.target.value as 'online' | 'idle' | 'dnd' | 'invisible',
                      },
                    }))
                  }
                  disabled={saving}
                  className={inputClasses}
                >
                  <option value="online">Online</option>
                  <option value="idle">Idle</option>
                  <option value="dnd">Do Not Disturb</option>
                  <option value="invisible">Invisible</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Enable Rotation</p>
                  <p className="text-xs text-muted-foreground">
                    Rotate through configured presence messages.
                  </p>
                </div>
                <Switch
                  checked={
                    draftConfig.botStatus?.rotation?.enabled ??
                    draftConfig.botStatus?.rotateIntervalMs != null
                  }
                  onCheckedChange={(value) => {
                    updateDraftConfig((prev) => {
                      const legacyMs = prev.botStatus?.rotateIntervalMs;
                      const legacyMinutes = legacyMs != null ? legacyMs / 60000 : 5;
                      return {
                        ...prev,
                        botStatus: {
                          ...prev.botStatus,
                          rotation: {
                            ...prev.botStatus?.rotation,
                            enabled: value,
                            intervalMinutes: value
                              ? (prev.botStatus?.rotation?.intervalMinutes ?? legacyMinutes)
                              : prev.botStatus?.rotation?.intervalMinutes,
                          },
                        },
                      };
                    });
                  }}
                  disabled={saving}
                  aria-label="Enable bot status rotation"
                />
              </div>
            </div>
          }
          advancedContent={
            <div className="space-y-2">
              <Label htmlFor="bot-status-interval-minutes">Rotation Interval (minutes)</Label>
              <Input
                id="bot-status-interval-minutes"
                type="number"
                min={0.5}
                value={
                  draftConfig.botStatus?.rotation?.intervalMinutes ??
                  (draftConfig.botStatus?.rotateIntervalMs ?? 300000) / 60000
                }
                onChange={(event) => {
                  const num = parseNumberInput(event.target.value, 1);
                  if (num === undefined) return;
                  updateDraftConfig((prev) => ({
                    ...prev,
                    botStatus: {
                      ...prev.botStatus,
                      rotation: { ...prev.botStatus?.rotation, intervalMinutes: num },
                    },
                  }));
                }}
                disabled={saving}
              />
            </div>
          }
          forceOpenAdvanced={forceOpenAdvancedFeatureId === 'bot-status'}
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
              {(draftConfig.engagement?.activityBadges ?? DEFAULT_ACTIVITY_BADGES).map(
                (badge: Badge, index: number) => (
                  <div key={`badge-${index}`} className="flex items-center gap-2">
                    <Input
                      className="w-20"
                      type="number"
                      min={0}
                      value={badge.days ?? 0}
                      onChange={(event) => {
                        const badges = [
                          ...(draftConfig.engagement?.activityBadges ?? DEFAULT_ACTIVITY_BADGES),
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
                          ...(draftConfig.engagement?.activityBadges ?? DEFAULT_ACTIVITY_BADGES),
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
                          ...(draftConfig.engagement?.activityBadges ?? DEFAULT_ACTIVITY_BADGES),
                        ].filter((_, idx) => idx !== index);
                        updateDraftConfig((prev) => ({
                          ...prev,
                          engagement: { ...prev.engagement, activityBadges: badges },
                        }));
                      }}
                      disabled={
                        saving ||
                        (draftConfig.engagement?.activityBadges ?? DEFAULT_ACTIVITY_BADGES)
                          .length <= 1
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
                    ...(draftConfig.engagement?.activityBadges ?? DEFAULT_ACTIVITY_BADGES),
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
          description="Tune XP gain per message and cooldown between awards."
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              </div>
            </div>
          }
        />
      )}

      {showFeature('xp-level-actions') && activeCategoryId === 'onboarding-growth' && (
        <SettingsFeatureCard
          featureId="xp-level-actions"
          title="Level-Up Actions"
          description="Configure what happens when users reach specific XP levels — role rewards, stacking, and thresholds."
          enabled={draftConfig.xp?.enabled ?? false}
          onEnabledChange={(value) =>
            updateDraftConfig((prev) => ({
              ...prev,
              xp: { ...prev.xp, enabled: value },
            }))
          }
          disabled={saving}
          basicContent={
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Stack Roles</p>
                  <p className="text-xs text-muted-foreground">
                    When enabled, users keep all earned roles. When disabled, only the highest
                    earned role is kept.
                  </p>
                </div>
                <Switch
                  checked={draftConfig.xp?.roleRewards?.stackRoles ?? true}
                  onCheckedChange={(value) =>
                    updateDraftConfig((prev) => ({
                      ...prev,
                      xp: {
                        ...prev.xp,
                        roleRewards: { ...prev.xp?.roleRewards, stackRoles: value },
                      },
                    }))
                  }
                  disabled={saving}
                  aria-label="Toggle role stacking"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Remove on Level Down</p>
                  <p className="text-xs text-muted-foreground">
                    Remove earned roles when a user's XP is manually reduced below the required
                    level.
                  </p>
                </div>
                <Switch
                  checked={draftConfig.xp?.roleRewards?.removeOnLevelDown ?? false}
                  onCheckedChange={(value) =>
                    updateDraftConfig((prev) => ({
                      ...prev,
                      xp: {
                        ...prev.xp,
                        roleRewards: { ...prev.xp?.roleRewards, removeOnLevelDown: value },
                      },
                    }))
                  }
                  disabled={saving}
                  aria-label="Toggle remove on level down"
                />
              </div>
            </div>
          }
          advancedContent={
            <div className="space-y-4">
              <label htmlFor="xp-level-thresholds" className="space-y-2 block">
                <span className="text-sm font-medium">Level Thresholds (comma-separated)</span>
                <input
                  id="xp-level-thresholds"
                  type="text"
                  value={(
                    draftConfig.xp?.levelThresholds ?? [
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
                        xp: { ...prev.xp, levelThresholds: sorted },
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
              <p className="text-xs text-muted-foreground italic">
                Per-level actions and the full action builder are coming in a future update.
                Configure actions directly in config.json for now.
              </p>
            </div>
          }
          forceOpenAdvanced={forceOpenAdvancedFeatureId === 'xp-level-actions'}
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
            <div className="space-y-4">
              <label htmlFor="tldr-system-prompt" className="space-y-2">
                <span className="text-sm font-medium">System Prompt</span>
                <textarea
                  id="tldr-system-prompt"
                  value={draftConfig.tldr?.systemPrompt ?? ''}
                  onChange={(event) =>
                    updateDraftConfig((prev) => ({
                      ...prev,
                      tldr: { ...prev.tldr, systemPrompt: event.target.value },
                    }))
                  }
                  disabled={saving}
                  rows={4}
                  maxLength={4000}
                  className={`${inputClasses} min-h-[5rem] resize-y`}
                  placeholder="Summarize this Discord conversation. Extract: 1) Key topics discussed, 2) Decisions made, 3) Action items, 4) Notable links shared. Be concise."
                />
                <p className="text-xs text-muted-foreground">
                  Instructions sent to the AI when summarizing. Leave blank for the default prompt.
                </p>
              </label>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <label htmlFor="tldr-default-messages" className="space-y-2">
                  <span className="text-sm font-medium">Default Messages</span>
                  <input
                    id="tldr-default-messages"
                    type="number"
                    min={1}
                    max={200}
                    value={tldrDefaultMessages}
                    onChange={(event) => {
                      const value = parseNumberInput(event.target.value, 1, 200);
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
                    max={200}
                    value={tldrMaxMessages}
                    onChange={(event) => {
                      const value = parseNumberInput(event.target.value, 1, 200);
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
                    max={3600}
                    value={tldrCooldownSeconds}
                    onChange={(event) => {
                      const value = parseNumberInput(event.target.value, 0, 3600);
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
          title="Github Activity Feed"
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
                placeholder="Select Github feed channel"
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
