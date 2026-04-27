'use client';

import { Copy, Info, RefreshCw, Send } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useConfigContext } from '@/components/dashboard/config-context';
import {
  DEFAULT_ACTIVITY_BADGES,
  generateId,
  inputClasses,
  parseNumberInput,
} from '@/components/dashboard/config-editor-utils';
import type { ConfigFeatureId } from '@/components/dashboard/config-workspace/types';
import { XpLevelActionsEditor } from '@/components/dashboard/xp-level-actions-editor';
import { useGuildChannels } from '@/components/layout/channel-directory-context';
import { Button } from '@/components/ui/button';
import { ChannelSelector } from '@/components/ui/channel-selector';
import { DiscordMarkdownEditor } from '@/components/ui/discord-markdown-editor';
import { InfoTip } from '@/components/ui/info-tip';
import { RoleSelector } from '@/components/ui/role-selector';
import { cn } from '@/lib/utils';
import { ToggleSwitch } from '../toggle-switch';
import { ConfigCategoryLayout } from './config-category-layout';

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
const INTRODUCTION_VARIABLE_DEFINITIONS = [
  { name: 'user', description: 'Mention member (pings)', sample: '@johndoe' },
  { name: 'username', description: 'Plain name (no ping)', sample: 'johndoe' },
  { name: 'server', description: 'Server name', sample: 'Volvox' },
] as const;

type WelcomePanelStatus = {
  panelType: 'rules' | 'role_menu';
  configured: boolean;
  status: 'unconfigured' | 'missing' | 'posted' | 'failed';
  channelId: string | null;
  configuredChannelId?: string | null;
  messageId: string | null;
  stale: boolean;
  lastPublishedAt: string | null;
  lastError: string | null;
};

type WelcomePublicationStatus = {
  guildId: string;
  panels: {
    rules?: WelcomePanelStatus;
    role_menu?: WelcomePanelStatus;
  };
};

/**
 * Renders the Onboarding & Growth configuration category UI that allows editing multiple feature sections based on the active tab.
 *
 * Displays controls for Welcome, Engagement, Reputation, TL;DR & AFK, and Challenges features; reads from and updates the editable draft configuration from context, and disables inputs while saving.
 *
 * @returns The configuration UI element for the selected onboarding/growth feature, or `null` if no draft configuration or active tab is available.
 */
export function OnboardingGrowthCategory() {
  const { draftConfig, saving, guildId, updateDraftConfig, activeTabId } = useConfigContext();
  const { channels: guildChannels } = useGuildChannels(guildId || null);

  const activeTab = activeTabId as ConfigFeatureId | null;

  const [dmStepsRaw, setDmStepsRaw] = useState('');
  const [welcomeStatus, setWelcomeStatus] = useState<WelcomePublicationStatus | null>(null);
  const [welcomeStatusLoading, setWelcomeStatusLoading] = useState(false);
  const [welcomePublishing, setWelcomePublishing] = useState<string | null>(null);
  const welcomeStatusRequestIdRef = useRef(0);

  useEffect(() => {
    if (draftConfig?.welcome?.dmSequence?.steps) {
      setDmStepsRaw(draftConfig.welcome.dmSequence.steps.join('\n'));
    } else {
      setDmStepsRaw('');
    }
  }, [draftConfig?.welcome?.dmSequence?.steps]);

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

  const introductionVariableSamples = useMemo(
    () =>
      Object.fromEntries(
        INTRODUCTION_VARIABLE_DEFINITIONS.map((variable) => [variable.name, variable.sample]),
      ) as Record<string, string>,
    [],
  );

  const fetchWelcomeStatus = useCallback(async () => {
    if (!guildId || activeTab !== 'welcome') return;

    const requestGuildId = guildId;
    const requestId = ++welcomeStatusRequestIdRef.current;
    setWelcomeStatusLoading(true);
    try {
      const response = await fetch(
        `/api/guilds/${encodeURIComponent(requestGuildId)}/welcome/status`,
        {
          cache: 'no-store',
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to fetch welcome publish status');
      }
      if (welcomeStatusRequestIdRef.current !== requestId || data?.guildId !== requestGuildId) {
        return;
      }
      setWelcomeStatus(data);
    } catch (error) {
      if (welcomeStatusRequestIdRef.current !== requestId) return;
      toast.error('Failed to load welcome publish status', {
        description: error instanceof Error ? error.message : 'A network error occurred.',
      });
    } finally {
      if (welcomeStatusRequestIdRef.current === requestId) {
        setWelcomeStatusLoading(false);
      }
    }
  }, [activeTab, guildId]);

  useEffect(() => {
    setWelcomeStatus((current) => (current?.guildId === guildId ? current : null));
    welcomeStatusRequestIdRef.current += 1;
  }, [guildId]);

  useEffect(() => {
    void fetchWelcomeStatus();
  }, [fetchWelcomeStatus]);

  const publishWelcomePanel = useCallback(
    async (panelType?: 'rules' | 'role_menu') => {
      if (!guildId) return;

      const publishingKey = panelType ?? 'all';
      setWelcomePublishing(publishingKey);
      try {
        const suffix = panelType ? `/publish/${panelType}` : '/publish';
        const response = await fetch(
          `/api/guilds/${encodeURIComponent(guildId)}/welcome${suffix}`,
          { method: 'POST' },
        );
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.error || 'Failed to publish welcome panels');
        }
        toast.success(panelType ? 'Welcome panel published' : 'Welcome panels published');
        await fetchWelcomeStatus();
      } catch (error) {
        toast.error('Failed to publish welcome panel', {
          description: error instanceof Error ? error.message : 'A network error occurred.',
        });
      } finally {
        setWelcomePublishing(null);
      }
    },
    [fetchWelcomeStatus, guildId],
  );

  const welcomeRoleOptions = useMemo(
    () =>
      (draftConfig?.welcome?.roleMenu?.options ?? []).map((option) => ({
        ...option,
        id: option.id ?? generateId(),
      })),
    [draftConfig?.welcome?.roleMenu?.options],
  );
  const channelNameById = useMemo(
    () => new Map(guildChannels.map((channel) => [channel.id, channel.name])),
    [guildChannels],
  );

  const copyChannelId = useCallback(async (channelId: string) => {
    try {
      await navigator.clipboard.writeText(channelId);
      toast.success('Channel ID copied');
    } catch {
      toast.error('Failed to copy channel ID');
    }
  }, []);

  useEffect(() => {
    if (!draftConfig) return;

    const hasLegacyWelcomeRoleOptions = (draftConfig.welcome?.roleMenu?.options ?? []).some(
      (option) => !option.id,
    );

    if (hasLegacyWelcomeRoleOptions) {
      updateWelcomeRoleMenu('options', welcomeRoleOptions);
    }
  }, [draftConfig, updateWelcomeRoleMenu, welcomeRoleOptions]);

  if (!draftConfig) return null;
  if (!activeTab) return null;

  const welcomePanels = welcomeStatus?.panels;

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
  } else if (activeTab === 'xp-level-actions') {
    isCurrentFeatureEnabled =
      (draftConfig.xp?.enabled ?? false) || (draftConfig.reputation?.enabled ?? false);
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
    <ConfigCategoryLayout
      featureId={activeTab}
      toggle={{
        checked: isCurrentFeatureEnabled,
        onChange: handleToggleCurrentFeature,
        disabled: saving,
      }}
    >
      {/* Welcome Layout */}
      {activeTab === 'welcome' && (
        <div className="space-y-6">
          <div className="p-4 sm:p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl space-y-6">
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

            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <ToggleSwitch
                  checked={draftConfig.welcome?.returningMessageEnabled !== false}
                  onChange={(v) => updateWelcomeField('returningMessageEnabled', v)}
                  disabled={saving}
                  label="Returning member message"
                />
                <span className="text-[10px] font-normal text-muted-foreground/60">
                  Sent when someone rejoins your server
                </span>
              </div>
              {draftConfig.welcome?.returningMessageEnabled !== false && (
                <DiscordMarkdownEditor
                  value={draftConfig.welcome?.returningMessage ?? ''}
                  onChange={(v) => updateWelcomeField('returningMessage', v || null)}
                  variables={welcomeVariables}
                  variableSamples={welcomeVariableSamples}
                  maxLength={2000}
                  placeholder="Welcome back, {{user}}! Glad to see you again."
                  disabled={saving}
                />
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-2">
                <span className="block text-sm font-bold tracking-tight text-foreground/80">
                  Rules agreement message
                </span>
                <DiscordMarkdownEditor
                  value={draftConfig.welcome?.rulesMessage ?? ''}
                  onChange={(v) => updateWelcomeField('rulesMessage', v)}
                  variables={[]}
                  variableSamples={{}}
                  maxLength={2000}
                  placeholder="Read the server rules, then click below to verify your access."
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <span className="block text-sm font-bold tracking-tight text-foreground/80">
                  Introduction prompt
                </span>
                <DiscordMarkdownEditor
                  value={draftConfig.welcome?.introMessage ?? ''}
                  onChange={(v) => updateWelcomeField('introMessage', v)}
                  variables={INTRODUCTION_VARIABLE_DEFINITIONS.map((variable) => variable.name)}
                  variableSamples={introductionVariableSamples}
                  maxLength={2000}
                  placeholder="Welcome {{user}}! Drop a quick intro so we can meet you."
                  disabled={saving}
                />
                <p className="text-[10px] font-medium text-muted-foreground/60">
                  <code>{'{{user}}'}</code> mentions the member. Use <code>{'{{username}}'}</code>{' '}
                  for plain text.
                </p>
              </div>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-6 pt-4 border-t border-border/40">
              <div className="space-y-2">
                <label
                  htmlFor="welcome-channel-id"
                  className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1"
                >
                  Message Channel
                </label>
                <ChannelSelector
                  id="welcome-channel-id"
                  guildId={guildId}
                  selected={draftConfig.welcome?.channelId ? [draftConfig.welcome.channelId] : []}
                  onChange={(selected) => updateWelcomeField('channelId', selected[0] ?? null)}
                  disabled={saving}
                  placeholder="Select welcome message channel"
                  maxSelections={1}
                  filter="text"
                />
              </div>
              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1">
                  Rules Channel
                </div>
                <ChannelSelector
                  guildId={guildId}
                  selected={
                    draftConfig.welcome?.rulesChannel ? [draftConfig.welcome.rulesChannel] : []
                  }
                  onChange={(selected) => updateWelcomeField('rulesChannel', selected[0] ?? null)}
                  disabled={saving}
                  maxSelections={1}
                  filter="text"
                />
              </div>
              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1">
                  Role Menu
                </div>
                <ChannelSelector
                  guildId={guildId}
                  selected={
                    draftConfig.welcome?.roleMenuChannel
                      ? [draftConfig.welcome.roleMenuChannel]
                      : []
                  }
                  onChange={(selected) =>
                    updateWelcomeField('roleMenuChannel', selected[0] ?? null)
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
                    draftConfig.welcome?.verifiedRole ? [draftConfig.welcome.verifiedRole] : []
                  }
                  onChange={(selected) => updateWelcomeField('verifiedRole', selected[0] ?? null)}
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
                    draftConfig.welcome?.introChannel ? [draftConfig.welcome.introChannel] : []
                  }
                  onChange={(selected) => updateWelcomeField('introChannel', selected[0] ?? null)}
                  disabled={saving}
                  maxSelections={1}
                  filter="text"
                />
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-foreground/90">Published Panels</h3>
                <p className="text-[11px] text-muted-foreground/60 font-medium">
                  Publish updates the existing Discord messages when possible.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={welcomeStatusLoading || welcomePublishing !== null}
                  onClick={() => void fetchWelcomeStatus()}
                  className="h-8 gap-2 text-[10px] uppercase tracking-widest font-bold border border-border/40 rounded-xl"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={saving || welcomePublishing !== null}
                  onClick={() => void publishWelcomePanel()}
                  className="h-8 gap-2 text-[10px] uppercase tracking-widest font-bold rounded-xl"
                >
                  <Send className="h-3.5 w-3.5" />
                  Publish All
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { key: 'rules' as const, label: 'Rules Agreement' },
                { key: 'role_menu' as const, label: 'Self-Assign Roles' },
              ].map((panel) => {
                const status = welcomePanels?.[panel.key];
                const statusText = status?.stale
                  ? 'stale'
                  : (status?.status ?? (welcomeStatusLoading ? 'loading' : 'unknown'));
                const channelId = status?.configuredChannelId ?? status?.channelId;
                const channelName = channelId ? channelNameById.get(channelId) : null;

                return (
                  <div
                    key={panel.key}
                    className="rounded-2xl border border-border/40 bg-background/60 p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-foreground/90">{panel.label}</div>
                        <div className="flex min-h-5 flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground/70">
                          {channelId ? (
                            <>
                              <span>
                                Channel:{' '}
                                <span className="font-semibold text-foreground/80">
                                  #{channelName ?? 'unknown-channel'}
                                </span>
                              </span>
                              <button
                                type="button"
                                className="inline-flex h-5 items-center gap-1 rounded-lg border border-border/40 px-1.5 font-mono text-[10px] text-muted-foreground hover:border-primary/30 hover:text-primary"
                                aria-label={`Copy ${panel.label} channel ID`}
                                title={`Copy channel ID ${channelId}`}
                                onClick={() => void copyChannelId(channelId)}
                              >
                                <Copy className="h-3 w-3" />
                                ID
                              </button>
                            </>
                          ) : (
                            'No channel configured'
                          )}
                        </div>
                      </div>
                      <span
                        className={cn(
                          'rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                          statusText === 'posted'
                            ? 'border-primary/30 text-primary bg-primary/10'
                            : statusText === 'failed'
                              ? 'border-destructive/30 text-destructive bg-destructive/10'
                              : 'border-border/50 text-muted-foreground bg-muted/30',
                        )}
                      >
                        {statusText}
                      </span>
                    </div>
                    {status?.messageId && (
                      <div className="text-[11px] font-mono text-muted-foreground/70">
                        Message: {status.messageId}
                      </div>
                    )}
                    {status?.lastError && (
                      <div className="text-[11px] text-destructive">{status.lastError}</div>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={saving || welcomePublishing !== null}
                      onClick={() => void publishWelcomePanel(panel.key)}
                      className="h-8 w-full gap-2 text-[10px] uppercase tracking-widest font-bold text-primary hover:bg-primary/5 border border-primary/20 rounded-xl"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {status?.messageId ? 'Publish Changes' : 'Publish'}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Advanced Multi-column Setup */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Dynamic Onboarding Toggle */}
            <div className="p-4 sm:p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold text-foreground/90">Engine Intelligence</h3>
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
                  <label
                    htmlFor="welcome-milestone-interval"
                    className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1"
                  >
                    Milestone Interval
                  </label>
                  <input
                    id="welcome-milestone-interval"
                    type="number"
                    min={0}
                    max={10_000}
                    value={draftConfig.welcome?.dynamic?.milestoneInterval ?? 25}
                    onChange={(event) => {
                      const value = parseNumberInput(event.target.value, 0, 10_000) ?? 25;
                      updateWelcomeDynamic('milestoneInterval', value);
                    }}
                    onFocus={(event) => event.target.select()}
                    disabled={saving}
                    className={inputClasses}
                    aria-describedby="welcome-milestone-interval-help"
                  />
                  <p
                    id="welcome-milestone-interval-help"
                    className="text-[11px] text-muted-foreground/60 font-medium ml-1"
                  >
                    Controls member-count milestone cadence, e.g. every 25 members. Use 0 to disable
                    interval-based milestones.
                  </p>
                </div>
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
            <div className="p-4 sm:p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold text-foreground/90">Directed Onboarding</h3>
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
          <div className="p-4 sm:p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl">
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
                  disabled={saving || welcomeRoleOptions.length >= 25}
                  onClick={() => {
                    const opts = [
                      ...welcomeRoleOptions,
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

            <div className="mb-6 space-y-2">
              <span className="block text-sm font-bold tracking-tight text-foreground/80">
                Self-assign roles message
              </span>
              <DiscordMarkdownEditor
                value={draftConfig.welcome?.roleMenu?.message ?? ''}
                onChange={(v) => updateWelcomeRoleMenu('message', v)}
                variables={[]}
                variableSamples={{}}
                maxLength={2000}
                placeholder="Pick your roles below. You can update them anytime."
                disabled={saving}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {welcomeRoleOptions.map((opt, i) => (
                <div
                  key={opt.id}
                  className="relative p-4 rounded-2xl bg-background border border-border/40 shadow-sm group"
                >
                  <div className="space-y-4">
                    <input
                      type="text"
                      value={opt.label ?? ''}
                      onChange={(e) => {
                        const opts = [...welcomeRoleOptions];
                        opts[i] = { ...opts[i], label: e.target.value };
                        updateWelcomeRoleMenu('options', opts);
                      }}
                      onFocus={(e) => e.target.select()}
                      className={cn(inputClasses, 'text-xs font-bold')}
                      placeholder="Display Label"
                    />
                    <RoleSelector
                      guildId={guildId}
                      selected={opt.roleId ? [opt.roleId] : []}
                      onChange={(s) => {
                        const opts = [...welcomeRoleOptions];
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
          <div className="p-4 sm:p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl">
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
                    // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder
                    key={index}
                    className="flex items-center gap-3 p-3 rounded-xl bg-background border border-border/30 hover:border-primary/30 transition-all group"
                  >
                    <div className="relative w-24 shrink-0">
                      <input
                        type="number"
                        value={badge.days ?? 0}
                        onChange={(e) => {
                          const badges = [
                            ...(draftConfig.engagement?.activityBadges ?? DEFAULT_ACTIVITY_BADGES),
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
                        onFocus={(e) => e.target.select()}
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
                          ...(draftConfig.engagement?.activityBadges ?? DEFAULT_ACTIVITY_BADGES),
                        ];
                        badges[index] = { ...badges[index], label: e.target.value };
                        updateDraftConfig((prev) => ({
                          ...prev,
                          engagement: { ...prev.engagement, activityBadges: badges },
                        }));
                      }}
                      onFocus={(e) => e.target.select()}
                      className={cn(inputClasses, 'flex-1')}
                      placeholder="Badge Name"
                    />
                    <button
                      type="button"
                      className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                      onClick={() => {
                        const badges = [
                          ...(draftConfig.engagement?.activityBadges ?? DEFAULT_ACTIVITY_BADGES),
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
                    (draftConfig.engagement as Record<string, boolean | undefined>)?.[item.key] ??
                    true
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
          <div className="p-4 sm:p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl">
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
                      onFocus={(e) => e.target.select()}
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
                      onFocus={(e) => e.target.select()}
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
                    onFocus={(e) => e.target.select()}
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

      {/* Level-Up Actions Layout */}
      {activeTab === 'xp-level-actions' && (
        <div className="space-y-6">
          <div className="p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl space-y-6">
            <XpLevelActionsEditor
              draftConfig={draftConfig}
              guildId={guildId}
              saving={saving}
              updateDraftConfig={updateDraftConfig}
            />
          </div>
        </div>
      )}

      {/* TL;DR & AFK Layout */}
      {activeTab === 'tldr-afk' && (
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-4 sm:p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl space-y-6">
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

            <div className="p-4 sm:p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl space-y-6">
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
                    Members can set custom away messages and be automatically notified of mentions
                    while offline.
                  </p>
                  <p className="pt-2 font-bold text-primary/80">Premium integration included.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl">
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
                        (draftConfig.tldr as Record<string, number | undefined>)?.[cfg.key] ?? 50
                      }
                      onChange={(e) =>
                        updateDraftConfig((p) => ({
                          ...p,
                          tldr: { ...p.tldr, [cfg.key]: parseInt(e.target.value, 10) || 1 },
                        }))
                      }
                      onFocus={(e) => e.target.select()}
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
          <div className="p-4 sm:p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1">
                  Destination Channel
                </div>
                <ChannelSelector
                  guildId={guildId}
                  selected={
                    draftConfig.challenges?.channelId ? [draftConfig.challenges.channelId] : []
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
                  <label
                    htmlFor="challenge-post-time"
                    className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1"
                  >
                    Post Time
                  </label>
                  <input
                    id="challenge-post-time"
                    type="text"
                    value={draftConfig.challenges?.postTime ?? '09:00'}
                    onChange={(e) =>
                      updateDraftConfig((p) => ({
                        ...p,
                        challenges: { ...p.challenges, postTime: e.target.value },
                      }))
                    }
                    onFocus={(e) => e.target.select()}
                    className={cn(inputClasses, 'text-center')}
                    placeholder="HH:MM"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="challenge-timezone"
                    className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1"
                  >
                    Timezone
                  </label>
                  <input
                    id="challenge-timezone"
                    type="text"
                    value={draftConfig.challenges?.timezone ?? 'UTC'}
                    onChange={(e) =>
                      updateDraftConfig((p) => ({
                        ...p,
                        challenges: { ...p.challenges, timezone: e.target.value },
                      }))
                    }
                    onFocus={(e) => e.target.select()}
                    className={cn(inputClasses, 'text-xs font-mono')}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </ConfigCategoryLayout>
  );
}
