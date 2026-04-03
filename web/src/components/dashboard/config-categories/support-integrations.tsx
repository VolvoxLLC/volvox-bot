'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Ticket } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useConfigContext } from '@/components/dashboard/config-context';
import { inputClasses, parseNumberInput } from '@/components/dashboard/config-editor-utils';
import type { ConfigFeatureId } from '@/components/dashboard/config-workspace/types';
import { ChannelSelector } from '@/components/ui/channel-selector';
import { GithubIcon } from '@/components/ui/github-icon';
import { RoleSelector } from '@/components/ui/role-selector';
import { cn } from '@/lib/utils';
import { ToggleSwitch } from '../toggle-switch';

const TABS = [
  {
    id: 'tickets',
    label: 'Tickets',
    icon: Ticket,
    desc: 'Configure support ticket routing and lifecycle limits.',
  },
  {
    id: 'github-feed',
    label: 'GitHub Feed',
    icon: GithubIcon,
    desc: 'Post repository updates into a Discord channel.',
  },
] as const;

export function SupportIntegrationsCategory() {
  const { draftConfig, saving, guildId, visibleFeatureIds, updateDraftConfig } = useConfigContext();

  const availableTabs = TABS.filter((t) => visibleFeatureIds.has(t.id as ConfigFeatureId));
  const [activeTab, setActiveTab] = useState<ConfigFeatureId | null>(
    (availableTabs[0]?.id as ConfigFeatureId) ?? null,
  );

  useEffect(() => {
    if (activeTab && !visibleFeatureIds.has(activeTab)) {
      setActiveTab((availableTabs[0]?.id as ConfigFeatureId) ?? null);
    }
  }, [visibleFeatureIds, activeTab, availableTabs]);

  if (!draftConfig) return null;
  if (!activeTab && availableTabs.length > 0) return null;
  if (availableTabs.length === 0) return null;

  const currentTabInfo = TABS.find((t) => t.id === activeTab);

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
    <div className="flex flex-col xl:flex-row gap-6 pb-12 items-start">
      {/* Sidebar Navigation */}
      {availableTabs.length > 1 && (
        <div className="w-full xl:w-56 shrink-0 flex flex-col gap-2 xl:sticky xl:top-24 z-10">
          <div className="settings-tab-bar xl:flex-col xl:p-2 xl:rounded-[24px] xl:bg-muted/20 xl:border-border/40 xl:backdrop-blur-xl overflow-x-auto xl:overflow-visible">
            {availableTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  type="button"
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as ConfigFeatureId)}
                  className={cn(
                    'relative flex items-center gap-3 px-4 py-3 rounded-[12px] xl:rounded-[16px] text-sm font-semibold transition-all duration-300 min-w-fit xl:min-w-0 outline-none',
                    isActive
                      ? 'bg-primary/10 text-primary shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] border border-primary/20'
                      : 'text-muted-foreground/70 hover:text-foreground hover:bg-muted/30 border border-transparent',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 w-full relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl shadow-sm">
              <div className="space-y-1 relative z-10">
                <div className="flex items-center gap-2.5">
                  {currentTabInfo && <currentTabInfo.icon className="h-5 w-5 text-primary" />}
                  <h2 className="text-xl font-bold tracking-tight text-foreground/90">
                    {currentTabInfo?.label}
                  </h2>
                </div>
                <p className="text-sm font-medium text-muted-foreground">{currentTabInfo?.desc}</p>
              </div>

              <div className="flex items-center gap-3 shrink-0 rounded-full border border-border/50 bg-background/50 backdrop-blur-md px-4 py-2">
                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Status:{' '}
                  <span className={isCurrentFeatureEnabled ? 'text-primary ml-1' : 'ml-1'}>
                    {isCurrentFeatureEnabled ? 'Active' : 'Disabled'}
                  </span>
                </span>
                <div className="h-4 w-px bg-border max-sm:hidden" />
                <ToggleSwitch
                  checked={isCurrentFeatureEnabled}
                  onChange={handleToggleCurrentFeature}
                  disabled={saving}
                  label={`Enable ${currentTabInfo?.label}`}
                />
              </div>
            </div>

            {/* Tickets Layout */}
            {activeTab === 'tickets' && (
              <div className="space-y-6">
                <div className="p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl space-y-6">
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
                        selected={
                          draftConfig.tickets?.category ? [draftConfig.tickets.category] : []
                        }
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
                <div className="p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl space-y-6">
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
                        draftConfig.github?.feed?.channelId
                          ? [draftConfig.github.feed.channelId]
                          : []
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
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
