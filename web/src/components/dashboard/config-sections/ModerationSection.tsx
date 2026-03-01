'use client';

import { useEffect, useState } from 'react';

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
  onProtectRolesChange: (field: string, value: unknown) => void;
}

export function ModerationSection({
  draftConfig,
  saving,
  onEnabledChange,
  onFieldChange,
  onDmNotificationChange,
  onEscalationChange,
  onProtectRolesChange,
}: ModerationSectionProps) {
  const [roleIdsRaw, setRoleIdsRaw] = useState(
    (draftConfig.moderation?.protectRoles?.roleIds ?? []).join(', '),
  );

  useEffect(() => {
    setRoleIdsRaw((draftConfig.moderation?.protectRoles?.roleIds ?? []).join(', '));
  }, [draftConfig.moderation?.protectRoles?.roleIds]);

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

        {/* Protect Roles sub-section */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Protect Roles from Moderation</legend>
          <div className="flex items-center justify-between">
            <Label htmlFor="protect-roles-enabled" className="text-sm text-muted-foreground">
              Enabled
            </Label>
            <Switch
              id="protect-roles-enabled"
              checked={draftConfig.moderation?.protectRoles?.enabled ?? true}
              onCheckedChange={(v) => onProtectRolesChange('enabled', v)}
              disabled={saving}
              aria-label="Toggle protect roles"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="protect-admins" className="text-sm text-muted-foreground">
              Include admins
            </Label>
            <Switch
              id="protect-admins"
              checked={draftConfig.moderation?.protectRoles?.includeAdmins ?? true}
              onCheckedChange={(v) => onProtectRolesChange('includeAdmins', v)}
              disabled={saving}
              aria-label="Include admins"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="protect-mods" className="text-sm text-muted-foreground">
              Include moderators
            </Label>
            <Switch
              id="protect-mods"
              checked={draftConfig.moderation?.protectRoles?.includeModerators ?? true}
              onCheckedChange={(v) => onProtectRolesChange('includeModerators', v)}
              disabled={saving}
              aria-label="Include moderators"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="protect-owner" className="text-sm text-muted-foreground">
              Include server owner
            </Label>
            <Switch
              id="protect-owner"
              checked={draftConfig.moderation?.protectRoles?.includeServerOwner ?? true}
              onCheckedChange={(v) => onProtectRolesChange('includeServerOwner', v)}
              disabled={saving}
              aria-label="Include server owner"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="protect-role-ids" className="text-sm text-muted-foreground">
              Additional protected role IDs (comma-separated)
            </Label>
            <Input
              id="protect-role-ids"
              type="text"
              value={roleIdsRaw}
              onChange={(e) => setRoleIdsRaw(e.target.value)}
              onBlur={() =>
                onProtectRolesChange(
                  'roleIds',
                  roleIdsRaw
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
              disabled={saving}
              placeholder="Role ID 1, Role ID 2"
            />
          </div>
        </fieldset>
      </CardContent>
    </Card>
  );
}
