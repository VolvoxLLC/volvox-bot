'use client';

import { type FocusEvent, useCallback } from 'react';
import { useConfigContext } from '@/components/dashboard/config-context';
import { inputClasses, parseNumberInput } from '@/components/dashboard/config-editor-utils';
import { AuditLogSection } from '@/components/dashboard/config-sections/AuditLogSection';
import { ChannelSelector } from '@/components/ui/channel-selector';
import { InfoTip } from '@/components/ui/info-tip';
import { RoleSelector } from '@/components/ui/role-selector';
import { cn } from '@/lib/utils';
import { ToggleSwitch } from '../toggle-switch';
import { ConfigCategoryLayout } from './config-category-layout';

/**
 * Render the configuration UI for moderation, starboard, permissions, and audit-log feature categories.
 *
 * Displays the controls for the currently active category obtained from the configuration context,
 * wiring feature enable toggles and handlers that update the draft configuration. Returns `null`
 * when the draft configuration or the active tab is not available.
 *
 * @returns The rendered category UI element, or `null` if configuration or active tab is absent.
 */
export function ModerationSafetyCategory() {
  const { draftConfig, saving, guildId, updateDraftConfig, activeTabId } = useConfigContext();

  const activeTab = activeTabId;

  const selectNumericValueOnFocus = useCallback((event: FocusEvent<HTMLInputElement>) => {
    // Number inputs do not expose a better cross-browser text selection API than
    // select(). Keep the current best-effort behavior without changing the control
    // type, which still highlights the value in Chromium-based browsers.
    event.currentTarget.select();
  }, []);

  // Moderation state updates
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

  // Starboard state updates
  const updateStarboardField = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => ({
        ...prev,
        starboard: { ...prev.starboard, [field]: value },
      }));
    },
    [updateDraftConfig],
  );

  // Permissions state updates
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

  // Audit Log state updates
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
  if (!activeTab) return null;

  let isCurrentFeatureEnabled = false;
  let handleToggleCurrentFeature = (_v: boolean) => {};

  switch (activeTab) {
    case 'moderation':
      isCurrentFeatureEnabled = draftConfig.moderation?.enabled ?? false;
      handleToggleCurrentFeature = updateModerationEnabled;
      break;
    case 'starboard':
      isCurrentFeatureEnabled = draftConfig.starboard?.enabled ?? false;
      handleToggleCurrentFeature = (v) => updateStarboardField('enabled', v);
      break;
    case 'permissions':
      isCurrentFeatureEnabled = draftConfig.permissions?.enabled ?? false;
      handleToggleCurrentFeature = (v) => updatePermissionsField('enabled', v);
      break;
    case 'audit-log':
      isCurrentFeatureEnabled = draftConfig.auditLog?.enabled ?? true;
      handleToggleCurrentFeature = (v) => updateAuditLogField('enabled', v);
      break;
    default:
      break;
  }

  return (
    <ConfigCategoryLayout
      featureId={activeTab}
      toggle={{
        checked: isCurrentFeatureEnabled,
        onChange: handleToggleCurrentFeature,
        disabled: saving,
      }}
    >
      {/* Moderation Layout */}
      {activeTab === 'moderation' && (
        <div className="space-y-6">
          <div className="p-4 sm:p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl space-y-6">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold tracking-wide text-foreground/90">
                Core Settings
              </h3>
            </div>

            <div className="space-y-3">
              <label
                htmlFor="alert-channel-id"
                className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1"
              >
                Moderation Logs
              </label>
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
            </div>

            <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/10 border border-border/40 hover:bg-muted/20 transition-colors">
              <div className="space-y-0.5">
                <span className="text-sm font-bold text-foreground/90">Auto-clean Flags</span>
                <p className="text-[11px] text-muted-foreground/60 font-medium">
                  Automatically remove messages that trigger safety filters.
                </p>
              </div>
              <ToggleSwitch
                checked={draftConfig.moderation?.autoDelete ?? false}
                onChange={(v) => updateModerationField('autoDelete', v)}
                disabled={saving}
                label="Auto Delete"
              />
            </div>

            <div className="space-y-3 pt-4 border-t border-border/40">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1">
                DM Notification Matrix
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(['warn', 'timeout', 'kick', 'ban'] as const).map((action) => (
                  <div
                    key={action}
                    className="flex items-center justify-between p-3 rounded-xl bg-muted/10 border border-border/40 hover:bg-muted/20 transition-colors"
                  >
                    <span className="text-sm font-medium text-foreground capitalize">{action}</span>
                    <ToggleSwitch
                      checked={draftConfig.moderation?.dmNotifications?.[action] ?? false}
                      onChange={(v) => updateModerationDmNotification(action, v)}
                      disabled={saving}
                      label={`DM on ${action}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl space-y-6">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold tracking-wide text-foreground/90">
                Enforcement Rules
              </h3>
            </div>

            <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/10 border border-border/40">
              <div className="space-y-0.5">
                <span className="text-sm font-bold text-foreground/90">Escalation Engine</span>
                <p className="text-[11px] text-muted-foreground/60 font-medium">
                  Automatically increase punishment severity for repeat offenders.
                </p>
              </div>
              <ToggleSwitch
                checked={draftConfig.moderation?.escalation?.enabled ?? false}
                onChange={(v) => updateModerationEscalation(v)}
                disabled={saving}
                label="Escalation"
              />
            </div>

            <div className="space-y-4 pt-4 border-t border-border/40">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
                    Rate Limiting
                  </span>
                  <InfoTip text="Prevent spam by limiting how many messages users can send in a short burst." />
                </div>
                <ToggleSwitch
                  checked={draftConfig.moderation?.rateLimit?.enabled ?? false}
                  onChange={(v) => updateRateLimitField('enabled', v)}
                  disabled={saving}
                  label="Rate Limiting"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor="max-messages"
                    className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1"
                  >
                    Max Messages
                  </label>
                  <input
                    id="max-messages"
                    type="number"
                    min={1}
                    value={draftConfig.moderation?.rateLimit?.maxMessages ?? 10}
                    onChange={(e) => {
                      const num = parseNumberInput(e.target.value, 1);
                      if (num !== undefined) updateRateLimitField('maxMessages', num);
                    }}
                    onFocus={selectNumericValueOnFocus}
                    disabled={saving}
                    className={cn(inputClasses, 'text-center')}
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="window-seconds"
                    className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1"
                  >
                    Window (S)
                  </label>
                  <input
                    id="window-seconds"
                    type="number"
                    min={1}
                    value={draftConfig.moderation?.rateLimit?.windowSeconds ?? 10}
                    onChange={(e) => {
                      const num = parseNumberInput(e.target.value, 1);
                      if (num !== undefined) updateRateLimitField('windowSeconds', num);
                    }}
                    onFocus={selectNumericValueOnFocus}
                    disabled={saving}
                    className={cn(inputClasses, 'text-center')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 pt-2">
                <div className="space-y-2">
                  <label
                    htmlFor="mute-after-triggers"
                    className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1"
                  >
                    Mute Trigger
                  </label>
                  <input
                    id="mute-after-triggers"
                    type="number"
                    min={1}
                    value={draftConfig.moderation?.rateLimit?.muteAfterTriggers ?? 3}
                    onChange={(e) => {
                      const num = parseNumberInput(e.target.value, 1);
                      if (num !== undefined) updateRateLimitField('muteAfterTriggers', num);
                    }}
                    onFocus={selectNumericValueOnFocus}
                    disabled={saving}
                    className={cn(inputClasses, 'text-center')}
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="mute-window-s"
                    className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1"
                  >
                    Action Win (S)
                  </label>
                  <input
                    id="mute-window-s"
                    type="number"
                    min={1}
                    value={draftConfig.moderation?.rateLimit?.muteWindowSeconds ?? 300}
                    onChange={(e) => {
                      const num = parseNumberInput(e.target.value, 1);
                      if (num !== undefined) updateRateLimitField('muteWindowSeconds', num);
                    }}
                    onFocus={selectNumericValueOnFocus}
                    disabled={saving}
                    className={cn(inputClasses, 'text-center')}
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="mute-duration-s"
                    className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1"
                  >
                    Mute Dur (S)
                  </label>
                  <input
                    id="mute-duration-s"
                    type="number"
                    min={1}
                    value={draftConfig.moderation?.rateLimit?.muteDurationSeconds ?? 300}
                    onChange={(e) => {
                      const num = parseNumberInput(e.target.value, 1);
                      if (num !== undefined) updateRateLimitField('muteDurationSeconds', num);
                    }}
                    onFocus={selectNumericValueOnFocus}
                    disabled={saving}
                    className={cn(inputClasses, 'text-center')}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
                  Link Filter
                </span>
                <InfoTip text="Block specific domains from being shared in the server." />
              </div>
              <ToggleSwitch
                checked={draftConfig.moderation?.linkFilter?.enabled ?? false}
                onChange={(v) => updateLinkFilterField('enabled', v)}
                disabled={saving}
                label="Link Filtering"
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="blocked-domains"
                className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1"
              >
                Blocked Domains
              </label>
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
                onFocus={(e) => e.target.select()}
                disabled={saving}
                className={inputClasses}
                placeholder="example.com, spam.net"
              />
            </div>
          </div>

          <div className="p-4 sm:p-6 rounded-[24px] border border-border/40 bg-muted/20 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
                  Role Protection
                </span>
                <InfoTip text="Prevent specific roles from being targeted by automated moderation actions." />
              </div>
              <ToggleSwitch
                checked={draftConfig.moderation?.protectRoles?.enabled ?? true}
                onChange={(v) => updateProtectRolesField('enabled', v)}
                disabled={saving}
                label="Protect Roles"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/10 border border-border/40">
                <span className="text-[11px] font-bold text-foreground capitalize">Admins</span>
                <ToggleSwitch
                  checked={draftConfig.moderation?.protectRoles?.includeAdmins ?? true}
                  onChange={(v) => updateProtectRolesField('includeAdmins', v)}
                  disabled={saving}
                  label="Include admins"
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/10 border border-border/40">
                <span className="text-[11px] font-bold text-foreground capitalize">Moderators</span>
                <ToggleSwitch
                  checked={draftConfig.moderation?.protectRoles?.includeModerators ?? true}
                  onChange={(v) => updateProtectRolesField('includeModerators', v)}
                  disabled={saving}
                  label="Include moderators"
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/10 border border-border/40">
                <span className="text-[11px] font-bold text-foreground capitalize">Owner</span>
                <ToggleSwitch
                  checked={draftConfig.moderation?.protectRoles?.includeServerOwner ?? true}
                  onChange={(v) => updateProtectRolesField('includeServerOwner', v)}
                  disabled={saving}
                  label="Include server owner"
                />
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <label
                htmlFor="protected-role-ids"
                className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1"
              >
                Additional Protected Roles
              </label>
              <RoleSelector
                id="protected-role-ids"
                guildId={guildId}
                selected={(draftConfig.moderation?.protectRoles?.roleIds ?? []) as string[]}
                onChange={(selected) => updateProtectRolesField('roleIds', selected)}
                disabled={saving}
                placeholder="Select protected roles"
              />
            </div>
          </div>
        </div>
      )}

      {/* Starboard Layout */}
      {activeTab === 'starboard' && (
        <div className="space-y-6">
          <div className="p-4 sm:p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl space-y-6">
            <div className="space-y-3">
              <label
                htmlFor="starboard-channel-id"
                className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1 block"
              >
                Target Channel
              </label>
              <ChannelSelector
                id="starboard-channel-id"
                guildId={guildId}
                selected={draftConfig.starboard?.channelId ? [draftConfig.starboard.channelId] : []}
                onChange={(selected) => updateStarboardField('channelId', selected[0] ?? '')}
                disabled={saving}
                placeholder="Select starboard channel"
                maxSelections={1}
                filter="text"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-3">
                <label
                  htmlFor="threshold"
                  className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1 block"
                >
                  Star Threshold
                </label>
                <input
                  id="threshold"
                  type="number"
                  min={1}
                  value={draftConfig.starboard?.threshold ?? 3}
                  onChange={(e) => {
                    const num = parseNumberInput(e.target.value, 1);
                    if (num !== undefined) updateStarboardField('threshold', num);
                  }}
                  onFocus={selectNumericValueOnFocus}
                  disabled={saving}
                  className={inputClasses}
                />
              </div>

              <div className="space-y-3">
                <label
                  htmlFor="emoji"
                  className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1 block"
                >
                  Watch Emoji
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="emoji"
                    type="text"
                    value={draftConfig.starboard?.emoji ?? '*'}
                    onChange={(e) => updateStarboardField('emoji', e.target.value.trim() || '*')}
                    onFocus={(e) => e.target.select()}
                    disabled={saving}
                    className={inputClasses}
                    placeholder="*"
                  />
                  <button
                    type="button"
                    onClick={() => updateStarboardField('emoji', '*')}
                    disabled={saving}
                    className={`shrink-0 rounded-[12px] px-3 py-2 text-xs font-medium transition-colors border ${
                      draftConfig.starboard?.emoji === '*'
                        ? 'bg-primary/20 text-primary border-primary/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]'
                        : 'bg-muted/30 text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    Any ✱
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/10 border border-border/40 hover:bg-muted/20 transition-colors">
              <span className="text-sm font-bold text-foreground">Allow Self-Star</span>
              <ToggleSwitch
                checked={draftConfig.starboard?.selfStarAllowed ?? false}
                onChange={(v) => updateStarboardField('selfStarAllowed', v)}
                disabled={saving}
                label="Self-Star Allowed"
              />
            </div>

            <div className="space-y-3 pt-4 border-t border-border/40">
              <label
                htmlFor="ignored-channels"
                className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1 block"
              >
                Ignored Channels
              </label>
              <ChannelSelector
                id="ignored-channels"
                guildId={guildId}
                selected={(draftConfig.starboard?.ignoredChannels ?? []) as string[]}
                onChange={(selected) => updateStarboardField('ignoredChannels', selected)}
                disabled={saving}
                placeholder="Select ignored channels"
                filter="text"
              />
            </div>
          </div>
        </div>
      )}

      {/* Permissions Layout */}
      {activeTab === 'permissions' && (
        <div className="space-y-6">
          <div className="p-4 sm:p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl space-y-6">
            <div className="space-y-3">
              <label
                htmlFor="admin-role-ids"
                className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1 block"
              >
                Admin Roles
              </label>
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
            </div>

            <div className="space-y-3">
              <label
                htmlFor="moderator-role-ids"
                className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1 block"
              >
                Moderator Roles
              </label>
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
            </div>
          </div>

          <div className="p-4 sm:p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl">
            <div className="space-y-3">
              <label
                htmlFor="bot-owners"
                className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 ml-1 block"
              >
                Bot Owners (Overrides)
              </label>
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
                onFocus={(e) => e.target.select()}
                disabled={saving}
                className={inputClasses}
                placeholder="Comma-separated user IDs"
              />
            </div>
          </div>
        </div>
      )}

      {/* Audit Log Layout */}
      {activeTab === 'audit-log' && (
        <div className="space-y-6">
          <div className="p-4 sm:p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl">
            <AuditLogSection
              draftConfig={draftConfig ?? {}}
              saving={saving}
              onEnabledChange={(v) => updateAuditLogField('enabled', v)}
              onRetentionDaysChange={(days) => updateAuditLogField('retentionDays', days)}
            />
          </div>
        </div>
      )}
    </ConfigCategoryLayout>
  );
}
