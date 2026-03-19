'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChannelSelector } from '@/components/ui/channel-selector';
import { parseNumberInput } from '@/lib/config-normalization';
import type { GuildConfig } from '@/lib/config-utils';
import { useEffect, useState } from 'react';
import { ToggleSwitch } from '../toggle-switch';
import { inputClasses } from './shared';

interface TriageSectionProps {
  draftConfig: GuildConfig;
  guildId: string;
  saving: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onFieldChange: (field: string, value: unknown) => void;
}

/**
 * Render the Triage configuration UI for editing triage settings.
 *
 * Displays inputs and toggles for classifier and responder models, budgets,
 * timing values, context/buffer sizes, streaming/moderation/debug options,
 * status reactions, and moderation log channel. Renders nothing if
 * `draftConfig.triage` is not present.
 *
 * @param draftConfig - Draft guild configuration containing `triage` settings
 * @param guildId - Discord guild ID used by ChannelSelector to fetch available channels
 * @param saving - When true, disables interactions while changes are being saved
 * @param onEnabledChange - Invoked when the top-level Triage enabled toggle changes
 * @param onFieldChange - Invoked when a specific triage field changes; receives the field name and its new value
 * @returns The rendered Triage section element, or `null` when triage is not configured
 */
export function TriageSection({
  draftConfig,
  guildId,
  saving,
  onEnabledChange,
  onFieldChange,
}: TriageSectionProps) {
  // Local string state for all numeric inputs to allow intermediate values like "" and "0."
  const [rawValues, setRawValues] = useState({
    classifyBudget: String(draftConfig.triage?.classifyBudget ?? 0),
    respondBudget: String(draftConfig.triage?.respondBudget ?? 0),
    defaultInterval: String(draftConfig.triage?.defaultInterval ?? 3000),
    timeout: String(draftConfig.triage?.timeout ?? 30000),
    contextMessages: String(draftConfig.triage?.contextMessages ?? 10),
    maxBufferSize: String(draftConfig.triage?.maxBufferSize ?? 30),
  });

  // Sync from external draftConfig changes (e.g. reset/load)
  useEffect(() => {
    setRawValues({
      classifyBudget: String(draftConfig.triage?.classifyBudget ?? 0),
      respondBudget: String(draftConfig.triage?.respondBudget ?? 0),
      defaultInterval: String(draftConfig.triage?.defaultInterval ?? 3000),
      timeout: String(draftConfig.triage?.timeout ?? 30000),
      contextMessages: String(draftConfig.triage?.contextMessages ?? 10),
      maxBufferSize: String(draftConfig.triage?.maxBufferSize ?? 30),
    });
  }, [
    draftConfig.triage?.classifyBudget,
    draftConfig.triage?.respondBudget,
    draftConfig.triage?.defaultInterval,
    draftConfig.triage?.timeout,
    draftConfig.triage?.contextMessages,
    draftConfig.triage?.maxBufferSize,
  ]);

  if (!draftConfig.triage) return null;

  /** Update raw string value on change; commit parsed value on blur */
  function handleNumericChange(field: keyof typeof rawValues, value: string) {
    setRawValues((prev) => ({ ...prev, [field]: value }));
  }

  function handleNumericBlur(
    field: keyof typeof rawValues,
    configField: string,
    fallback: number,
    min: number,
  ) {
    const num = parseNumberInput(rawValues[field], min);
    if (num !== undefined) onFieldChange(configField, num);
    // Reset raw to canonical value from draftConfig (or fallback if still undefined)
    setRawValues((prev) => ({
      ...prev,
      [field]: String((draftConfig.triage as Record<string, unknown>)?.[configField] ?? fallback),
    }));
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Triage</CardTitle>
            <CardDescription>
              Configure message triage classifier, responder models, and channels.
            </CardDescription>
          </div>
          <ToggleSwitch
            checked={draftConfig.triage?.enabled ?? false}
            onChange={onEnabledChange}
            disabled={saving}
            label="Triage"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <label htmlFor="classify-model" className="space-y-2">
          <span className="text-sm font-medium">Classify Model</span>
          <input
            id="classify-model"
            type="text"
            value={draftConfig.triage?.classifyModel ?? ''}
            onChange={(e) => onFieldChange('classifyModel', e.target.value)}
            disabled={saving}
            className={inputClasses}
            placeholder="e.g. claude-haiku-4-5"
          />
        </label>
        <label htmlFor="respond-model" className="space-y-2">
          <span className="text-sm font-medium">Respond Model</span>
          <input
            id="respond-model"
            type="text"
            value={draftConfig.triage?.respondModel ?? ''}
            onChange={(e) => onFieldChange('respondModel', e.target.value)}
            disabled={saving}
            className={inputClasses}
            placeholder="e.g. claude-sonnet-4-6"
          />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label htmlFor="classify-budget" className="space-y-2">
            <span className="text-sm font-medium">Classify Budget</span>
            <input
              id="classify-budget"
              type="number"
              step="0.01"
              min={0}
              value={rawValues.classifyBudget}
              onChange={(e) => handleNumericChange('classifyBudget', e.target.value)}
              onBlur={() => handleNumericBlur('classifyBudget', 'classifyBudget', 0, 0)}
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
              value={rawValues.respondBudget}
              onChange={(e) => handleNumericChange('respondBudget', e.target.value)}
              onBlur={() => handleNumericBlur('respondBudget', 'respondBudget', 0, 0)}
              disabled={saving}
              className={inputClasses}
            />
          </label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label htmlFor="default-interval-ms" className="space-y-2">
            <span className="text-sm font-medium">Default Interval (ms)</span>
            <input
              id="default-interval-ms"
              type="number"
              min={1}
              value={rawValues.defaultInterval}
              onChange={(e) => handleNumericChange('defaultInterval', e.target.value)}
              onBlur={() => handleNumericBlur('defaultInterval', 'defaultInterval', 3000, 1)}
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
              value={rawValues.timeout}
              onChange={(e) => handleNumericChange('timeout', e.target.value)}
              onBlur={() => handleNumericBlur('timeout', 'timeout', 30000, 1)}
              disabled={saving}
              className={inputClasses}
            />
          </label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label htmlFor="context-messages" className="space-y-2">
            <span className="text-sm font-medium">Context Messages</span>
            <input
              id="context-messages"
              type="number"
              min={1}
              value={rawValues.contextMessages}
              onChange={(e) => handleNumericChange('contextMessages', e.target.value)}
              onBlur={() => handleNumericBlur('contextMessages', 'contextMessages', 10, 1)}
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
              value={rawValues.maxBufferSize}
              onChange={(e) => handleNumericChange('maxBufferSize', e.target.value)}
              onBlur={() => handleNumericBlur('maxBufferSize', 'maxBufferSize', 30, 1)}
              disabled={saving}
              className={inputClasses}
            />
          </label>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Streaming</span>
          <ToggleSwitch
            checked={draftConfig.triage?.streaming ?? false}
            onChange={(v) => onFieldChange('streaming', v)}
            disabled={saving}
            label="Streaming"
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Moderation Response</span>
          <ToggleSwitch
            checked={draftConfig.triage?.moderationResponse ?? false}
            onChange={(v) => onFieldChange('moderationResponse', v)}
            disabled={saving}
            label="Moderation Response"
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Debug Footer</span>
          <ToggleSwitch
            checked={draftConfig.triage?.debugFooter ?? false}
            onChange={(v) => onFieldChange('debugFooter', v)}
            disabled={saving}
            label="Debug Footer"
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Status Reactions</span>
          <ToggleSwitch
            checked={draftConfig.triage?.statusReactions ?? false}
            onChange={(v) => onFieldChange('statusReactions', v)}
            disabled={saving}
            label="Status Reactions"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="moderation-log-channel" className="text-sm font-medium">
            Moderation Log Channel
          </label>
          <ChannelSelector
            id="moderation-log-channel"
            guildId={guildId}
            selected={
              draftConfig.triage?.moderationLogChannel
                ? [draftConfig.triage.moderationLogChannel]
                : []
            }
            onChange={(selected) => onFieldChange('moderationLogChannel', selected[0] ?? null)}
            placeholder="Select moderation log channel..."
            disabled={saving}
            maxSelections={1}
            filter="text"
          />
        </div>
      </CardContent>
    </Card>
  );
}
