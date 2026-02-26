'use client';

import { ToggleSwitch } from '@/components/dashboard/toggle-switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { GuildConfig } from '@/lib/config-utils';
import { NumberField } from './NumberField';

const inputClasses =
  'w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

interface TriageSectionProps {
  draftConfig: GuildConfig;
  saving: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onFieldChange: (field: string, value: unknown) => void;
}

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
        <label className="space-y-2">
          <span className="text-sm font-medium">Classify Model</span>
          <input
            type="text"
            value={draftConfig.triage?.classifyModel ?? ''}
            onChange={(e) => onFieldChange('classifyModel', e.target.value)}
            disabled={saving}
            className={inputClasses}
            placeholder="e.g. claude-haiku-4-5"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Respond Model</span>
          <input
            type="text"
            value={draftConfig.triage?.respondModel ?? ''}
            onChange={(e) => onFieldChange('respondModel', e.target.value)}
            disabled={saving}
            className={inputClasses}
            placeholder="e.g. claude-sonnet-4-6"
          />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <NumberField
            label="Classify Budget"
            value={draftConfig.triage?.classifyBudget ?? 0}
            onChange={(v) => onFieldChange('classifyBudget', v)}
            disabled={saving}
            step={0.01}
            min={0}
          />
          <NumberField
            label="Respond Budget"
            value={draftConfig.triage?.respondBudget ?? 0}
            onChange={(v) => onFieldChange('respondBudget', v)}
            disabled={saving}
            step={0.01}
            min={0}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <NumberField
            label="Default Interval (ms)"
            value={draftConfig.triage?.defaultInterval ?? 3000}
            onChange={(v) => onFieldChange('defaultInterval', v)}
            disabled={saving}
            min={1}
          />
          <NumberField
            label="Timeout (ms)"
            value={draftConfig.triage?.timeout ?? 30000}
            onChange={(v) => onFieldChange('timeout', v)}
            disabled={saving}
            min={1}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <NumberField
            label="Context Messages"
            value={draftConfig.triage?.contextMessages ?? 10}
            onChange={(v) => onFieldChange('contextMessages', v)}
            disabled={saving}
            min={1}
          />
          <NumberField
            label="Max Buffer Size"
            value={draftConfig.triage?.maxBufferSize ?? 30}
            onChange={(v) => onFieldChange('maxBufferSize', v)}
            disabled={saving}
            min={1}
          />
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
        <label className="space-y-2">
          <span className="text-sm font-medium">Moderation Log Channel</span>
          <input
            type="text"
            value={draftConfig.triage?.moderationLogChannel ?? ''}
            onChange={(e) => onFieldChange('moderationLogChannel', e.target.value)}
            disabled={saving}
            className={inputClasses}
            placeholder="Channel ID for moderation logs"
          />
        </label>
      </CardContent>
    </Card>
  );
}
