'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChannelSelector } from '@/components/ui/channel-selector';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useGuildSelection } from '@/hooks/use-guild-selection';
import type { GuildConfig } from '@/lib/config-utils';
import { NumberField } from './NumberField';

interface TriageSectionProps {
  draftConfig: GuildConfig;
  saving: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onFieldChange: (field: string, value: unknown) => void;
}

/**
 * Renders the Triage configuration UI for editing classifier, responder, budget, timing, toggles, and moderation log channel.
 *
 * Renders nothing if `draftConfig.triage` is not present.
 *
 * @param draftConfig - Guild configuration draft containing the `triage` settings to display and edit.
 * @param saving - When true, input controls are disabled to prevent changes during a save operation.
 * @param onEnabledChange - Invoked with the new enabled state when the Triage master switch is toggled.
 * @param onFieldChange - Invoked with `(field, value)` for individual field updates; used for all editable triage fields including `moderationLogChannel`.
 * @returns The Triage configuration card element, or `null` when triage configuration is absent.
 */
export function TriageSection({
  draftConfig,
  saving,
  onEnabledChange,
  onFieldChange,
}: TriageSectionProps) {
  const guildId = useGuildSelection();

  if (!draftConfig.triage) return null;

  const moderationLogChannel = draftConfig.triage?.moderationLogChannel ?? '';
  const selectedChannels = moderationLogChannel ? [moderationLogChannel] : [];

  const handleChannelChange = (channels: string[]) => {
    onFieldChange('moderationLogChannel', channels[0] ?? '');
  };

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
          <Switch
            checked={draftConfig.triage?.enabled ?? false}
            onCheckedChange={onEnabledChange}
            disabled={saving}
            aria-label="Toggle Triage"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="classify-model">Classify Model</Label>
          <Input
            id="classify-model"
            type="text"
            value={draftConfig.triage?.classifyModel ?? ''}
            onChange={(e) => onFieldChange('classifyModel', e.target.value)}
            disabled={saving}
            placeholder="e.g. claude-haiku-4-5"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="respond-model">Respond Model</Label>
          <Input
            id="respond-model"
            type="text"
            value={draftConfig.triage?.respondModel ?? ''}
            onChange={(e) => onFieldChange('respondModel', e.target.value)}
            disabled={saving}
            placeholder="e.g. claude-sonnet-4-6"
          />
        </div>
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
          <Label htmlFor="streaming" className="text-sm font-medium">
            Streaming
          </Label>
          <Switch
            id="streaming"
            checked={draftConfig.triage?.streaming ?? false}
            onCheckedChange={(v) => onFieldChange('streaming', v)}
            disabled={saving}
            aria-label="Toggle streaming"
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="moderation-response" className="text-sm font-medium">
            Moderation Response
          </Label>
          <Switch
            id="moderation-response"
            checked={draftConfig.triage?.moderationResponse ?? false}
            onCheckedChange={(v) => onFieldChange('moderationResponse', v)}
            disabled={saving}
            aria-label="Toggle moderation response"
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="debug-footer" className="text-sm font-medium">
            Debug Footer
          </Label>
          <Switch
            id="debug-footer"
            checked={draftConfig.triage?.debugFooter ?? false}
            onCheckedChange={(v) => onFieldChange('debugFooter', v)}
            disabled={saving}
            aria-label="Toggle debug footer"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="moderation-log-channel">Moderation Log Channel</Label>
          {guildId ? (
            <ChannelSelector
              id="moderation-log-channel"
              guildId={guildId}
              selected={selectedChannels}
              onChange={handleChannelChange}
              placeholder="Select moderation log channel..."
              disabled={saving}
              maxSelections={1}
              filter="text"
            />
          ) : (
            <p className="text-muted-foreground text-sm">Select a server first</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
