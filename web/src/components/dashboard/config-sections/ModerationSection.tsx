'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChannelSelector } from '@/components/ui/channel-selector';
import { Input } from '@/components/ui/input';
import { parseNumberInput } from '@/lib/config-normalization';
import type { GuildConfig } from '@/lib/config-utils';
import { ToggleSwitch } from '../toggle-switch';

interface ModerationSectionProps {
  draftConfig: GuildConfig;
  guildId: string;
  saving: boolean;
  protectRoleIdsRaw: string;
  onEnabledChange: (enabled: boolean) => void;
  onFieldChange: (field: string, value: unknown) => void;
  onDmNotificationChange: (action: string, value: boolean) => void;
  onEscalationChange: (enabled: boolean) => void;
  onRateLimitChange: (field: string, value: unknown) => void;
  onLinkFilterChange: (field: string, value: unknown) => void;
  onProtectRolesChange: (field: string, value: unknown) => void;
  onWarningsChange?: (field: string, value: unknown) => void;
}

/** Shared input styling for text inputs. */
const inputClasses =
  'w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

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
  guildId,
  saving,
  protectRoleIdsRaw,
  onEnabledChange,
  onFieldChange,
  onDmNotificationChange,
  onEscalationChange,
  onRateLimitChange,
  onLinkFilterChange,
  onProtectRolesChange,
  onWarningsChange,
}: ModerationSectionProps) {
  // Local state for blocked domains raw input (parsed on blur)
  // Must be before early return to satisfy React hooks rules
  const blockedDomainsDisplay = (draftConfig.moderation?.linkFilter?.blockedDomains ?? []).join(
    ', ',
  );
  const [blockedDomainsRaw, setBlockedDomainsRaw] = useState(blockedDomainsDisplay);
  useEffect(() => {
    setBlockedDomainsRaw(blockedDomainsDisplay);
  }, [blockedDomainsDisplay]);

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
          <ToggleSwitch
            checked={draftConfig.moderation?.enabled ?? false}
            onChange={onEnabledChange}
            disabled={saving}
            label="Moderation"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <span className="text-sm font-medium">Alert Channel</span>
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
          <span className="text-sm font-medium">Auto-delete flagged messages</span>
          <ToggleSwitch
            checked={draftConfig.moderation?.autoDelete ?? false}
            onChange={(v) => onFieldChange('autoDelete', v)}
            disabled={saving}
            label="Auto Delete"
          />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">DM Notifications</legend>
          {(['warn', 'timeout', 'kick', 'ban'] as const).map((action) => (
            <div key={action} className="flex items-center justify-between">
              <span className="text-sm capitalize text-muted-foreground">{action}</span>
              <ToggleSwitch
                checked={draftConfig.moderation?.dmNotifications?.[action] ?? false}
                onChange={(v) => onDmNotificationChange(action, v)}
                disabled={saving}
                label={`DM on ${action}`}
              />
            </div>
          ))}
        </fieldset>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Escalation Enabled</span>
          <ToggleSwitch
            checked={draftConfig.moderation?.escalation?.enabled ?? false}
            onChange={(v) => onEscalationChange(v)}
            disabled={saving}
            label="Escalation"
          />
        </div>

        {/* Rate Limiting sub-section */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Rate Limiting</legend>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Enabled</span>
            <ToggleSwitch
              checked={draftConfig.moderation?.rateLimit?.enabled ?? false}
              onChange={(v) => onRateLimitChange('enabled', v)}
              disabled={saving}
              label="Rate Limiting"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label htmlFor="max-messages" className="space-y-2">
              <span className="text-sm text-muted-foreground">Max Messages</span>
              <input
                id="max-messages"
                type="number"
                min={1}
                value={draftConfig.moderation?.rateLimit?.maxMessages ?? 10}
                onChange={(e) => {
                  const num = parseNumberInput(e.target.value, 1);
                  if (num !== undefined) onRateLimitChange('maxMessages', num);
                }}
                disabled={saving}
                className={inputClasses}
              />
            </label>
            <label htmlFor="window-seconds" className="space-y-2">
              <span className="text-sm text-muted-foreground">Window (seconds)</span>
              <input
                id="window-seconds"
                type="number"
                min={1}
                value={draftConfig.moderation?.rateLimit?.windowSeconds ?? 10}
                onChange={(e) => {
                  const num = parseNumberInput(e.target.value, 1);
                  if (num !== undefined) onRateLimitChange('windowSeconds', num);
                }}
                disabled={saving}
                className={inputClasses}
              />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <label htmlFor="mute-after-triggers" className="space-y-2">
              <span className="text-sm text-muted-foreground">Mute After Triggers</span>
              <input
                id="mute-after-triggers"
                type="number"
                min={1}
                value={draftConfig.moderation?.rateLimit?.muteAfterTriggers ?? 3}
                onChange={(e) => {
                  const num = parseNumberInput(e.target.value, 1);
                  if (num !== undefined) onRateLimitChange('muteAfterTriggers', num);
                }}
                disabled={saving}
                className={inputClasses}
              />
            </label>
            <label htmlFor="mute-window-s" className="space-y-2">
              <span className="text-sm text-muted-foreground">Mute Window (s)</span>
              <input
                id="mute-window-s"
                type="number"
                min={1}
                value={draftConfig.moderation?.rateLimit?.muteWindowSeconds ?? 300}
                onChange={(e) => {
                  const num = parseNumberInput(e.target.value, 1);
                  if (num !== undefined) onRateLimitChange('muteWindowSeconds', num);
                }}
                disabled={saving}
                className={inputClasses}
              />
            </label>
            <label htmlFor="mute-duration-s" className="space-y-2">
              <span className="text-sm text-muted-foreground">Mute Duration (s)</span>
              <input
                id="mute-duration-s"
                type="number"
                min={1}
                value={draftConfig.moderation?.rateLimit?.muteDurationSeconds ?? 300}
                onChange={(e) => {
                  const num = parseNumberInput(e.target.value, 1);
                  if (num !== undefined) onRateLimitChange('muteDurationSeconds', num);
                }}
                disabled={saving}
                className={inputClasses}
              />
            </label>
          </div>
        </fieldset>

        {/* Link Filtering sub-section */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Link Filtering</legend>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Enabled</span>
            <ToggleSwitch
              checked={draftConfig.moderation?.linkFilter?.enabled ?? false}
              onChange={(v) => onLinkFilterChange('enabled', v)}
              disabled={saving}
              label="Link Filtering"
            />
          </div>
          <label htmlFor="blocked-domains" className="space-y-2">
            <span className="text-sm text-muted-foreground">Blocked Domains</span>
            <input
              id="blocked-domains"
              type="text"
              value={blockedDomainsRaw}
              onChange={(e) => setBlockedDomainsRaw(e.target.value)}
              onBlur={() =>
                onLinkFilterChange(
                  'blockedDomains',
                  blockedDomainsRaw
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
              disabled={saving}
              className={inputClasses}
              placeholder="example.com, spam.net"
            />
          </label>
        </fieldset>

        {/* Protect Roles sub-section */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Protect Roles from Moderation</legend>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Enabled</span>
            <ToggleSwitch
              checked={draftConfig.moderation?.protectRoles?.enabled ?? true}
              onChange={(v) => onProtectRolesChange('enabled', v)}
              disabled={saving}
              label="Protect Roles"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Include admins</span>
            <ToggleSwitch
              checked={draftConfig.moderation?.protectRoles?.includeAdmins ?? true}
              onChange={(v) => onProtectRolesChange('includeAdmins', v)}
              disabled={saving}
              label="Include admins"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Include moderators</span>
            <ToggleSwitch
              checked={draftConfig.moderation?.protectRoles?.includeModerators ?? true}
              onChange={(v) => onProtectRolesChange('includeModerators', v)}
              disabled={saving}
              label="Include moderators"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Include server owner</span>
            <ToggleSwitch
              checked={draftConfig.moderation?.protectRoles?.includeServerOwner ?? true}
              onChange={(v) => onProtectRolesChange('includeServerOwner', v)}
              disabled={saving}
              label="Include server owner"
            />
          </div>
          <div className="space-y-2">
            <span className="text-sm text-muted-foreground">
              Additional protected role IDs (comma-separated)
            </span>
            <Input
              type="text"
              value={protectRoleIdsRaw}
              onChange={(e) => {
                const raw = e.target.value;
                onProtectRoleIdsRawChange(raw);
                onProtectRolesChange(
                  'roleIds',
                  raw
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                );
              }}
              onBlur={(e) =>
                onProtectRoleIdsRawChange(
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .join(', '),
                )
              }
              disabled={saving}
              placeholder="Role ID 1, Role ID 2"
            />
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
