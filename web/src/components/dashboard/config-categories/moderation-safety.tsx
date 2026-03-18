'use client';

import { useCallback } from 'react';
import { useConfigContext } from '@/components/dashboard/config-context';
import { inputClasses, parseNumberInput } from '@/components/dashboard/config-editor-utils';
import { AuditLogSection } from '@/components/dashboard/config-sections/AuditLogSection';
import { SettingsFeatureCard } from '@/components/dashboard/config-workspace/settings-feature-card';
import { ChannelSelector } from '@/components/ui/channel-selector';
import { RoleSelector } from '@/components/ui/role-selector';
import { ToggleSwitch } from '../toggle-switch';

/**
 * Moderation & Safety category — renders Moderation, Starboard, Permissions,
 * and Audit Log feature cards.
 */
export function ModerationSafetyCategory() {
  const {
    draftConfig,
    saving,
    guildId,
    visibleFeatureIds,
    forceOpenAdvancedFeatureId,
    updateDraftConfig,
  } = useConfigContext();

  const updateModerationEnabled = useCallback(
    (enabled: boolean) => {
      updateDraftConfig((prev) => ({
        ...prev,
        moderation: { ...prev.moderation, enabled },
      }));
    },
    [updateDraftConfig],
  );

  const updateModerationField = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => ({
        ...prev,
        moderation: { ...prev.moderation, [field]: value },
      }));
    },
    [updateDraftConfig],
  );

  const updateModerationDmNotification = useCallback(
    (action: string, value: boolean) => {
      updateDraftConfig((prev) => ({
        ...prev,
        moderation: {
          ...prev.moderation,
          dmNotifications: { ...prev.moderation?.dmNotifications, [action]: value },
        },
      }));
    },
    [updateDraftConfig],
  );

  const updateModerationEscalation = useCallback(
    (enabled: boolean) => {
      updateDraftConfig((prev) => ({
        ...prev,
        moderation: {
          ...prev.moderation,
          escalation: { ...prev.moderation?.escalation, enabled },
        },
      }));
    },
    [updateDraftConfig],
  );

  const updateRateLimitField = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => ({
        ...prev,
        moderation: {
          ...prev.moderation,
          rateLimit: { ...prev.moderation?.rateLimit, [field]: value },
        },
      }));
    },
    [updateDraftConfig],
  );

  const updateLinkFilterField = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => ({
        ...prev,
        moderation: {
          ...prev.moderation,
          linkFilter: { ...prev.moderation?.linkFilter, [field]: value },
        },
      }));
    },
    [updateDraftConfig],
  );

  const updateProtectRolesField = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => {
        const existingProtectRoles = prev.moderation?.protectRoles ?? {
          enabled: true,
          includeAdmins: true,
          includeModerators: true,
          includeServerOwner: true,
          roleIds: [],
        };
        return {
          ...prev,
          moderation: {
            ...prev.moderation,
            protectRoles: { ...existingProtectRoles, [field]: value },
          },
        };
      });
    },
    [updateDraftConfig],
  );

  const updateStarboardField = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => ({
        ...prev,
        starboard: { ...prev.starboard, [field]: value },
      }));
    },
    [updateDraftConfig],
  );

  const updatePermissionsField = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => {
        const updated = { ...prev.permissions, [field]: value };
        if (field === 'adminRoleIds') updated.adminRoleId = null;
        if (field === 'moderatorRoleIds') updated.moderatorRoleId = null;
        return { ...prev, permissions: updated };
      });
    },
    [updateDraftConfig],
  );

  const updateAuditLogField = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => ({
        ...prev,
        auditLog: { ...prev.auditLog, [field]: value },
      }));
    },
    [updateDraftConfig],
  );

  if (!draftConfig) return null;

  return (
    <>
      {draftConfig.moderation && visibleFeatureIds.has('moderation') && (
        <SettingsFeatureCard
          featureId="moderation"
          title="Moderation"
          description="Configure moderation alerts, notification behavior, and enforcement rules."
          enabled={draftConfig.moderation?.enabled ?? false}
          onEnabledChange={updateModerationEnabled}
          disabled={saving}
          basicContent={
            <div className="space-y-4">
              <label htmlFor="alert-channel-id" className="space-y-2 block">
                <span className="text-sm font-medium">Alert Channel ID</span>
                <ChannelSelector
                  id="alert-channel-id"
                  guildId={guildId}
                  selected={
                    draftConfig.moderation?.alertChannelId
                      ? [draftConfig.moderation.alertChannelId]
                      : []
                  }
                  onChange={(selected) =>
                    updateModerationField('alertChannelId', selected[0] ?? null)
                  }
                  disabled={saving}
                  placeholder="Select moderation alert channel"
                  maxSelections={1}
                  filter="text"
                />
              </label>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Auto-delete flagged messages</span>
                <ToggleSwitch
                  checked={draftConfig.moderation?.autoDelete ?? false}
                  onChange={(v) => updateModerationField('autoDelete', v)}
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
                      onChange={(v) => updateModerationDmNotification(action, v)}
                      disabled={saving}
                      label={`DM on ${action}`}
                    />
                  </div>
                ))}
              </fieldset>
            </div>
          }
          advancedContent={
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Escalation Enabled</span>
                <ToggleSwitch
                  checked={draftConfig.moderation?.escalation?.enabled ?? false}
                  onChange={(v) => updateModerationEscalation(v)}
                  disabled={saving}
                  label="Escalation"
                />
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Rate Limiting</legend>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Enabled</span>
                  <ToggleSwitch
                    checked={draftConfig.moderation?.rateLimit?.enabled ?? false}
                    onChange={(v) => updateRateLimitField('enabled', v)}
                    disabled={saving}
                    label="Rate Limiting"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label htmlFor="max-messages" className="space-y-2">
                    <span className="text-sm text-muted-foreground">Max Messages</span>
                    <input
                      id="max-messages"
                      type="number"
                      min={1}
                      value={draftConfig.moderation?.rateLimit?.maxMessages ?? 10}
                      onChange={(e) => {
                        const num = parseNumberInput(e.target.value, 1);
                        if (num !== undefined) updateRateLimitField('maxMessages', num);
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
                        if (num !== undefined) updateRateLimitField('windowSeconds', num);
                      }}
                      disabled={saving}
                      className={inputClasses}
                    />
                  </label>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <label htmlFor="mute-after-triggers" className="space-y-2">
                    <span className="text-sm text-muted-foreground">Mute After Triggers</span>
                    <input
                      id="mute-after-triggers"
                      type="number"
                      min={1}
                      value={draftConfig.moderation?.rateLimit?.muteAfterTriggers ?? 3}
                      onChange={(e) => {
                        const num = parseNumberInput(e.target.value, 1);
                        if (num !== undefined) updateRateLimitField('muteAfterTriggers', num);
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
                        if (num !== undefined) updateRateLimitField('muteWindowSeconds', num);
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
                        if (num !== undefined) updateRateLimitField('muteDurationSeconds', num);
                      }}
                      disabled={saving}
                      className={inputClasses}
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Link Filtering</legend>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Enabled</span>
                  <ToggleSwitch
                    checked={draftConfig.moderation?.linkFilter?.enabled ?? false}
                    onChange={(v) => updateLinkFilterField('enabled', v)}
                    disabled={saving}
                    label="Link Filtering"
                  />
                </div>
                <label htmlFor="blocked-domains" className="space-y-2">
                  <span className="text-sm text-muted-foreground">Blocked Domains</span>
                  <input
                    id="blocked-domains"
                    type="text"
                    value={(draftConfig.moderation?.linkFilter?.blockedDomains ?? []).join(', ')}
                    onChange={(e) =>
                      updateLinkFilterField(
                        'blockedDomains',
                        e.target.value
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

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Protect Roles from Moderation</legend>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Enabled</span>
                  <ToggleSwitch
                    checked={draftConfig.moderation?.protectRoles?.enabled ?? true}
                    onChange={(v) => updateProtectRolesField('enabled', v)}
                    disabled={saving}
                    label="Protect Roles"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Include admins</span>
                  <ToggleSwitch
                    checked={draftConfig.moderation?.protectRoles?.includeAdmins ?? true}
                    onChange={(v) => updateProtectRolesField('includeAdmins', v)}
                    disabled={saving}
                    label="Include admins"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Include moderators</span>
                  <ToggleSwitch
                    checked={draftConfig.moderation?.protectRoles?.includeModerators ?? true}
                    onChange={(v) => updateProtectRolesField('includeModerators', v)}
                    disabled={saving}
                    label="Include moderators"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Include server owner</span>
                  <ToggleSwitch
                    checked={draftConfig.moderation?.protectRoles?.includeServerOwner ?? true}
                    onChange={(v) => updateProtectRolesField('includeServerOwner', v)}
                    disabled={saving}
                    label="Include server owner"
                  />
                </div>
                <label htmlFor="protected-role-ids" className="space-y-2">
                  <span className="text-sm text-muted-foreground">Additional protected roles</span>
                  <RoleSelector
                    id="protected-role-ids"
                    guildId={guildId}
                    selected={(draftConfig.moderation?.protectRoles?.roleIds ?? []) as string[]}
                    onChange={(selected) => updateProtectRolesField('roleIds', selected)}
                    disabled={saving}
                    placeholder="Select protected roles"
                  />
                </label>
              </fieldset>
            </div>
          }
          forceOpenAdvanced={forceOpenAdvancedFeatureId === 'moderation'}
        />
      )}

      {visibleFeatureIds.has('starboard') && (
        <SettingsFeatureCard
          featureId="starboard"
          title="Starboard"
          description="Pin popular messages to a starboard channel."
          enabled={draftConfig.starboard?.enabled ?? false}
          onEnabledChange={(v) => updateStarboardField('enabled', v)}
          disabled={saving}
          basicContent={
            <div className="space-y-4">
              <label htmlFor="channel-id" className="space-y-2 block">
                <span className="text-sm font-medium">Channel ID</span>
                <ChannelSelector
                  id="channel-id"
                  guildId={guildId}
                  selected={
                    draftConfig.starboard?.channelId ? [draftConfig.starboard.channelId] : []
                  }
                  onChange={(selected) => updateStarboardField('channelId', selected[0] ?? '')}
                  disabled={saving}
                  placeholder="Select starboard channel"
                  maxSelections={1}
                  filter="text"
                />
              </label>
              <label htmlFor="threshold" className="space-y-2 block">
                <span className="text-sm font-medium">Threshold</span>
                <input
                  id="threshold"
                  type="number"
                  min={1}
                  value={draftConfig.starboard?.threshold ?? 3}
                  onChange={(e) => {
                    const num = parseNumberInput(e.target.value, 1);
                    if (num !== undefined) updateStarboardField('threshold', num);
                  }}
                  disabled={saving}
                  className={inputClasses}
                />
              </label>
            </div>
          }
          advancedContent={
            <div className="space-y-4">
              <label htmlFor="emoji" className="space-y-2 block">
                <span className="text-sm font-medium">Emoji</span>
                <div className="flex items-center gap-2">
                  <input
                    id="emoji"
                    type="text"
                    value={draftConfig.starboard?.emoji ?? '*'}
                    onChange={(e) => updateStarboardField('emoji', e.target.value.trim() || '*')}
                    disabled={saving}
                    className={inputClasses}
                    placeholder="*"
                  />
                  <button
                    type="button"
                    onClick={() => updateStarboardField('emoji', '*')}
                    disabled={saving}
                    className={`shrink-0 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                      draftConfig.starboard?.emoji === '*'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    Any ✱
                  </button>
                </div>
              </label>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Allow Self-Star</span>
                <ToggleSwitch
                  checked={draftConfig.starboard?.selfStarAllowed ?? false}
                  onChange={(v) => updateStarboardField('selfStarAllowed', v)}
                  disabled={saving}
                  label="Self-Star Allowed"
                />
              </div>
              <label htmlFor="ignored-channels" className="space-y-2 block">
                <span className="text-sm font-medium">Ignored Channels</span>
                <ChannelSelector
                  id="ignored-channels"
                  guildId={guildId}
                  selected={(draftConfig.starboard?.ignoredChannels ?? []) as string[]}
                  onChange={(selected) => updateStarboardField('ignoredChannels', selected)}
                  disabled={saving}
                  placeholder="Select ignored channels"
                  filter="text"
                />
              </label>
            </div>
          }
          forceOpenAdvanced={forceOpenAdvancedFeatureId === 'starboard'}
        />
      )}

      {visibleFeatureIds.has('permissions') && (
        <SettingsFeatureCard
          featureId="permissions"
          title="Permissions"
          description="Configure role-based access and owner overrides."
          enabled={draftConfig.permissions?.enabled ?? false}
          onEnabledChange={(v) => updatePermissionsField('enabled', v)}
          disabled={saving}
          basicContent={
            <div className="space-y-4">
              <label htmlFor="admin-role-ids" className="space-y-2 block">
                <span className="text-sm font-medium">Admin Roles</span>
                <RoleSelector
                  id="admin-role-ids"
                  guildId={guildId}
                  selected={[
                    ...(draftConfig.permissions?.adminRoleIds ?? []),
                    ...(draftConfig.permissions?.adminRoleId &&
                    !(draftConfig.permissions?.adminRoleIds ?? []).includes(
                      draftConfig.permissions.adminRoleId,
                    )
                      ? [draftConfig.permissions.adminRoleId]
                      : []),
                  ]}
                  onChange={(selected) => {
                    updatePermissionsField('adminRoleIds', selected);
                  }}
                  placeholder="Select admin roles"
                  disabled={saving}
                />
              </label>
              <label htmlFor="moderator-role-ids" className="space-y-2 block">
                <span className="text-sm font-medium">Moderator Roles</span>
                <RoleSelector
                  id="moderator-role-ids"
                  guildId={guildId}
                  selected={[
                    ...(draftConfig.permissions?.moderatorRoleIds ?? []),
                    ...(draftConfig.permissions?.moderatorRoleId &&
                    !(draftConfig.permissions?.moderatorRoleIds ?? []).includes(
                      draftConfig.permissions.moderatorRoleId,
                    )
                      ? [draftConfig.permissions.moderatorRoleId]
                      : []),
                  ]}
                  onChange={(selected) => {
                    updatePermissionsField('moderatorRoleIds', selected);
                  }}
                  placeholder="Select moderator roles"
                  disabled={saving}
                />
              </label>
            </div>
          }
          advancedContent={
            <label htmlFor="bot-owners" className="space-y-2 block">
              <span className="text-sm font-medium">Bot Owners</span>
              <input
                id="bot-owners"
                type="text"
                value={(draftConfig.permissions?.botOwners ?? []).join(', ')}
                onChange={(e) =>
                  updatePermissionsField(
                    'botOwners',
                    e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  )
                }
                disabled={saving}
                className={inputClasses}
                placeholder="Comma-separated user IDs"
              />
            </label>
          }
          forceOpenAdvanced={forceOpenAdvancedFeatureId === 'permissions'}
        />
      )}

      {visibleFeatureIds.has('audit-log') && (
        <SettingsFeatureCard
          featureId="audit-log"
          title="Audit Log"
          description="Record admin actions taken via the dashboard (config changes, XP adjustments, warnings)."
          enabled={draftConfig.auditLog?.enabled ?? true}
          onEnabledChange={(v) => updateAuditLogField('enabled', v)}
          disabled={saving}
          forceOpenAdvanced={forceOpenAdvancedFeatureId === 'audit-log'}
          basicContent={
            <AuditLogSection
              draftConfig={draftConfig ?? {}}
              saving={saving}
              onEnabledChange={(v) => updateAuditLogField('enabled', v)}
              onRetentionDaysChange={(days) => updateAuditLogField('retentionDays', days)}
            />
          }
        />
      )}
    </>
  );
}
