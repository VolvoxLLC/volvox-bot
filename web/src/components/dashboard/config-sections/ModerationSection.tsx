'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChannelSelector } from '@/components/ui/channel-selector';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useGuildSelection } from '@/hooks/use-guild-selection';
import type { GuildConfig } from '@/lib/config-utils';

interface ModerationSectionProps {
  draftConfig: GuildConfig;
  saving: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onFieldChange: (field: string, value: unknown) => void;
  onDmNotificationChange: (action: string, value: boolean) => void;
  onEscalationChange: (enabled: boolean) => void;
}

/**
 * Render the Moderation settings section, including alert channel selection, auto-delete,
 * DM notification toggles, and escalation controls.
 *
 * @param draftConfig - The current draft guild configuration containing moderation settings.
 * @param saving - Whether a save operation is in progress; when true, interactive controls are disabled.
 * @param onEnabledChange - Callback invoked with the new enabled state when moderation is toggled.
 * @param onFieldChange - Generic field update callback, called with field name and new value (e.g., 'alertChannelId', 'autoDelete').
 * @param onDmNotificationChange - Callback invoked with an action ('warn' | 'timeout' | 'kick' | 'ban') and boolean to toggle DM notifications for that action.
 * @param onEscalationChange - Callback invoked with the new escalation enabled state.
 * @returns The rendered moderation Card element, or `null` if `draftConfig.moderation` is not present.
 */
export function ModerationSection({
  draftConfig,
  saving,
  onEnabledChange,
  onFieldChange,
  onDmNotificationChange,
  onEscalationChange,
}: ModerationSectionProps) {
  const guildId = useGuildSelection();

  if (!draftConfig.moderation) return null;

  const alertChannelId = draftConfig.moderation?.alertChannelId ?? '';
  const selectedChannels = alertChannelId ? [alertChannelId] : [];

  const handleChannelChange = (channels: string[]) => {
    onFieldChange('alertChannelId', channels[0] ?? '');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Moderation</CardTitle>
            <CardDescription>
              Configure moderation, escalation, and logging settings.
            </CardDescription>
          </div>
          <Switch
            checked={draftConfig.moderation?.enabled ?? false}
            onCheckedChange={onEnabledChange}
            disabled={saving}
            aria-label="Toggle Moderation"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Alert Channel</Label>
          {guildId ? (
            <ChannelSelector
              guildId={guildId}
              selected={selectedChannels}
              onChange={handleChannelChange}
              placeholder="Select alert channel..."
              disabled={saving}
              maxSelections={1}
              filter="text"
            />
          ) : (
            <p className="text-muted-foreground text-sm">Select a server first</p>
          )}
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="auto-delete" className="text-sm font-medium">
            Auto-delete flagged messages
          </Label>
          <Switch
            id="auto-delete"
            checked={draftConfig.moderation?.autoDelete ?? false}
            onCheckedChange={(v) => onFieldChange('autoDelete', v)}
            disabled={saving}
            aria-label="Toggle auto-delete"
          />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">DM Notifications</legend>
          {(['warn', 'timeout', 'kick', 'ban'] as const).map((action) => (
            <div key={action} className="flex items-center justify-between">
              <Label htmlFor={`dm-${action}`} className="text-sm capitalize text-muted-foreground">
                {action}
              </Label>
              <Switch
                id={`dm-${action}`}
                checked={draftConfig.moderation?.dmNotifications?.[action] ?? false}
                onCheckedChange={(v) => onDmNotificationChange(action, v)}
                disabled={saving}
                aria-label={`DM on ${action}`}
              />
            </div>
          ))}
        </fieldset>
        <div className="flex items-center justify-between">
          <Label htmlFor="escalation" className="text-sm font-medium">
            Escalation Enabled
          </Label>
          <Switch
            id="escalation"
            checked={draftConfig.moderation?.escalation?.enabled ?? false}
            onCheckedChange={(v) => onEscalationChange(v)}
            disabled={saving}
            aria-label="Toggle escalation"
          />
        </div>
      </CardContent>
    </Card>
  );
}
