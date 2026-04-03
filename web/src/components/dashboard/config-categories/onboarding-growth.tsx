'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Handshake, Info, MessageSquare, Swords, Target, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useConfigContext } from '@/components/dashboard/config-context';
import {
  DEFAULT_ACTIVITY_BADGES,
  generateId,
  inputClasses,
  parseNumberInput,
} from '@/components/dashboard/config-editor-utils';
import type { ConfigFeatureId } from '@/components/dashboard/config-workspace/types';
import { Button } from '@/components/ui/button';
import { ChannelSelector } from '@/components/ui/channel-selector';
import { DiscordMarkdownEditor } from '@/components/ui/discord-markdown-editor';
import { RoleSelector } from '@/components/ui/role-selector';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ToggleSwitch } from '../toggle-switch';

const TABS = [
  {
    id: 'welcome',
    label: 'Welcome',
    icon: Handshake,
    desc: 'Greet and onboard new members with context-aware messages and automated role assignments.',
  },
  {
    id: 'engagement',
    label: 'Engagement',
    icon: Target,
    desc: 'Configure profile activity tiers and engagement tracking behavior.',
  },
  {
    id: 'reputation',
    label: 'Reputation',
    icon: Zap,
    desc: 'Tune XP ranges, cooldowns, and progression thresholds.',
  },
  {
    id: 'tldr-afk',
    label: 'TL;DR & AFK',
    icon: MessageSquare,
    desc: 'Quick toggles for summary and away-state features.',
  },
  {
    id: 'challenges',
    label: 'Challenges',
    icon: Swords,
    desc: 'Auto-post a daily challenge with solve tracking.',
  },
] as const;

const STATIC_VARIABLE_DEFINITIONS = [
  { name: 'user', description: 'Mention member', sample: '@johndoe' },
  { name: 'username', description: 'Plain name', sample: 'johndoe' },
  { name: 'server', description: 'Server name', sample: 'Volvox' },
  { name: 'memberCount', description: 'Total members', sample: '142' },
] as const;
const DYNAMIC_VARIABLE_DEFINITIONS = [
  {
    name: 'greeting',
    description: 'Time-aware hello',
    sample: 'Good morning @johndoe! You just joined Volvox.',
  },
  {
    name: 'vibeLine',
    description: 'Activity context',
    sample: "Things are moving at a healthy pace in #general, so you'll fit right in.",
  },
  {
    name: 'ctaLine',
    description: 'Suggested channels call-to-action',
    sample: 'Start in #general, check out #introductions, and browse #announcements.',
  },
  {
    name: 'milestoneLine',
    description: 'Member milestone or count line',
    sample: 'You just rolled in as member #142.',
  },
  { name: 'timeOfDay', description: 'Time-of-day label', sample: 'morning' },
  { name: 'activityLevel', description: 'Server activity level', sample: 'steady' },
  {
    name: 'topChannels',
    description: 'Trending channels',
    sample: '#general, #projects, #showcase',
  },
] as const;

function InfoTip({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors cursor-help" />
        </TooltipTrigger>
        <TooltipContent className="bg-muted border-border text-foreground text-[10px] max-w-[200px] p-2 leading-relaxed shadow-xl">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function OnboardingGrowthCategory() {
  const { draftConfig, saving, guildId, visibleFeatureIds, updateDraftConfig } = useConfigContext();

  const availableTabs = TABS.filter((t) => visibleFeatureIds.has(t.id as ConfigFeatureId));
  const [activeTab, setActiveTab] = useState<ConfigFeatureId | null>(
    (availableTabs[0]?.id as ConfigFeatureId) ?? null,
  );

  const [dmStepsRaw, setDmStepsRaw] = useState('');

  useEffect(() => {
    if (draftConfig?.welcome?.dmSequence?.steps) {
      setDmStepsRaw(draftConfig.welcome.dmSequence.steps.join('\n'));
    }
  }, [draftConfig?.welcome?.dmSequence?.steps]);

  useEffect(() => {
    if (activeTab && !visibleFeatureIds.has(activeTab)) {
      setActiveTab((availableTabs[0]?.id as ConfigFeatureId) ?? null);
    }
  }, [visibleFeatureIds, activeTab, availableTabs]);

  const updateWelcomeField = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => ({
        ...prev,
        welcome: { ...(prev.welcome ?? {}), [field]: value },
      }));
    },
    [updateDraftConfig],
  );

  const updateWelcomeDynamic = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => ({
        ...prev,
        welcome: {
          ...(prev.welcome ?? {}),
          dynamic: { ...(prev.welcome?.dynamic ?? {}), [field]: value },
        },
      }));
    },
    [updateDraftConfig],
  );

  const updateWelcomeRoleMenu = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => ({
        ...prev,
        welcome: {
          ...(prev.welcome ?? {}),
          roleMenu: { ...(prev.welcome?.roleMenu ?? {}), [field]: value },
        },
      }));
    },
    [updateDraftConfig],
  );

  const updateWelcomeDmSequence = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => ({
        ...prev,
        welcome: {
          ...(prev.welcome ?? {}),
          dmSequence: { ...(prev.welcome?.dmSequence ?? {}), [field]: value },
        },
      }));
    },
    [updateDraftConfig],
  );

  const welcomeVariables = useMemo(
    () =>
      draftConfig?.welcome?.dynamic?.enabled
        ? [
            ...STATIC_VARIABLE_DEFINITIONS.map((variable) => variable.name),
            ...DYNAMIC_VARIABLE_DEFINITIONS.map((variable) => variable.name),
          ]
        : STATIC_VARIABLE_DEFINITIONS.map((variable) => variable.name),
    [draftConfig?.welcome?.dynamic?.enabled],
  );

  const welcomeVariableSamples = useMemo(() => {
    const samples = Object.fromEntries(
      STATIC_VARIABLE_DEFINITIONS.map((variable) => [variable.name, variable.sample]),
    ) as Record<string, string>;

    if (draftConfig?.welcome?.dynamic?.enabled) {
      Object.assign(
        samples,
        Object.fromEntries(
          DYNAMIC_VARIABLE_DEFINITIONS.map((variable) => [variable.name, variable.sample]),
        ),
      );
    }

    return samples;
  }, [draftConfig?.welcome?.dynamic?.enabled]);

  if (!draftConfig) return null;
  if (!activeTab && availableTabs.length > 0) return null;
  if (availableTabs.length === 0) return null;

  const currentTabInfo = TABS.find((t) => t.id === activeTab);

  let isCurrentFeatureEnabled = false;
  let handleToggleCurrentFeature = (_v: boolean) => {};

  if (activeTab === 'welcome') {
    isCurrentFeatureEnabled = draftConfig.welcome?.enabled ?? false;
    handleToggleCurrentFeature = (v) => updateWelcomeField('enabled', v);
  } else if (activeTab === 'engagement') {
    isCurrentFeatureEnabled = draftConfig.engagement?.enabled ?? false;
    handleToggleCurrentFeature = (v) =>
      updateDraftConfig((prev) => ({
        ...prev,
        engagement: { ...prev.engagement, enabled: v },
      }));
  } else if (activeTab === 'reputation') {
    isCurrentFeatureEnabled =
      (draftConfig.reputation?.enabled ?? false) || (draftConfig.xp?.enabled ?? false);
    handleToggleCurrentFeature = (v) =>
      updateDraftConfig((prev) => ({
        ...prev,
        reputation: { ...prev.reputation, enabled: v },
        xp: { ...prev.xp, enabled: v },
      }));
  } else if (activeTab === 'tldr-afk') {
    isCurrentFeatureEnabled =
      (draftConfig.tldr?.enabled ?? false) || (draftConfig.afk?.enabled ?? false);
    handleToggleCurrentFeature = (v) =>
      updateDraftConfig((prev) => ({
        ...prev,
        tldr: { ...prev.tldr, enabled: v },
        afk: { ...prev.afk, enabled: v },
      }));
  } else if (activeTab === 'challenges') {
    isCurrentFeatureEnabled = draftConfig.challenges?.enabled ?? false;
    handleToggleCurrentFeature = (v) =>
      updateDraftConfig((prev) => ({
        ...prev,
        challenges: { ...prev.challenges, enabled: v },
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

            {/* Welcome Layout */}
            {activeTab === 'welcome' && (
              <div className="space-y-6">
                <div className="p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl space-y-6">
                  <div className="space-y-2">
                    <span className="block text-sm font-bold tracking-tight text-foreground/80">
                      Welcome message
                    </span>
                    <DiscordMarkdownEditor
                      value={draftConfig.welcome?.message ?? ''}
                      onChange={(v) => updateWelcomeField('message', v)}
                      variables={welcomeVariables}
                      variableSamples={welcomeVariableSamples}
                      maxLength={2000}
                      placeholder="Welcome {{user}} to {{server}}!"
                      disabled={saving}
                    />
                  </div>

                  <details className="group">
                    <summary className="cursor-pointer text-xs font-bold uppercase tracking-widest text-muted-foreground/60 hover:text-primary transition-colors flex items-center gap-2">
                      <span>View Variables Guide</span>
                      <Info className="h-3 w-3" />
                    </summary>
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-muted/10 border border-border/30">
                      <div className="space-y-2 text-xs">
                        <p className="font-bold text-foreground/70 uppercase">Static Variables</p>
                        <ul className="space-y-1 text-muted-foreground">
                          {STATIC_VARIABLE_DEFINITIONS.map((variable) => (
                            <li key={variable.name}>
                              <code>{`{{${variable.name}}}`}</code> - {variable.description}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="space-y-2 text-xs">
                        <p className="font-bold text-foreground/70 uppercase">Dynamic Variables</p>
                        <ul className="space-y-1 text-muted-foreground">
                          {DYNAMIC_VARIABLE_DEFINITIONS.map((variable) => (
                            <li key={variable.name}>
                              <code>{`{{${variable.name}}}`}</code> - {variable.description}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </details>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4 border-t border-border/40">
                    <div className="space-y-2">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1">
                        Rules Channel
                      </div>
                      <ChannelSelector
                        guildId={guildId}
                        selected={
                          draftConfig.welcome?.rulesChannel
                            ? [draftConfig.welcome.rulesChannel]
                            : []
                        }
                        onChange={(selected) =>
                          updateWelcomeField('rulesChannel', selected[0] ?? null)
                        }
                        disabled={saving}
                        maxSelections={1}
                        filter="text"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1">
                        Verification Role
                      </div>
                      <RoleSelector
                        guildId={guildId}
                        selected={
                          draftConfig.welcome?.verifiedRole
                            ? [draftConfig.welcome.verifiedRole]
                            : []
                        }
                        onChange={(selected) =>
                          updateWelcomeField('verifiedRole', selected[0] ?? null)
                        }
                        disabled={saving}
                        maxSelections={1}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1">
                        Introductions
                      </div>
                      <ChannelSelector
                        guildId={guildId}
                        selected={
                          draftConfig.welcome?.introChannel
                            ? [draftConfig.welcome.introChannel]
                            : []
                        }
                        onChange={(selected) =>
                          updateWelcomeField('introChannel', selected[0] ?? null)
                        }
                        disabled={saving}
                        maxSelections={1}
                        filter="text"
                      />
                    </div>
                  </div>
                </div>

                {/* Advanced Multi-column Setup */}
                <div className="grid lg:grid-cols-2 gap-6">
                  {/* Dynamic Onboarding Toggle */}
                  <div className="p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <h3 className="text-sm font-bold text-foreground/90">
                          Engine Intelligence
                        </h3>
                        <p className="text-[11px] text-muted-foreground/60 font-medium">
                          Enable context-aware dynamic variables.
                        </p>
                      </div>
                      <ToggleSwitch
                        checked={draftConfig.welcome?.dynamic?.enabled ?? false}
                        onChange={(v) => updateWelcomeDynamic('enabled', v)}
                        disabled={saving}
                        label="Dynamic Welcome"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1">
                          Highlight Channels
                        </div>
                        <ChannelSelector
                          guildId={guildId}
                          selected={draftConfig.welcome?.dynamic?.highlightChannels ?? []}
                          onChange={(v) => updateWelcomeDynamic('highlightChannels', v)}
                          disabled={saving}
                          filter="text"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1">
                          Exclude Channels
                        </div>
                        <ChannelSelector
                          guildId={guildId}
                          selected={draftConfig.welcome?.dynamic?.excludeChannels ?? []}
                          onChange={(v) => updateWelcomeDynamic('excludeChannels', v)}
                          disabled={saving}
                          filter="text"
                        />
                      </div>
                    </div>
                  </div>

                  {/* DM Sequence */}
                  <div className="p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <h3 className="text-sm font-bold text-foreground/90">
                          Directed Onboarding
                        </h3>
                        <p className="text-[11px] text-muted-foreground/60 font-medium">
                          Sequential DM series for new members.
                        </p>
                      </div>
                      <ToggleSwitch
                        checked={draftConfig.welcome?.dmSequence?.enabled ?? false}
                        onChange={(v) => updateWelcomeDmSequence('enabled', v)}
                        disabled={saving}
                        label="DM Sequence"
                      />
                    </div>
                    <textarea
                      value={dmStepsRaw}
                      onChange={(e) => setDmStepsRaw(e.target.value)}
                      onBlur={() => {
                        const parsed = dmStepsRaw
                          .split('\n')
                          .map((l) => l.trim())
                          .filter(Boolean);
                        updateWelcomeDmSequence('steps', parsed);
                        setDmStepsRaw(parsed.join('\n'));
                      }}
                      rows={3}
                      disabled={saving}
                      className={cn(inputClasses, 'resize-none font-mono text-[13px]')}
                      placeholder="One guiding message per line..."
                    />
                  </div>
                </div>

                {/* Role Menu Setup */}
                <div className="p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl">
                  <div className="flex items-center justify-between mb-8">
                    <div className="space-y-0.5">
                      <h3 className="text-sm font-bold text-foreground/90">Self-Assign Tiers</h3>
                      <p className="text-[11px] text-muted-foreground/60 font-medium">
                        Members pick their own starting roles.
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={
                          saving || (draftConfig.welcome?.roleMenu?.options?.length ?? 0) >= 25
                        }
                        onClick={() => {
                          const opts = [
                            ...(draftConfig.welcome?.roleMenu?.options ?? []),
                            { id: generateId(), label: '', roleId: '' },
                          ];
                          updateWelcomeRoleMenu('options', opts);
                        }}
                        className="h-8 text-[10px] uppercase tracking-widest font-bold text-primary hover:bg-primary/5 border border-primary/20 rounded-xl"
                      >
                        + Add Role Option
                      </Button>
                      <ToggleSwitch
                        checked={draftConfig.welcome?.roleMenu?.enabled ?? false}
                        onChange={(v) => updateWelcomeRoleMenu('enabled', v)}
                        disabled={saving}
                        label="Role Menu"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {(draftConfig.welcome?.roleMenu?.options ?? []).map((opt, i) => (
                      <div
                        key={opt.id}
                        className="relative p-4 rounded-2xl bg-background border border-border/40 shadow-sm group"
                      >
                        <div className="space-y-4">
                          <input
                            type="text"
                            value={opt.label ?? ''}
                            onChange={(e) => {
                              const opts = [...(draftConfig.welcome?.roleMenu?.options ?? [])];
                              opts[i] = { ...opts[i], label: e.target.value };
                              updateWelcomeRoleMenu('options', opts);
                            }}
                            className={cn(inputClasses, 'text-xs font-bold')}
                            placeholder="Display Label"
                          />
                          <RoleSelector
                            guildId={guildId}
                            selected={opt.roleId ? [opt.roleId] : []}
                            onChange={(s) => {
                              const opts = [...(draftConfig.welcome?.roleMenu?.options ?? [])];
                              opts[i] = { ...opts[i], roleId: s[0] ?? '' };
                              updateWelcomeRoleMenu('options', opts);
                            }}
                            maxSelections={1}
                            placeholder="Select Role"
                          />
                        </div>
                        <button
                          type="button"
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive/10 text-destructive border border-destructive/20 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center text-[10px]"
                          onClick={() => {
                            const opts = [...(draftConfig.welcome?.roleMenu?.options ?? [])].filter(
                              (o) => o.id !== opt.id,
                            );
                            updateWelcomeRoleMenu('options', opts);
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Engagement Layout */}
            {activeTab === 'engagement' && (
              <div className="space-y-6">
                <div className="p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl">
                  <div className="flex items-center justify-between mb-6">
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-foreground/90 uppercase tracking-tight">
                        Active Badge Tiers
                      </h3>
                      <p className="text-[11px] text-muted-foreground/60 font-medium">
                        Automatic member recognition based on tenure.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
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
                      className="h-8 text-[10px] uppercase tracking-widest font-bold text-primary hover:bg-primary/5 border border-primary/20 rounded-xl"
                    >
                      + Add Tier
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(draftConfig.engagement?.activityBadges ?? DEFAULT_ACTIVITY_BADGES).map(
                      (badge: { days?: number; label?: string }, index: number) => (
                        <div
                          key={index}
                          className="flex items-center gap-3 p-3 rounded-xl bg-background border border-border/30 hover:border-primary/30 transition-all group"
                        >
                          <div className="relative w-24 shrink-0">
                            <input
                              type="number"
                              value={badge.days ?? 0}
                              onChange={(e) => {
                                const badges = [
                                  ...(draftConfig.engagement?.activityBadges ??
                                    DEFAULT_ACTIVITY_BADGES),
                                ];
                                badges[index] = {
                                  ...badges[index],
                                  days: parseInt(e.target.value, 10) || 0,
                                };
                                updateDraftConfig((prev) => ({
                                  ...prev,
                                  engagement: { ...prev.engagement, activityBadges: badges },
                                }));
                              }}
                              className={cn(inputClasses, 'text-center pr-8')}
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold text-muted-foreground/40">
                              DAYS
                            </span>
                          </div>
                          <input
                            value={badge.label ?? ''}
                            onChange={(e) => {
                              const badges = [
                                ...(draftConfig.engagement?.activityBadges ??
                                  DEFAULT_ACTIVITY_BADGES),
                              ];
                              badges[index] = { ...badges[index], label: e.target.value };
                              updateDraftConfig((prev) => ({
                                ...prev,
                                engagement: { ...prev.engagement, activityBadges: badges },
                              }));
                            }}
                            className={cn(inputClasses, 'flex-1')}
                            placeholder="Badge Name"
                          />
                          <button
                            type="button"
                            className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                            onClick={() => {
                              const badges = [
                                ...(draftConfig.engagement?.activityBadges ??
                                  DEFAULT_ACTIVITY_BADGES),
                              ].filter((_, i) => i !== index);
                              updateDraftConfig((prev) => ({
                                ...prev,
                                engagement: { ...prev.engagement, activityBadges: badges },
                              }));
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ),
                    )}
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  {[
                    {
                      key: 'trackMessages',
                      label: 'Monitor Message Activity',
                      desc: 'Used for badge progression and activity lists.',
                    },
                    {
                      key: 'trackReactions',
                      label: 'Reaction Engagement',
                      desc: 'Track emoji usage for community health metrics.',
                    },
                  ].map((item) => (
                    <div
                      key={item.key}
                      className="p-4 rounded-[20px] border border-border/40 bg-muted/20 backdrop-blur-md flex items-center justify-between"
                    >
                      <div className="space-y-0.5 pr-4">
                        <span className="text-sm font-bold text-foreground/80">{item.label}</span>
                        <p className="text-[10px] text-muted-foreground/60">{item.desc}</p>
                      </div>
                      <ToggleSwitch
                        checked={
                          (draftConfig.engagement as Record<string, boolean | undefined>)?.[
                            item.key
                          ] ?? true
                        }
                        onChange={(v) =>
                          updateDraftConfig((prev) => ({
                            ...prev,
                            engagement: { ...prev.engagement, [item.key]: v },
                          }))
                        }
                        label={item.label}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reputation Layout */}
            {activeTab === 'reputation' && (
              <div className="space-y-6">
                <div className="p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-foreground/90 uppercase tracking-tight">
                          XP Velocity
                        </h3>
                        <InfoTip text="Random XP awarded per message to discourage botting/spam." />
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="relative flex-1">
                          <input
                            type="number"
                            value={draftConfig.reputation?.xpPerMessage?.[0] ?? 5}
                            onChange={(e) => {
                              const val = parseNumberInput(e.target.value, 1, 100) ?? 5;
                              const range = [...(draftConfig.reputation?.xpPerMessage ?? [5, 15])];
                              range[0] = val;
                              if (val > range[1]) range[1] = val;
                              updateDraftConfig((prev) => ({
                                ...prev,
                                reputation: { ...prev.reputation, xpPerMessage: range },
                              }));
                            }}
                            className={cn(inputClasses, 'text-center pr-10')}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold text-muted-foreground/40">
                            MIN
                          </span>
                        </div>
                        <div className="relative flex-1">
                          <input
                            type="number"
                            value={draftConfig.reputation?.xpPerMessage?.[1] ?? 15}
                            onChange={(e) => {
                              const val = parseNumberInput(e.target.value, 1, 100) ?? 15;
                              const range = [...(draftConfig.reputation?.xpPerMessage ?? [5, 15])];
                              range[1] = val;
                              if (val < range[0]) range[0] = val;
                              updateDraftConfig((prev) => ({
                                ...prev,
                                reputation: { ...prev.reputation, xpPerMessage: range },
                              }));
                            }}
                            className={cn(inputClasses, 'text-center pr-10')}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold text-muted-foreground/40">
                            MAX
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-foreground/90 uppercase tracking-tight">
                          Antispam Cooldown
                        </h3>
                        <InfoTip text="Seconds between XP gains to prevent flooding." />
                      </div>
                      <div className="relative">
                        <input
                          type="number"
                          value={draftConfig.reputation?.xpCooldownSeconds ?? 60}
                          onChange={(e) => {
                            const val = parseNumberInput(e.target.value, 0) ?? 0;
                            updateDraftConfig((prev) => ({
                              ...prev,
                              reputation: { ...prev.reputation, xpCooldownSeconds: val },
                            }));
                          }}
                          className={cn(inputClasses, 'pr-12')}
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-muted-foreground/40">
                          SECONDS
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 pt-8 border-t border-border/40">
                    <h3 className="text-sm font-bold text-foreground/90 uppercase tracking-tight">
                      Progression Steps
                    </h3>
                    <textarea
                      value={(draftConfig.xp?.levelThresholds ?? [100, 300, 600, 1000]).join(', ')}
                      onChange={(e) => {
                        const vals = e.target.value
                          .split(',')
                          .map((v) => parseInt(v.trim(), 10))
                          .filter((v) => !Number.isNaN(v));
                        if (vals.length)
                          updateDraftConfig((prev) => ({
                            ...prev,
                            xp: { ...prev.xp, levelThresholds: vals.sort((a, b) => a - b) },
                          }));
                      }}
                      className={cn(inputClasses, 'min-h-[100px] font-mono leading-relaxed py-4')}
                      placeholder="e.g. 100, 300, 600, 1000"
                    />
                    <p className="text-[10px] text-muted-foreground/60 italic">
                      Define total XP required for each sequential level (L1, L2, L3...).
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TL;DR & AFK Layout */}
            {activeTab === 'tldr-afk' && (
              <div className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <h3 className="text-sm font-bold text-foreground/90">AI Summaries</h3>
                        <p className="text-[11px] text-muted-foreground font-medium">
                          Automatic /tldr channel history.
                        </p>
                      </div>
                      <ToggleSwitch
                        checked={draftConfig.tldr?.enabled ?? false}
                        onChange={(v) =>
                          updateDraftConfig((p) => ({ ...p, tldr: { ...p.tldr, enabled: v } }))
                        }
                        label="TL;DR"
                      />
                    </div>
                    <div className="space-y-3">
                      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                        Personality Override
                      </div>
                      <textarea
                        value={draftConfig.tldr?.systemPrompt ?? ''}
                        onChange={(e) =>
                          updateDraftConfig((p) => ({
                            ...p,
                            tldr: { ...p.tldr, systemPrompt: e.target.value },
                          }))
                        }
                        className={cn(inputClasses, 'resize-none h-40')}
                        placeholder="Define how the AI should tone the summary..."
                      />
                    </div>
                  </div>

                  <div className="p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <h3 className="text-sm font-bold text-foreground/90">AFK Responder</h3>
                        <p className="text-[11px] text-muted-foreground font-medium">
                          Automatic /afk status responses.
                        </p>
                      </div>
                      <ToggleSwitch
                        checked={draftConfig.afk?.enabled ?? false}
                        onChange={(v) =>
                          updateDraftConfig((p) => ({ ...p, afk: { ...p.afk, enabled: v } }))
                        }
                        label="AFK"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2 text-xs text-muted-foreground px-2">
                        <p>
                          Members can set custom away messages and be automatically notified of
                          mentions while offline.
                        </p>
                        <p className="pt-2 font-bold text-primary/80">
                          Premium integration included.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl">
                  <h3 className="text-sm font-bold text-foreground/90 uppercase tracking-tight mb-6">
                    TL;DR Budgeting
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    {[
                      {
                        key: 'defaultMessages',
                        label: 'Analysis Window',
                        min: 1,
                        max: 200,
                        unit: 'MSG',
                      },
                      { key: 'maxMessages', label: 'Max Capacity', min: 1, max: 500, unit: 'MSG' },
                      {
                        key: 'cooldownSeconds',
                        label: 'Cool-down',
                        min: 5,
                        max: 3600,
                        unit: 'SEC',
                      },
                    ].map((cfg) => (
                      <div key={cfg.key} className="space-y-2">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1">
                          {cfg.label}
                        </div>
                        <div className="relative">
                          <input
                            type="number"
                            value={
                              (draftConfig.tldr as Record<string, number | undefined>)?.[cfg.key] ??
                              50
                            }
                            onChange={(e) =>
                              updateDraftConfig((p) => ({
                                ...p,
                                tldr: { ...p.tldr, [cfg.key]: parseInt(e.target.value, 10) || 1 },
                              }))
                            }
                            className={cn(inputClasses, 'pr-12 text-center')}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-muted-foreground/30">
                            {cfg.unit}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Challenges Layout */}
            {activeTab === 'challenges' && (
              <div className="space-y-6">
                <div className="p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                    <div className="space-y-2">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1">
                        Destination Channel
                      </div>
                      <ChannelSelector
                        guildId={guildId}
                        selected={
                          draftConfig.challenges?.channelId
                            ? [draftConfig.challenges.channelId]
                            : []
                        }
                        onChange={(s) =>
                          updateDraftConfig((p) => ({
                            ...p,
                            challenges: { ...p.challenges, channelId: s[0] ?? null },
                          }))
                        }
                        maxSelections={1}
                        filter="text"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1">
                          Post Time
                        </div>
                        <input
                          type="text"
                          value={draftConfig.challenges?.postTime ?? '09:00'}
                          onChange={(e) =>
                            updateDraftConfig((p) => ({
                              ...p,
                              challenges: { ...p.challenges, postTime: e.target.value },
                            }))
                          }
                          className={cn(inputClasses, 'text-center')}
                          placeholder="HH:MM"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1">
                          Timezone
                        </div>
                        <input
                          type="text"
                          value={draftConfig.challenges?.timezone ?? 'UTC'}
                          onChange={(e) =>
                            updateDraftConfig((p) => ({
                              ...p,
                              challenges: { ...p.challenges, timezone: e.target.value },
                            }))
                          }
                          className={cn(inputClasses, 'text-xs font-mono')}
                        />
                      </div>
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
