'use client';

import { useCallback } from 'react';
import { useConfigContext } from '@/components/dashboard/config-context';
import {
  inputClasses,
  parseNumberInput,
  selectNumericValueOnFocus,
} from '@/components/dashboard/config-editor-utils';
import { ChannelSelector } from '@/components/ui/channel-selector';
import { cn } from '@/lib/utils';
import { ToggleSwitch } from '../toggle-switch';
import { ConfigCategoryLayout } from './config-category-layout';

/**
 * Community Tools category — renders community command toggles and bot presence settings.
 */
export function CommunityToolsCategory() {
  const { draftConfig, saving, guildId, updateDraftConfig, activeTabId } = useConfigContext();

  const updateStarboardField = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => ({
        ...prev,
        starboard: { ...prev.starboard, [field]: value },
      }));
    },
    [updateDraftConfig],
  );

  if (!draftConfig) return null;
  if (!activeTabId) return null;

  let hasMasterToggle = false;
  let isCurrentFeatureEnabled = false;

  if (activeTabId === 'bot-status') {
    hasMasterToggle = true;
    isCurrentFeatureEnabled = draftConfig.botStatus?.enabled ?? true;
  } else if (activeTabId === 'starboard') {
    hasMasterToggle = true;
    isCurrentFeatureEnabled = draftConfig.starboard?.enabled ?? false;
  }

  const handleToggleCurrentFeature = (v: boolean) => {
    if (activeTabId === 'bot-status') {
      updateDraftConfig((prev) => ({
        ...prev,
        botStatus: { ...prev.botStatus, enabled: v },
      }));
    } else if (activeTabId === 'starboard') {
      updateStarboardField('enabled', v);
    }
  };

  return (
    <ConfigCategoryLayout
      featureId={activeTabId}
      toggle={
        hasMasterToggle
          ? {
              checked: isCurrentFeatureEnabled,
              onChange: handleToggleCurrentFeature,
              disabled: saving,
            }
          : null
      }
    >
      {/* Community Tools Layout */}
      {activeTabId === 'community-tools' && (
        <div className="space-y-6">
          <div className="p-4 sm:p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl space-y-4">
            <div className="mb-4 space-y-1">
              <h3 className="text-sm font-semibold tracking-wide text-foreground/90">
                Standard Commands
              </h3>
              <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider">
                Toggle availability of member-facing utility commands
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(
                [
                  {
                    key: 'help',
                    label: 'Help / FAQ',
                    desc: '/help command for knowledge base',
                  },
                  {
                    key: 'announce',
                    label: 'Announcements',
                    desc: '/announce for scheduled messages',
                  },
                  {
                    key: 'snippet',
                    label: 'Code Snippets',
                    desc: '/snippet for sharing code',
                  },
                  { key: 'poll', label: 'Polls', desc: '/poll for community voting' },
                  {
                    key: 'showcase',
                    label: 'Project Showcase',
                    desc: '/showcase to browse projects',
                  },
                  {
                    key: 'review',
                    label: 'Code Reviews',
                    desc: '/review for peer review requests',
                  },
                ] as const
              ).map(({ key, label, desc }) => (
                <div
                  key={key}
                  className="flex items-center justify-between p-4 rounded-2xl bg-muted/10 border border-border/40 hover:bg-muted/20 transition-colors"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-bold text-foreground/90">{label}</p>
                    <p className="text-[11px] text-muted-foreground/60 font-medium line-clamp-1">
                      {desc}
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={draftConfig[key]?.enabled ?? false}
                    onChange={(value) => {
                      updateDraftConfig((prev) => ({
                        ...prev,
                        [key]: { ...(prev[key] ?? {}), enabled: value },
                      }));
                    }}
                    disabled={saving}
                    label={label}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Starboard Layout */}
      {activeTabId === 'starboard' && (
        <div className="space-y-6">
          <div className="p-4 sm:p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl space-y-6">
            <div className="space-y-3">
              <label
                htmlFor="starboard-channel-id"
                className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1 block"
              >
                Target Channel
              </label>
              <ChannelSelector
                id="starboard-channel-id"
                guildId={guildId}
                selected={draftConfig.starboard?.channelId ? [draftConfig.starboard.channelId] : []}
                onChange={(selected) => updateStarboardField('channelId', selected[0] ?? '')}
                disabled={saving}
                placeholder="Select starboard channel"
                maxSelections={1}
                filter="text"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-3">
                <label
                  htmlFor="threshold"
                  className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1 block"
                >
                  Star Threshold
                </label>
                <input
                  id="threshold"
                  type="number"
                  min={1}
                  value={draftConfig.starboard?.threshold ?? 3}
                  onChange={(e) => {
                    const num = parseNumberInput(e.target.value, 1);
                    if (num !== undefined) updateStarboardField('threshold', num);
                  }}
                  onFocus={selectNumericValueOnFocus}
                  disabled={saving}
                  className={inputClasses}
                />
              </div>

              <div className="space-y-3">
                <label
                  htmlFor="emoji"
                  className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1 block"
                >
                  Watch Emoji
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="emoji"
                    type="text"
                    value={draftConfig.starboard?.emoji ?? '*'}
                    onChange={(e) => updateStarboardField('emoji', e.target.value)}
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      updateStarboardField('emoji', next === '✱' || next.length === 0 ? '*' : next);
                    }}
                    onFocus={(e) => e.target.select()}
                    disabled={saving}
                    className={inputClasses}
                    placeholder="*"
                  />
                  <button
                    type="button"
                    onClick={() => updateStarboardField('emoji', '*')}
                    disabled={saving}
                    className={`shrink-0 rounded-[12px] px-3 py-2 text-xs font-medium transition-colors border ${
                      draftConfig.starboard?.emoji === '*' || draftConfig.starboard?.emoji === '✱'
                        ? 'bg-primary/20 text-primary border-primary/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]'
                        : 'bg-muted/30 text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    Any ✱
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/10 border border-border/40 hover:bg-muted/20 transition-colors">
              <span className="text-sm font-bold text-foreground">Allow Self-Star</span>
              <ToggleSwitch
                checked={draftConfig.starboard?.selfStarAllowed ?? false}
                onChange={(v) => updateStarboardField('selfStarAllowed', v)}
                disabled={saving}
                label="Self-Star Allowed"
              />
            </div>

            <div className="space-y-3 pt-4 border-t border-border/40">
              <label
                htmlFor="ignored-channels"
                className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1 block"
              >
                Ignored Channels
              </label>
              <ChannelSelector
                id="ignored-channels"
                guildId={guildId}
                selected={(draftConfig.starboard?.ignoredChannels ?? []) as string[]}
                onChange={(selected) => updateStarboardField('ignoredChannels', selected)}
                disabled={saving}
                placeholder="Select ignored channels"
                filter="text"
              />
            </div>
          </div>
        </div>
      )}

      {/* Bot Presence Layout */}
      {activeTabId === 'bot-status' && (
        <div className="space-y-6">
          <div className="p-4 sm:p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl">
            <div className="mb-4 space-y-1">
              <h3 className="text-sm font-semibold tracking-wide text-foreground/90">Appearance</h3>
              <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider">
                Configure how the bot appears in the member list
              </p>
            </div>
            <div className="space-y-3">
              <label
                htmlFor="bot-status-value"
                className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1"
              >
                Presence Status
              </label>
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
                className={cn(inputClasses, 'bg-background/50 backdrop-blur-md')}
              >
                <option value="online">Online</option>
                <option value="idle">Idle</option>
                <option value="dnd">Do Not Disturb</option>
                <option value="invisible">Invisible</option>
              </select>
            </div>
          </div>

          <div className="p-4 sm:p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl space-y-6">
            <div className="mb-4 space-y-1">
              <h3 className="text-sm font-semibold tracking-wide text-foreground/90">
                Status Rotation
              </h3>
              <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider">
                Automatically cycle through configured messages
              </p>
            </div>

            <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/10 border border-border/40">
              <div className="space-y-0.5">
                <span className="text-sm font-bold text-foreground/90">Enable Rotation</span>
                <p className="text-[11px] text-muted-foreground/60 font-medium">
                  Rotate through presence messages.
                </p>
              </div>
              <ToggleSwitch
                checked={
                  draftConfig.botStatus?.rotation?.enabled ??
                  draftConfig.botStatus?.rotateIntervalMs != null
                }
                onChange={(value) => {
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
                label="Enable bot status rotation"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="bot-status-interval-minutes"
                className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1"
              >
                Rotation Interval (minutes)
              </label>
              <div className="relative md:max-w-xs">
                <input
                  id="bot-status-interval-minutes"
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={
                    draftConfig.botStatus?.rotation?.intervalMinutes ??
                    (draftConfig.botStatus?.rotateIntervalMs ?? 300000) / 60000
                  }
                  onChange={(event) => {
                    const num = parseNumberInput(event.target.value, 0.5);
                    if (num === undefined) return;
                    updateDraftConfig((prev) => ({
                      ...prev,
                      botStatus: {
                        ...prev.botStatus,
                        rotation: { ...prev.botStatus?.rotation, intervalMinutes: num },
                      },
                    }));
                  }}
                  onFocus={(e) => e.target.select()}
                  disabled={saving}
                  className={cn(inputClasses, 'pr-12')}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground/40">
                  MIN
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </ConfigCategoryLayout>
  );
}
