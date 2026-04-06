'use client';

import { Activity, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useConfigContext } from '@/components/dashboard/config-context';
import { inputClasses, parseNumberInput } from '@/components/dashboard/config-editor-utils';
import type { ConfigFeatureId } from '@/components/dashboard/config-workspace/types';
import { cn } from '@/lib/utils';
import { ToggleSwitch } from '../toggle-switch';
import { ConfigCategoryLayout } from './config-category-layout';

/**
 * Community Tools category — renders community command toggles and bot presence settings.
 */
export function CommunityToolsCategory() {
  const { draftConfig, saving, updateDraftConfig, activeTabId } = useConfigContext();

  if (!draftConfig) return null;
  const activeTab = activeTabId;
  if (!activeTab) return null;

  let hasMasterToggle = false;
  let isCurrentFeatureEnabled = false;

  if (activeTab === 'bot-status') {
    hasMasterToggle = true;
    isCurrentFeatureEnabled = draftConfig.botStatus?.enabled ?? true;
  }

  const handleToggleCurrentFeature = (v: boolean) => {
    if (activeTab === 'bot-status') {
      updateDraftConfig((prev) => ({
        ...prev,
        botStatus: { ...prev.botStatus, enabled: v },
      }));
    }
  };

  return (
    <ConfigCategoryLayout
      featureId={activeTab}
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
      {activeTab === 'community-tools' && (
        <div className="space-y-6">
          <div className="p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl space-y-4">
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
                        [key]: { ...prev[key], enabled: value },
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

      {/* Bot Presence Layout */}
      {activeTab === 'bot-status' && (
        <div className="space-y-6">
          <div className="p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl">
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

          <div className="p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl space-y-6">
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
