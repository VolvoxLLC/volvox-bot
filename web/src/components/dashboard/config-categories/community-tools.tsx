'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Activity, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useConfigContext } from '@/components/dashboard/config-context';
import { inputClasses, parseNumberInput } from '@/components/dashboard/config-editor-utils';
import type { ConfigFeatureId } from '@/components/dashboard/config-workspace/types';
import { cn } from '@/lib/utils';
import { ToggleSwitch } from '../toggle-switch';

const TABS = [
  {
    id: 'community-tools',
    label: 'Community Tools',
    icon: Wrench,
    desc: 'Enable or disable member-facing commands for this guild.',
  },
  {
    id: 'bot-status',
    label: 'Bot Presence',
    icon: Activity,
    desc: 'Set bot presence and rotate status messages.',
  },
] as const;

/**
 * Community Tools category — renders community command toggles and bot presence settings.
 */
export function CommunityToolsCategory() {
  const { draftConfig, saving, visibleFeatureIds, updateDraftConfig } = useConfigContext();

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

              {hasMasterToggle && (
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
              )}
            </div>

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
                    <h3 className="text-sm font-semibold tracking-wide text-foreground/90">
                      Appearance
                    </h3>
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
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
