'use client';
import { useCallback } from 'react';
import { AiModelSelect } from '@/components/dashboard/ai-model-select';
import { useConfigContext } from '@/components/dashboard/config-context';
import { inputClasses, parseNumberInput } from '@/components/dashboard/config-editor-utils';
import { ChannelModeSection } from '@/components/dashboard/config-sections/ChannelModeSection';
import type { ConfigFeatureId } from '@/components/dashboard/config-workspace/types';
import { ChannelSelector } from '@/components/ui/channel-selector';
import { RoleSelector } from '@/components/ui/role-selector';
import { cn } from '@/lib/utils';
import type { AiAutoModAction, AiAutoModCategory, ChannelMode } from '@/types/config';
import { SYSTEM_PROMPT_MAX_LENGTH } from '@/types/config';
import { SystemPromptEditor } from '../system-prompt-editor';
import { ToggleSwitch } from '../toggle-switch';
import { ConfigCategoryLayout } from './config-category-layout';

type SelectableAiAutoModAction = Exclude<AiAutoModAction, 'none'>;

const AI_AUTOMOD_CATEGORIES = [
  { key: 'toxicity', label: 'Toxicity', defaultThreshold: 0.7, defaultActions: ['flag'] },
  { key: 'spam', label: 'Spam', defaultThreshold: 0.8, defaultActions: ['delete'] },
  { key: 'harassment', label: 'Harassment', defaultThreshold: 0.7, defaultActions: ['warn'] },
  { key: 'hateSpeech', label: 'Hate Speech', defaultThreshold: 0.8, defaultActions: ['timeout'] },
  {
    key: 'sexualContent',
    label: 'Sexual Content',
    defaultThreshold: 0.8,
    defaultActions: ['delete'],
  },
  { key: 'violence', label: 'Violence', defaultThreshold: 0.85, defaultActions: ['ban'] },
  { key: 'selfHarm', label: 'Self-Harm', defaultThreshold: 0.7, defaultActions: ['flag'] },
] as const satisfies readonly {
  key: AiAutoModCategory;
  label: string;
  defaultThreshold: number;
  defaultActions: readonly SelectableAiAutoModAction[];
}[];

const AI_AUTOMOD_ACTION_OPTIONS = [
  { value: 'flag', label: 'Flag & Log' },
  { value: 'delete', label: 'Hard Delete' },
  { value: 'warn', label: 'Issue Warning' },
  { value: 'timeout', label: 'Temporary Timeout' },
  { value: 'kick', label: 'Server Kick' },
  { value: 'ban', label: 'Permanent Ban' },
] as const satisfies readonly { value: SelectableAiAutoModAction; label: string }[];

const AI_AUTOMOD_ACTION_ORDER = AI_AUTOMOD_ACTION_OPTIONS.map((option) => option.value);

function isSelectableAiAutoModAction(value: unknown): value is SelectableAiAutoModAction {
  return (
    typeof value === 'string' &&
    AI_AUTOMOD_ACTION_ORDER.includes(value as SelectableAiAutoModAction)
  );
}

function sortAiAutoModActions(
  actions: readonly SelectableAiAutoModAction[],
): SelectableAiAutoModAction[] {
  const selected = new Set(actions);
  return AI_AUTOMOD_ACTION_ORDER.filter((action) => selected.has(action));
}

function normalizeAiAutoModActions(
  value: unknown,
  fallback: readonly SelectableAiAutoModAction[],
): SelectableAiAutoModAction[] {
  const rawActions = Array.isArray(value)
    ? value
    : isSelectableAiAutoModAction(value)
      ? [value]
      : fallback;
  const uniqueActions = rawActions.filter(
    (action, index, allActions): action is SelectableAiAutoModAction =>
      isSelectableAiAutoModAction(action) && allActions.indexOf(action) === index,
  );

  return sortAiAutoModActions(uniqueActions);
}

/**
 * Render the AI & Automation configuration UI for the chat, automod, triage, and memory feature tabs.
 *
 * Renders controls and panels appropriate to the currently active feature tab and wires updates into
 * the shared draft configuration via the config context. Returns `null` when the draft configuration
 * or the active tab is not available.
 *
 * @returns The component's rendered JSX element, or `null` when configuration or the active feature is unavailable.
 */
export function AiAutomationCategory() {
  const { draftConfig, saving, guildId, updateDraftConfig, activeTabId } = useConfigContext();

  const activeTab = activeTabId as ConfigFeatureId | null;

  const updateAiField = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => ({
        ...prev,
        ai: { ...prev.ai, [field]: value },
      }));
    },
    [updateDraftConfig],
  );

  const updateSystemPrompt = useCallback(
    (value: string) => {
      updateDraftConfig((prev) => ({
        ...prev,
        ai: { ...prev.ai, systemPrompt: value },
      }));
    },
    [updateDraftConfig],
  );

  const updateAiBlockedChannels = useCallback(
    (channels: string[]) => {
      updateDraftConfig((prev) => ({
        ...prev,
        ai: { ...prev.ai, blockedChannelIds: channels },
      }));
    },
    [updateDraftConfig],
  );

  const updateChannelMode = useCallback(
    (channelId: string, mode: ChannelMode | undefined) => {
      updateDraftConfig((prev) => {
        const modes = { ...(prev.ai?.channelModes ?? {}) } as Record<string, ChannelMode>;
        const currentDefault: ChannelMode =
          (prev.ai?.defaultChannelMode as ChannelMode) ?? 'mention';
        if (mode === undefined || mode === currentDefault) {
          delete modes[channelId];
        } else {
          modes[channelId] = mode;
        }
        return { ...prev, ai: { ...prev.ai, channelModes: modes } };
      });
    },
    [updateDraftConfig],
  );

  const updateDefaultChannelMode = useCallback(
    (mode: ChannelMode) => {
      updateDraftConfig((prev) => {
        const existingModes = { ...(prev.ai?.channelModes ?? {}) } as Record<string, ChannelMode>;
        for (const [channelId, channelMode] of Object.entries(existingModes)) {
          if (channelMode === mode) {
            delete existingModes[channelId];
          }
        }
        return {
          ...prev,
          ai: { ...prev.ai, defaultChannelMode: mode, channelModes: existingModes },
        };
      });
    },
    [updateDraftConfig],
  );

  const resetAllChannelModes = useCallback(() => {
    updateDraftConfig((prev) => ({
      ...prev,
      ai: { ...prev.ai, channelModes: {} },
    }));
  }, [updateDraftConfig]);

  const updateAiAutoModField = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => ({
        ...prev,
        aiAutoMod: { ...prev.aiAutoMod, [field]: value },
      }));
    },
    [updateDraftConfig],
  );

  const updateTriageField = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => ({
        ...prev,
        triage: { ...prev.triage, [field]: value },
      }));
    },
    [updateDraftConfig],
  );

  const updateMemoryField = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => ({
        ...prev,
        memory: { ...prev.memory, [field]: value },
      }));
    },
    [updateDraftConfig],
  );

  if (!draftConfig) return null;
  if (!activeTab) return null;

  let isCurrentFeatureEnabled = false;
  let handleToggleCurrentFeature = (_v: boolean) => {};

  if (activeTab === 'ai-chat') {
    isCurrentFeatureEnabled = draftConfig.ai?.enabled ?? true;
    handleToggleCurrentFeature = (v) => updateAiField('enabled', v);
  } else if (activeTab === 'ai-automod') {
    isCurrentFeatureEnabled = draftConfig.aiAutoMod?.enabled ?? false;
    handleToggleCurrentFeature = (v) => updateAiAutoModField('enabled', v);
  } else if (activeTab === 'triage') {
    isCurrentFeatureEnabled = draftConfig.triage?.enabled ?? true;
    handleToggleCurrentFeature = (v) => updateTriageField('enabled', v);
  } else if (activeTab === 'memory') {
    isCurrentFeatureEnabled = draftConfig.memory?.enabled ?? true;
    handleToggleCurrentFeature = (v) => updateMemoryField('enabled', v);
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
      {/* AI Chat Layout */}
      {activeTab === 'ai-chat' && (
        <div className="space-y-6">
          <SystemPromptEditor
            value={draftConfig.ai?.systemPrompt ?? ''}
            onChange={updateSystemPrompt}
            disabled={saving}
            maxLength={SYSTEM_PROMPT_MAX_LENGTH}
          />

          {guildId && (
            <div className="p-4 sm:p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl">
              <div className="mb-4 space-y-1">
                <h3 className="text-sm font-semibold tracking-wide text-foreground/90">
                  Response Boundaries
                </h3>
                <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider">
                  Select channels where the AI should never respond
                </p>
              </div>
              <ChannelSelector
                id="ai-blocked-channels"
                guildId={guildId}
                selected={(draftConfig.ai?.blockedChannelIds ?? []) as string[]}
                onChange={updateAiBlockedChannels}
                placeholder="Search channels to block..."
                disabled={saving}
                filter="text"
              />
            </div>
          )}

          {guildId && (
            <div className="rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl p-1">
              <ChannelModeSection
                draftConfig={draftConfig}
                saving={saving}
                guildId={guildId}
                onChannelModeChange={updateChannelMode}
                onDefaultModeChange={updateDefaultChannelMode}
                onResetAll={resetAllChannelModes}
              />
            </div>
          )}
        </div>
      )}

      {/* Content Safety Layout */}
      {activeTab === 'ai-automod' && (
        <div className="space-y-6">
          <div className="p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl">
            <div className="mb-6 space-y-1">
              <h3 className="text-sm font-semibold tracking-wide text-foreground/90">
                Core Moderation Settings
              </h3>
              <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider">
                Incident reporting and enforcements
              </p>
            </div>
            <div className="space-y-6">
              <AiModelSelect
                id="ai-automod-model"
                label="Detection Model"
                value={draftConfig.aiAutoMod?.model}
                onChange={(value) => updateAiAutoModField('model', value)}
                disabled={saving}
              />

              <div className="space-y-3">
                <label
                  htmlFor="ai-automod-flag-channel"
                  className="text-sm font-bold tracking-tight text-foreground/80"
                >
                  Incident Report Channel
                </label>
                <ChannelSelector
                  id="ai-automod-flag-channel"
                  guildId={guildId}
                  selected={
                    draftConfig.aiAutoMod?.flagChannelId
                      ? [draftConfig.aiAutoMod.flagChannelId]
                      : []
                  }
                  onChange={(selected) =>
                    updateAiAutoModField('flagChannelId', selected[0] ?? null)
                  }
                  disabled={saving}
                  placeholder="Select a channel for review..."
                  maxSelections={1}
                  filter="text"
                />
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-border/30 shadow-inner">
                <div className="space-y-0.5">
                  <span className="text-sm font-bold text-foreground/90">Instant Enforcement</span>
                  <p className="text-[11px] text-muted-foreground font-medium">
                    Automatically remove messages that trigger high-severity flags.
                  </p>
                </div>
                <ToggleSwitch
                  checked={Boolean(draftConfig.aiAutoMod?.autoDelete ?? true)}
                  onChange={(v) => updateAiAutoModField('autoDelete', v)}
                  disabled={saving}
                  label="Auto-delete"
                />
              </div>
            </div>
          </div>

          <div className="p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl">
            <div className="mb-6 space-y-1">
              <h3 className="text-sm font-semibold tracking-wide text-foreground/90">
                Sensitivity & Actions
              </h3>
              <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider">
                Confidence thresholds and response matrix
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border/30 bg-background/30">
              <div className="hidden grid-cols-[minmax(10rem,1fr)_8rem_minmax(14rem,2fr)] gap-4 border-b border-border/30 px-4 py-3 sm:grid">
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-foreground/50">
                  Category
                </span>
                <span className="text-right text-[11px] font-black uppercase tracking-[0.2em] text-foreground/50">
                  Threshold
                </span>
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-foreground/50">
                  Response
                </span>
              </div>
              <div className="divide-y divide-border/20">
                {AI_AUTOMOD_CATEGORIES.map((category) => {
                  const selectedActions = normalizeAiAutoModActions(
                    (
                      draftConfig.aiAutoMod?.actions as
                        | Partial<Record<AiAutoModCategory, unknown>>
                        | undefined
                    )?.[category.key],
                    category.defaultActions,
                  );

                  return (
                    <div
                      key={category.key}
                      className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(10rem,1fr)_8rem_minmax(14rem,2fr)] sm:items-center sm:gap-4 sm:py-3"
                    >
                      <span className="text-sm font-bold text-foreground/80">{category.label}</span>
                      <div className="grid gap-1.5 sm:block">
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-foreground/40 sm:hidden">
                          Threshold
                        </span>
                        <div className="relative w-full sm:ml-auto sm:w-28">
                          <input
                            id={`ai-threshold-${category.key}`}
                            aria-label={`${category.label} Threshold`}
                            type="number"
                            min={0}
                            max={100}
                            step={5}
                            value={Math.round(
                              ((draftConfig.aiAutoMod?.thresholds as Record<string, number>)?.[
                                category.key
                              ] ?? category.defaultThreshold) * 100,
                            )}
                            onChange={(e) => {
                              const raw = Number(e.target.value);
                              const v = Number.isNaN(raw) ? 0 : Math.min(1, Math.max(0, raw / 100));
                              updateAiAutoModField('thresholds', {
                                ...((draftConfig.aiAutoMod?.thresholds as Record<string, number>) ??
                                  {}),
                                [category.key]: v,
                              });
                            }}
                            onFocus={(e) => e.target.select()}
                            disabled={saving}
                            className={cn(
                              inputClasses,
                              'w-full text-right pr-8 font-mono font-semibold',
                            )}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">
                            %
                          </span>
                        </div>
                      </div>
                      <fieldset className="grid min-w-0 gap-1.5">
                        <legend className="sr-only">{category.label} Actions</legend>
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-foreground/40 sm:hidden">
                          Response
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {AI_AUTOMOD_ACTION_OPTIONS.map((option) => (
                            <label key={option.value} className="cursor-pointer">
                              <input
                                type="checkbox"
                                aria-label={`${category.label} ${option.label}`}
                                checked={selectedActions.includes(option.value)}
                                onChange={(e) => {
                                  const nextActions = e.target.checked
                                    ? sortAiAutoModActions([...selectedActions, option.value])
                                    : selectedActions.filter((action) => action !== option.value);

                                  updateAiAutoModField('actions', {
                                    ...((draftConfig.aiAutoMod?.actions as Partial<
                                      Record<AiAutoModCategory, unknown>
                                    >) ?? {}),
                                    [category.key]: nextActions,
                                  });
                                }}
                                disabled={saving}
                                className="peer sr-only"
                              />
                              <span className="block rounded-lg border border-border/40 bg-background/70 px-3 py-2 text-[11px] font-bold text-foreground/60 transition-colors peer-checked:border-primary/60 peer-checked:bg-primary/15 peer-checked:text-foreground peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary">
                                {option.label}
                              </span>
                            </label>
                          ))}
                          {selectedActions.length === 0 && (
                            <span className="rounded-lg border border-dashed border-border/40 px-3 py-2 text-[11px] font-bold text-muted-foreground">
                              No response actions
                            </span>
                          )}
                        </div>
                      </fieldset>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Triage Layout */}
      {activeTab === 'triage' && (
        <div className="space-y-6">
          <div className="p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl">
            <div className="mb-6 space-y-1">
              <h3 className="text-sm font-semibold tracking-wide text-foreground/90">
                Engine Setup
              </h3>
              <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider">
                Model selection and log destination
              </p>
            </div>
            <div className="grid gap-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <AiModelSelect
                  id="classify-model"
                  label="Classifier Engine"
                  value={draftConfig.triage?.classifyModel}
                  onChange={(value) => updateTriageField('classifyModel', value)}
                  disabled={saving}
                  wrapperClassName="space-y-2"
                  labelClassName="ml-1 text-[11px] uppercase tracking-wider text-muted-foreground"
                />
                <AiModelSelect
                  id="respond-model"
                  label="Response Engine"
                  value={draftConfig.triage?.respondModel}
                  onChange={(value) => updateTriageField('respondModel', value)}
                  disabled={saving}
                  wrapperClassName="space-y-2"
                  labelClassName="ml-1 text-[11px] uppercase tracking-wider text-muted-foreground"
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="moderation-log-channel"
                  className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground ml-1"
                >
                  Triage Audit Log
                </label>
                <ChannelSelector
                  id="moderation-log-channel"
                  guildId={guildId}
                  selected={
                    draftConfig.triage?.moderationLogChannel
                      ? [draftConfig.triage.moderationLogChannel]
                      : []
                  }
                  onChange={(selected) =>
                    updateTriageField('moderationLogChannel', selected[0] ?? null)
                  }
                  disabled={saving}
                  placeholder="Select a channel for triage history..."
                  maxSelections={1}
                  filter="text"
                />
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl">
            <div className="mb-6 space-y-1">
              <h3 className="text-sm font-semibold tracking-wide text-foreground/90">
                Role Filtering
              </h3>
              <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider">
                Control which users the AI responds to
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label
                  htmlFor="triage-allowed-roles"
                  className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground ml-1"
                >
                  Allowed Roles
                </label>
                <p className="text-[10px] text-muted-foreground/60 ml-1">
                  Only triage messages from users with these roles. Empty = everyone allowed.
                </p>
                <RoleSelector
                  id="triage-allowed-roles"
                  guildId={guildId}
                  selected={draftConfig.triage?.allowedRoles ?? []}
                  onChange={(selected) => updateTriageField('allowedRoles', selected)}
                  disabled={saving}
                  placeholder="Select allowed roles..."
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="triage-excluded-roles"
                  className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground ml-1"
                >
                  Excluded Roles
                </label>
                <p className="text-[10px] text-muted-foreground/60 ml-1">
                  Never triage messages from users with these roles. Takes precedence over allowed.
                </p>
                <RoleSelector
                  id="triage-excluded-roles"
                  guildId={guildId}
                  selected={draftConfig.triage?.excludedRoles ?? []}
                  onChange={(selected) => updateTriageField('excludedRoles', selected)}
                  disabled={saving}
                  placeholder="Select excluded roles..."
                />
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="p-4 sm:p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl">
              <div className="mb-6 space-y-1">
                <h3 className="text-sm font-semibold tracking-wide text-foreground/90">
                  Daily Limits
                </h3>
                <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider">
                  Budget boundaries
                </p>
              </div>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label htmlFor="classify-budget" className="text-xs font-bold text-foreground/80">
                    Classify Budget ($)
                  </label>
                  <input
                    id="classify-budget"
                    type="number"
                    step="0.01"
                    min={0}
                    value={draftConfig.triage?.classifyBudget ?? 0}
                    onChange={(e) => {
                      const num = parseNumberInput(e.target.value, 0);
                      if (num !== undefined) updateTriageField('classifyBudget', num);
                    }}
                    onFocus={(e) => e.target.select()}
                    disabled={saving}
                    className={inputClasses}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="respond-budget" className="text-xs font-bold text-foreground/80">
                    Response Budget ($)
                  </label>
                  <input
                    id="respond-budget"
                    type="number"
                    step="0.01"
                    min={0}
                    value={draftConfig.triage?.respondBudget ?? 0}
                    onChange={(e) => {
                      const num = parseNumberInput(e.target.value, 0);
                      if (num !== undefined) updateTriageField('respondBudget', num);
                    }}
                    onFocus={(e) => e.target.select()}
                    disabled={saving}
                    className={inputClasses}
                  />
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl">
              <div className="mb-6 space-y-1">
                <h3 className="text-sm font-semibold tracking-wide text-foreground/90">
                  Operational Modes
                </h3>
                <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider">
                  Behavior toggles
                </p>
              </div>
              <div className="space-y-2">
                {[
                  {
                    id: 'moderationResponse',
                    label: 'Enforce Safety Guardrails',
                    key: 'moderationResponse',
                  },
                  { id: 'debugFooter', label: 'Show Debug Metadata', key: 'debugFooter' },
                  {
                    id: 'statusReactions',
                    label: 'Visual Status Feedback',
                    key: 'statusReactions',
                  },
                ].map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-border/30 shadow-inner"
                  >
                    <span className="text-sm font-semibold text-foreground/80">{item.label}</span>
                    <ToggleSwitch
                      checked={
                        (draftConfig.triage?.[
                          item.key as keyof typeof draftConfig.triage
                        ] as boolean) ?? false
                      }
                      onChange={(v) => updateTriageField(item.key, v)}
                      disabled={saving}
                      label={item.label}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Memory Layout */}
      {activeTab === 'memory' && (
        <div className="p-4 sm:p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl space-y-6">
          <div className="space-y-3">
            <label
              htmlFor="max-context-memories"
              className="text-sm font-bold tracking-tight text-foreground/90"
            >
              Retrieval Depth
            </label>
            <div className="flex items-center gap-4">
              <input
                id="max-context-memories"
                type="number"
                min={1}
                value={draftConfig.memory?.maxContextMemories ?? 10}
                onChange={(e) => {
                  const num = parseNumberInput(e.target.value, 1);
                  if (num !== undefined) updateMemoryField('maxContextMemories', num);
                }}
                onFocus={(e) => e.target.select()}
                disabled={saving}
                className={cn(inputClasses, 'w-40')}
              />
              <span className="text-xs text-muted-foreground font-bold uppercase tracking-widest">
                Memories max
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-border/30 shadow-inner">
            <div className="space-y-0.5">
              <span className="text-sm font-bold text-foreground/90">Autonomous Extraction</span>
              <p className="text-[11px] text-muted-foreground font-medium">
                AI will automatically identify and save important facts.
              </p>
            </div>
            <ToggleSwitch
              checked={draftConfig.memory?.autoExtract ?? false}
              onChange={(v) => updateMemoryField('autoExtract', v)}
              disabled={saving}
              label="Auto-Extract"
            />
          </div>
        </div>
      )}
    </ConfigCategoryLayout>
  );
}
