'use client';

import { Bot, BrainCircuit, ListChecks, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useState, useMemo } from 'react';
import { useConfigContext } from '@/components/dashboard/config-context';
import { inputClasses, parseNumberInput } from '@/components/dashboard/config-editor-utils';
import { ChannelModeSection } from '@/components/dashboard/config-sections/ChannelModeSection';
import type { ConfigFeatureId } from '@/components/dashboard/config-workspace/types';
import { ChannelSelector } from '@/components/ui/channel-selector';
import { cn } from '@/lib/utils';
import type { ChannelMode } from '@/types/config';
import { SYSTEM_PROMPT_MAX_LENGTH } from '@/types/config';
import { SystemPromptEditor } from '../system-prompt-editor';
import { ToggleSwitch } from '../toggle-switch';
import { ConfigCategoryLayout } from './config-category-layout';

/**
 * AI & Automation category — managing chat, automod, triage, and memory.
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
            <div className="p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl">
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

            <div className="grid lg:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-1 w-1 rounded-full bg-primary" />
                  <span className="text-[11px] font-black uppercase tracking-[0.2em] text-foreground/50">
                    Thresholds
                  </span>
                </div>
                <div className="grid gap-4">
                  {(['toxicity', 'spam', 'harassment'] as const).map((cat) => (
                    <div key={cat} className="flex items-center justify-between gap-6">
                      <span className="text-sm font-bold text-foreground/80 capitalize">{cat}</span>
                      <div className="relative">
                        <input
                          id={`ai-threshold-${cat}`}
                          type="number"
                          min={0}
                          max={100}
                          step={5}
                          value={Math.round(
                            ((draftConfig.aiAutoMod?.thresholds as Record<string, number>)?.[cat] ??
                              0.7) * 100,
                          )}
                          onChange={(e) => {
                            const raw = Number(e.target.value);
                            const v = Number.isNaN(raw) ? 0 : Math.min(1, Math.max(0, raw / 100));
                            updateAiAutoModField('thresholds', {
                              ...((draftConfig.aiAutoMod?.thresholds as Record<string, number>) ??
                                {}),
                              [cat]: v,
                            });
                          }}
                          disabled={saving}
                          className={cn(
                            inputClasses,
                            'w-24 text-right pr-8 font-mono font-semibold',
                          )}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">
                          %
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-1 w-1 rounded-full bg-primary" />
                  <span className="text-[11px] font-black uppercase tracking-[0.2em] text-foreground/50">
                    Response
                  </span>
                </div>
                <div className="grid gap-4">
                  {(['toxicity', 'spam', 'harassment'] as const).map((cat) => (
                    <div key={cat} className="flex items-center justify-between gap-4">
                      <span className="text-sm font-bold text-foreground/80 capitalize lg:hidden">
                        {cat}
                      </span>
                      <select
                        id={`ai-action-${cat}`}
                        value={
                          (draftConfig.aiAutoMod?.actions as Record<string, string>)?.[cat] ??
                          'flag'
                        }
                        onChange={(e) => {
                          updateAiAutoModField('actions', {
                            ...((draftConfig.aiAutoMod?.actions as Record<string, string>) ?? {}),
                            [cat]: e.target.value,
                          });
                        }}
                        disabled={saving}
                        className={cn(inputClasses, 'w-full min-w-[140px] font-semibold')}
                      >
                        <option value="none">Ignore</option>
                        <option value="delete">Hard Delete</option>
                        <option value="flag">Flag & Log</option>
                        <option value="warn">Issue Warning</option>
                        <option value="timeout">Temporary Timeout</option>
                        <option value="kick">Server Kick</option>
                        <option value="ban">Permanent Ban</option>
                      </select>
                    </div>
                  ))}
                </div>
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
                <div className="space-y-2">
                  <label
                    htmlFor="classify-model"
                    className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground ml-1"
                  >
                    Classifier Engine
                  </label>
                  <input
                    id="classify-model"
                    type="text"
                    value={draftConfig.triage?.classifyModel ?? ''}
                    onChange={(e) => updateTriageField('classifyModel', e.target.value)}
                    disabled={saving}
                    className={inputClasses}
                    placeholder="e.g. gpt-4o-mini"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="respond-model"
                    className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground ml-1"
                  >
                    Response Engine
                  </label>
                  <input
                    id="respond-model"
                    type="text"
                    value={draftConfig.triage?.respondModel ?? ''}
                    onChange={(e) => updateTriageField('respondModel', e.target.value)}
                    disabled={saving}
                    className={inputClasses}
                    placeholder="e.g. claude-3-5-sonnet"
                  />
                </div>
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

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl">
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
                    disabled={saving}
                    className={inputClasses}
                  />
                </div>
              </div>
            </div>

            <div className="p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl">
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
                  { id: 'streaming', label: 'Real-time Streaming', key: 'streaming' },
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
        <div className="p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl space-y-6">
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
