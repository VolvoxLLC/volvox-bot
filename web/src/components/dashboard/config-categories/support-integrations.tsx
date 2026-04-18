'use client';

import { useConfigContext } from '@/components/dashboard/config-context';
import { inputClasses, parseNumberInput } from '@/components/dashboard/config-editor-utils';
import { ChannelSelector } from '@/components/ui/channel-selector';
import { RoleSelector } from '@/components/ui/role-selector';
import { cn } from '@/lib/utils';
import { ConfigCategoryLayout } from './config-category-layout';

export function SupportIntegrationsCategory() {
  const { draftConfig, saving, guildId, updateDraftConfig, activeTabId } = useConfigContext();

  if (!draftConfig) return null;
  const activeTab = activeTabId;
  if (!activeTab) return null;

  let isCurrentFeatureEnabled = false;
  let handleToggleCurrentFeature = (_v: boolean) => {};

  if (activeTab === 'tickets') {
    isCurrentFeatureEnabled = draftConfig.tickets?.enabled ?? false;
    handleToggleCurrentFeature = (v) =>
      updateDraftConfig((prev) => ({
        ...prev,
        tickets: { ...prev.tickets, enabled: v },
      }));
  } else if (activeTab === 'github-feed') {
    isCurrentFeatureEnabled = draftConfig.github?.feed?.enabled ?? false;
    handleToggleCurrentFeature = (v) =>
      updateDraftConfig((prev) => ({
        ...prev,
        github: { ...prev.github, feed: { ...prev.github?.feed, enabled: v } },
      }));
  }

  return (
    <ConfigCategoryLayout
      featureId={activeTab}
      toggle={{
        checked: isCurrentFeatureEnabled,
        onChange: handleToggleCurrentFeature,
        disabled: saving,
      }}
    >
      {/* Tickets Layout */}
      {activeTab === 'tickets' && (
        <div className="space-y-6">
          <div className="p-4 sm:p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl space-y-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <label
                  htmlFor="ticket-mode"
                  className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1"
                >
                  Ticket Workflow
                </label>
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
                  className={cn(inputClasses, 'bg-background')}
                >
                  <option value="thread">Thread (private thread per ticket)</option>
                  <option value="channel">Channel (dedicated text channel per ticket)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="support-role-id"
                  className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1"
                >
                  Support Staff Role
                </label>
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
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="category-channel-id"
                  className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1"
                >
                  Ticket Root Category
                </label>
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
                  filter="category"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 pt-4 border-t border-border/40">
              <div className="space-y-2">
                <label
                  htmlFor="auto-close-hours"
                  className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1"
                >
                  Auto-Close
                </label>
                <div className="relative">
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
                    onFocus={(e) => e.target.select()}
                    disabled={saving}
                    className={cn(inputClasses, 'pr-12 text-center')}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground/50">
                    HRS
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="max-open-per-user"
                  className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1"
                >
                  Simultaneous Tickets
                </label>
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
                  onFocus={(e) => e.target.select()}
                  disabled={saving}
                  className={cn(inputClasses, 'text-center')}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label
                  htmlFor="transcript-channel-id"
                  className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1"
                >
                  Archival Logs
                </label>
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
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GitHub Feed Layout */}
      {activeTab === 'github-feed' && (
        <div className="space-y-6">
          <div className="p-4 sm:p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl space-y-6">
            <div className="space-y-2">
              <label
                htmlFor="feed-channel-id"
                className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1"
              >
                Feed Channel ID
              </label>
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
            </div>

            <div className="space-y-2 pt-4 border-t border-border/40">
              <label
                htmlFor="poll-interval-minutes"
                className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1"
              >
                Poll Interval
              </label>
              <div className="relative w-full sm:w-1/2 md:w-1/3">
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
                  onFocus={(e) => e.target.select()}
                  disabled={saving}
                  className={cn(inputClasses, 'pr-12 text-center')}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground/50">
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
