'use client';

import { useCallback } from 'react';
import { useConfigContext } from '@/components/dashboard/config-context';
import { inputClasses, parseNumberInput } from '@/components/dashboard/config-editor-utils';
import { ChannelModeSection } from '@/components/dashboard/config-sections/ChannelModeSection';
import { SettingsFeatureCard } from '@/components/dashboard/config-workspace/settings-feature-card';
import { ChannelSelector } from '@/components/ui/channel-selector';
import type { ChannelMode } from '@/types/config';
import { SYSTEM_PROMPT_MAX_LENGTH } from '@/types/config';
import { SystemPromptEditor } from '../system-prompt-editor';
import { ToggleSwitch } from '../toggle-switch';

/**
 * AI & Automation category — renders AI Chat, Channel Mode, AI Auto-Moderation,
 * Triage, and Memory feature cards.
 */
export function AiAutomationCategory() {
  const {
    draftConfig,
    saving,
    guildId,
    visibleFeatureIds,
    forceOpenAdvancedFeatureId,
    updateDraftConfig,
  } = useConfigContext();

  const updateSystemPrompt = useCallback(
    (value: string) => {
      updateDraftConfig((prev) => ({
        ...prev,
        ai: { ...prev.ai, systemPrompt: value },
      }));
    },
    [updateDraftConfig],
  );

  const updateAiEnabled = useCallback(
    (enabled: boolean) => {
      updateDraftConfig((prev) => ({
        ...prev,
        ai: { ...prev.ai, enabled },
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

  const updateTriageEnabled = useCallback(
    (enabled: boolean) => {
      updateDraftConfig((prev) => ({
        ...prev,
        triage: { ...prev.triage, enabled },
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

  return (
    <>
      {visibleFeatureIds.has('ai-chat') && (
        <SettingsFeatureCard
          featureId="ai-chat"
          title="AI Chat"
          description="Configure assistant behavior and response scope."
          enabled={draftConfig.ai?.enabled ?? false}
          onEnabledChange={updateAiEnabled}
          disabled={saving}
          basicContent={
            <SystemPromptEditor
              value={draftConfig.ai?.systemPrompt ?? ''}
              onChange={updateSystemPrompt}
              disabled={saving}
              maxLength={SYSTEM_PROMPT_MAX_LENGTH}
            />
          }
          advancedContent={
            guildId ? (
              <div className="space-y-2">
                <label htmlFor="ai-blocked-channels" className="block">
                  <span className="text-sm font-medium">Blocked Channels</span>
                </label>
                <p className="text-xs text-muted-foreground">
                  The bot will not read messages, respond, or run triage in these channels.
                </p>
                <ChannelSelector
                  id="ai-blocked-channels"
                  guildId={guildId}
                  selected={(draftConfig.ai?.blockedChannelIds ?? []) as string[]}
                  onChange={updateAiBlockedChannels}
                  placeholder="Select channels to block AI in..."
                  disabled={saving}
                  filter="text"
                />
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Select a server first</p>
            )
          }
          forceOpenAdvanced={forceOpenAdvancedFeatureId === 'ai-chat'}
        />
      )}

      {visibleFeatureIds.has('ai-chat') && guildId && (
        <ChannelModeSection
          draftConfig={draftConfig}
          saving={saving}
          guildId={guildId}
          onChannelModeChange={updateChannelMode}
          onDefaultModeChange={updateDefaultChannelMode}
          onResetAll={resetAllChannelModes}
        />
      )}

      {draftConfig.aiAutoMod && visibleFeatureIds.has('ai-automod') && (
        <SettingsFeatureCard
          featureId="ai-automod"
          title="AI Auto-Moderation"
          description="Analyze messages with AI and apply moderation actions."
          enabled={Boolean(draftConfig.aiAutoMod?.enabled)}
          onEnabledChange={(v) => updateAiAutoModField('enabled', v)}
          disabled={saving}
          basicContent={
            <div className="space-y-4">
              <label htmlFor="ai-automod-flag-channel" className="space-y-2 block">
                <span className="text-sm font-medium">Flag Review Channel ID</span>
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
                  placeholder="Select flag review channel"
                  maxSelections={1}
                  filter="text"
                />
              </label>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Auto-delete flagged messages</span>
                <ToggleSwitch
                  checked={Boolean(draftConfig.aiAutoMod?.autoDelete ?? true)}
                  onChange={(v) => updateAiAutoModField('autoDelete', v)}
                  disabled={saving}
                  label="Auto-delete"
                />
              </div>
            </div>
          }
          advancedContent={
            <div className="space-y-4">
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Thresholds (0–100)</legend>
                <p className="text-muted-foreground text-xs">
                  Confidence threshold (%) above which the action triggers.
                </p>
                {(['toxicity', 'spam', 'harassment'] as const).map((cat) => (
                  <label
                    key={cat}
                    htmlFor={`ai-threshold-${cat}`}
                    className="flex items-center gap-3"
                  >
                    <span className="w-24 text-sm capitalize">{cat}</span>
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
                          ...((draftConfig.aiAutoMod?.thresholds as Record<string, number>) ?? {}),
                          [cat]: v,
                        });
                      }}
                      disabled={saving}
                      className={`${inputClasses} w-24`}
                    />
                    <span className="text-muted-foreground text-xs">%</span>
                  </label>
                ))}
              </fieldset>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Actions</legend>
                {(['toxicity', 'spam', 'harassment'] as const).map((cat) => (
                  <label key={cat} htmlFor={`ai-action-${cat}`} className="flex items-center gap-3">
                    <span className="w-24 text-sm capitalize">{cat}</span>
                    <select
                      id={`ai-action-${cat}`}
                      value={
                        (draftConfig.aiAutoMod?.actions as Record<string, string>)?.[cat] ?? 'flag'
                      }
                      onChange={(e) => {
                        updateAiAutoModField('actions', {
                          ...((draftConfig.aiAutoMod?.actions as Record<string, string>) ?? {}),
                          [cat]: e.target.value,
                        });
                      }}
                      disabled={saving}
                      className={inputClasses}
                    >
                      <option value="none">No action</option>
                      <option value="delete">Delete message</option>
                      <option value="flag">Flag for review</option>
                      <option value="warn">Warn user</option>
                      <option value="timeout">Timeout user</option>
                      <option value="kick">Kick user</option>
                      <option value="ban">Ban user</option>
                    </select>
                  </label>
                ))}
              </fieldset>
            </div>
          }
          forceOpenAdvanced={forceOpenAdvancedFeatureId === 'ai-automod'}
        />
      )}

      {draftConfig.triage && visibleFeatureIds.has('triage') && (
        <SettingsFeatureCard
          featureId="triage"
          title="Triage"
          description="Classifier, responder, and triage orchestration settings."
          enabled={draftConfig.triage?.enabled ?? false}
          onEnabledChange={updateTriageEnabled}
          disabled={saving}
          basicContent={
            <div className="space-y-4">
              <label htmlFor="classify-model" className="space-y-2 block">
                <span className="text-sm font-medium">Classify Model</span>
                <input
                  id="classify-model"
                  type="text"
                  value={draftConfig.triage?.classifyModel ?? ''}
                  onChange={(e) => updateTriageField('classifyModel', e.target.value)}
                  disabled={saving}
                  className={inputClasses}
                  placeholder="e.g. claude-haiku-4-5"
                />
              </label>
              <label htmlFor="respond-model" className="space-y-2 block">
                <span className="text-sm font-medium">Respond Model</span>
                <input
                  id="respond-model"
                  type="text"
                  value={draftConfig.triage?.respondModel ?? ''}
                  onChange={(e) => updateTriageField('respondModel', e.target.value)}
                  disabled={saving}
                  className={inputClasses}
                  placeholder="e.g. claude-sonnet-4-6"
                />
              </label>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label htmlFor="classify-budget" className="space-y-2">
                  <span className="text-sm font-medium">Classify Budget</span>
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
                </label>
                <label htmlFor="respond-budget" className="space-y-2">
                  <span className="text-sm font-medium">Respond Budget</span>
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
                </label>
              </div>
              <label htmlFor="moderation-log-channel" className="space-y-2 block">
                <span className="text-sm font-medium">Moderation Log Channel</span>
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
                  placeholder="Select moderation log channel"
                  maxSelections={1}
                  filter="text"
                />
              </label>
            </div>
          }
          advancedContent={
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label htmlFor="default-interval-ms" className="space-y-2">
                  <span className="text-sm font-medium">Default Interval (ms)</span>
                  <input
                    id="default-interval-ms"
                    type="number"
                    min={1}
                    value={draftConfig.triage?.defaultInterval ?? 3000}
                    onChange={(e) => {
                      const num = parseNumberInput(e.target.value, 1);
                      if (num !== undefined) updateTriageField('defaultInterval', num);
                    }}
                    disabled={saving}
                    className={inputClasses}
                  />
                </label>
                <label htmlFor="timeout-ms" className="space-y-2">
                  <span className="text-sm font-medium">Timeout (ms)</span>
                  <input
                    id="timeout-ms"
                    type="number"
                    min={1}
                    value={draftConfig.triage?.timeout ?? 30000}
                    onChange={(e) => {
                      const num = parseNumberInput(e.target.value, 1);
                      if (num !== undefined) updateTriageField('timeout', num);
                    }}
                    disabled={saving}
                    className={inputClasses}
                  />
                </label>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label htmlFor="context-messages" className="space-y-2">
                  <span className="text-sm font-medium">Context Messages</span>
                  <input
                    id="context-messages"
                    type="number"
                    min={1}
                    value={draftConfig.triage?.contextMessages ?? 10}
                    onChange={(e) => {
                      const num = parseNumberInput(e.target.value, 1);
                      if (num !== undefined) updateTriageField('contextMessages', num);
                    }}
                    disabled={saving}
                    className={inputClasses}
                  />
                </label>
                <label htmlFor="max-buffer-size" className="space-y-2">
                  <span className="text-sm font-medium">Max Buffer Size</span>
                  <input
                    id="max-buffer-size"
                    type="number"
                    min={1}
                    value={draftConfig.triage?.maxBufferSize ?? 30}
                    onChange={(e) => {
                      const num = parseNumberInput(e.target.value, 1);
                      if (num !== undefined) updateTriageField('maxBufferSize', num);
                    }}
                    disabled={saving}
                    className={inputClasses}
                  />
                </label>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Streaming</span>
                <ToggleSwitch
                  checked={draftConfig.triage?.streaming ?? false}
                  onChange={(v) => updateTriageField('streaming', v)}
                  disabled={saving}
                  label="Streaming"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Moderation Response</span>
                <ToggleSwitch
                  checked={draftConfig.triage?.moderationResponse ?? false}
                  onChange={(v) => updateTriageField('moderationResponse', v)}
                  disabled={saving}
                  label="Moderation Response"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Debug Footer</span>
                <ToggleSwitch
                  checked={draftConfig.triage?.debugFooter ?? false}
                  onChange={(v) => updateTriageField('debugFooter', v)}
                  disabled={saving}
                  label="Debug Footer"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Status Reactions</span>
                <ToggleSwitch
                  checked={draftConfig.triage?.statusReactions ?? false}
                  onChange={(v) => updateTriageField('statusReactions', v)}
                  disabled={saving}
                  label="Status Reactions"
                />
              </div>
            </div>
          }
          forceOpenAdvanced={forceOpenAdvancedFeatureId === 'triage'}
        />
      )}

      {visibleFeatureIds.has('memory') && (
        <SettingsFeatureCard
          featureId="memory"
          title="Memory"
          description="Configure AI context memory and extraction."
          enabled={draftConfig.memory?.enabled ?? false}
          onEnabledChange={(v) => updateMemoryField('enabled', v)}
          disabled={saving}
          basicContent={
            <label htmlFor="max-context-memories" className="space-y-2 block">
              <span className="text-sm font-medium">Max Context Memories</span>
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
                className={inputClasses}
              />
            </label>
          }
          advancedContent={
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Auto-Extract</span>
              <ToggleSwitch
                checked={draftConfig.memory?.autoExtract ?? false}
                onChange={(v) => updateMemoryField('autoExtract', v)}
                disabled={saving}
                label="Auto-Extract"
              />
            </div>
          }
          forceOpenAdvanced={forceOpenAdvancedFeatureId === 'memory'}
        />
      )}
    </>
  );
}
