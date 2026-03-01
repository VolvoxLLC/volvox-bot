'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { GuildConfig } from '@/lib/config-utils';

interface ModerationSectionProps {
  draftConfig: GuildConfig;
  saving: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onFieldChange: (field: string, value: unknown) => void;
  onDmNotificationChange: (action: string, value: boolean) => void;
  onEscalationChange: (enabled: boolean) => void;
}

export function ModerationSection({
  draftConfig,
  saving,
  onEnabledChange,
  onFieldChange,
  onDmNotificationChange,
  onEscalationChange,
}: ModerationSectionProps) {
  if (!draftConfig.moderation) return null;

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
          <Label htmlFor="alert-channel">Alert Channel ID</Label>
          <Input
            id="alert-channel"
            type="text"
            value={draftConfig.moderation?.alertChannelId ?? ''}
            onChange={(e) => onFieldChange('alertChannelId', e.target.value)}
            disabled={saving}
            placeholder="Channel ID for moderation alerts"
          />
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
