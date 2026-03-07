'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChannelSelector } from '@/components/ui/channel-selector';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RoleSelector } from '@/components/ui/role-selector';
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
  onProtectRolesChange: (field: string, value: unknown) => void;
  onWarningsChange?: (field: string, value: unknown) => void;
}

/**
 * Render the Moderation settings card with controls for alert channel, auto-delete, DM notifications, escalation, protected roles, and the warning system.
 *
 * @param draftConfig - Current draft guild configuration containing moderation settings.
 * @param saving - When true, interactive controls are disabled while a save is in progress.
 * @param onEnabledChange - Called with the new moderation enabled state.
 * @param onFieldChange - Generic field updater called with a field name (e.g., 'alertChannelId', 'autoDelete') and its new value.
 * @param onDmNotificationChange - Called with an action ('warn' | 'timeout' | 'kick' | 'ban') and a boolean to toggle DM notifications for that action.
 * @param onEscalationChange - Called with the new escalation enabled state.
 * @param onProtectRolesChange - Field updater for protect-roles settings (fields include 'enabled', 'includeAdmins', 'includeModerators', 'includeServerOwner', 'roleIds').
 * @param onWarningsChange - Optional field updater for warning-system settings (fields include 'dmNotification', 'expiryDays', 'maxPerPage', 'severityPoints').
 * @returns The rendered moderation Card element, or `null` if `draftConfig.moderation` is not present.
 */
export function ModerationSection({
  draftConfig,
  saving,
  onEnabledChange,
  onFieldChange,
  onDmNotificationChange,
  onEscalationChange,
  onProtectRolesChange,
  onWarningsChange,
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
          <Label htmlFor={guildId ? 'alert-channel' : undefined}>Alert Channel</Label>
          {guildId ? (
            <ChannelSelector
              id="alert-channel"
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
              Additional protected roles
            </Label>
            {guildId ? (
              <RoleSelector
                id="protect-role-ids"
                guildId={guildId}
                selected={(draftConfig.moderation?.protectRoles?.roleIds ?? []) as string[]}
                onChange={(selected) => onProtectRolesChange('roleIds', selected)}
                disabled={saving}
                placeholder="Select protected roles"
              />
            ) : (
              <p className="text-muted-foreground text-sm">Select a server first</p>
            )}
          </div>
        </fieldset>
        {/* Warning System Settings */}
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Warning System</legend>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="warn-expiry" className="text-sm text-muted-foreground">
                Warning expiry (days, 0 = never)
              </Label>
              <Input
                id="warn-expiry"
                type="number"
                min={0}
                placeholder="90 (0 = never)"
                value={
                  draftConfig.moderation?.warnings?.expiryDays === null
                    ? 0
                    : (draftConfig.moderation?.warnings?.expiryDays ?? 90)
                }
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  onWarningsChange?.('expiryDays', Number.isNaN(val) || val <= 0 ? null : val);
                }}
                disabled={saving}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="warn-max-page" className="text-sm text-muted-foreground">
                Warnings per page
              </Label>
              <Input
                id="warn-max-page"
                type="number"
                min={1}
                max={25}
                value={draftConfig.moderation?.warnings?.maxPerPage ?? 10}
                onChange={(e) => {
                  const val = Math.max(1, Math.min(25, parseInt(e.target.value, 10) || 10));
                  onWarningsChange?.('maxPerPage', val);
                }}
                disabled={saving}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Severity Points</Label>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              {(['low', 'medium', 'high'] as const).map((level) => (
                <div key={level} className="space-y-1">
                  <Label htmlFor={`severity-${level}`} className="text-xs capitalize">
                    {level}
                  </Label>
                  <Input
                    id={`severity-${level}`}
                    type="number"
                    min={1}
                    value={
                      draftConfig.moderation?.warnings?.severityPoints?.[level] ??
                      { low: 1, medium: 2, high: 3 }[level]
                    }
                    onChange={(e) => {
                      const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                      const current = draftConfig.moderation?.warnings?.severityPoints ?? {
                        low: 1,
                        medium: 2,
                        high: 3,
                      };
                      onWarningsChange?.('severityPoints', { ...current, [level]: val });
                    }}
                    disabled={saving}
                  />
                </div>
              ))}
            </div>
          </div>
        </fieldset>
      </CardContent>
    </Card>
  );
}
