'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { parseNumberInput } from '@/lib/config-normalization';
import type { GuildConfig } from '@/lib/config-utils';
import { ToggleSwitch } from '../toggle-switch';
import { inputClasses } from './shared';

interface TriageSectionProps {
  draftConfig: GuildConfig;
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
 * @param saving - When true, disables interactions while changes are being saved
 * @param onEnabledChange - Invoked when the top-level Triage enabled toggle changes
 * @param onFieldChange - Invoked when a specific triage field changes; receives the field name and its new value
 * @returns The rendered Triage section element, or `null` when triage is not configured
 */
export function TriageSection({
  draftConfig,
  saving,
  onEnabledChange,
  onFieldChange,
}: TriageSectionProps) {
  if (!draftConfig.triage) return null;

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
        <div className="grid grid-cols-2 gap-4">
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
                if (num !== undefined) onFieldChange('classifyBudget', num);
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
                if (num !== undefined) onFieldChange('respondBudget', num);
              }}
              disabled={saving}
              className={inputClasses}
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <label htmlFor="default-interval-ms" className="space-y-2">
            <span className="text-sm font-medium">Default Interval (ms)</span>
            <input
              id="default-interval-ms"
              type="number"
              min={1}
              value={draftConfig.triage?.defaultInterval ?? 3000}
              onChange={(e) => {
                const num = parseNumberInput(e.target.value, 1);
                if (num !== undefined) onFieldChange('defaultInterval', num);
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
                if (num !== undefined) onFieldChange('timeout', num);
              }}
              disabled={saving}
              className={inputClasses}
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <label htmlFor="context-messages" className="space-y-2">
            <span className="text-sm font-medium">Context Messages</span>
            <input
              id="context-messages"
              type="number"
              min={1}
              value={draftConfig.triage?.contextMessages ?? 10}
              onChange={(e) => {
                const num = parseNumberInput(e.target.value, 1);
                if (num !== undefined) onFieldChange('contextMessages', num);
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
                if (num !== undefined) onFieldChange('maxBufferSize', num);
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
        <label htmlFor="moderation-log-channel" className="space-y-2">
          <span className="text-sm font-medium">Moderation Log Channel</span>
          <input
            id="moderation-log-channel"
            type="text"
            value={draftConfig.triage?.moderationLogChannel ?? ''}
            onChange={(e) => onFieldChange('moderationLogChannel', e.target.value.trim() || null)}
            disabled={saving}
            className={inputClasses}
            placeholder="Channel ID for moderation logs"
          />
        </label>
      </CardContent>
    </Card>
  );
}
