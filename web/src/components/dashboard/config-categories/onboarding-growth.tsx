'use client';

import { useCallback, useState } from 'react';
import { useConfigContext } from '@/components/dashboard/config-context';
import { generateId, inputClasses } from '@/components/dashboard/config-editor-utils';
import { CommunitySettingsSection } from '@/components/dashboard/config-sections/CommunitySettingsSection';
import { SettingsFeatureCard } from '@/components/dashboard/config-workspace/settings-feature-card';
import { Button } from '@/components/ui/button';
import { ChannelSelector } from '@/components/ui/channel-selector';
import { RoleSelector } from '@/components/ui/role-selector';
import { ToggleSwitch } from '../toggle-switch';

/**
 * Onboarding & Growth category — renders the Welcome feature card directly,
 * then delegates Reputation, Engagement, TL;DR/AFK, and Challenges to
 * CommunitySettingsSection.
 */
export function OnboardingGrowthCategory() {
  const {
    draftConfig,
    saving,
    guildId,
    visibleFeatureIds,
    forceOpenAdvancedFeatureId,
    updateDraftConfig,
  } = useConfigContext();

  const [dmStepsRaw, setDmStepsRaw] = useState(() =>
    (draftConfig?.welcome?.dmSequence?.steps ?? []).join('\n'),
  );

  const updateWelcomeEnabled = useCallback(
    (enabled: boolean) => {
      updateDraftConfig((prev) => ({
        ...prev,
        welcome: { ...prev.welcome, enabled },
      }));
    },
    [updateDraftConfig],
  );

  const updateWelcomeMessage = useCallback(
    (message: string) => {
      updateDraftConfig((prev) => ({
        ...prev,
        welcome: { ...prev.welcome, message },
      }));
    },
    [updateDraftConfig],
  );

  const updateWelcomeField = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => ({
        ...prev,
        welcome: { ...(prev.welcome ?? {}), [field]: value },
      }));
    },
    [updateDraftConfig],
  );

  const updateWelcomeRoleMenu = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => ({
        ...prev,
        welcome: {
          ...(prev.welcome ?? {}),
          roleMenu: { ...(prev.welcome?.roleMenu ?? {}), [field]: value },
        },
      }));
    },
    [updateDraftConfig],
  );

  const updateWelcomeDmSequence = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => ({
        ...prev,
        welcome: {
          ...(prev.welcome ?? {}),
          dmSequence: { ...(prev.welcome?.dmSequence ?? {}), [field]: value },
        },
      }));
    },
    [updateDraftConfig],
  );

  if (!draftConfig) return null;

  return (
    <>
      {visibleFeatureIds.has('welcome') && (
        <SettingsFeatureCard
          featureId="welcome"
          title="Welcome Messages"
          description="Greet and onboard new members when they join."
          enabled={draftConfig.welcome?.enabled ?? false}
          onEnabledChange={updateWelcomeEnabled}
          disabled={saving}
          basicContent={
            <div className="space-y-4">
              <label htmlFor="welcome-message" className="space-y-2 block">
                <span className="text-sm font-medium">Welcome Message</span>
                <textarea
                  id="welcome-message"
                  value={draftConfig.welcome?.message ?? ''}
                  onChange={(e) => updateWelcomeMessage(e.target.value)}
                  rows={4}
                  disabled={saving}
                  className={inputClasses}
                  placeholder="Welcome message template..."
                  aria-describedby="welcome-message-hint"
                />
              </label>
              <p id="welcome-message-hint" className="text-xs text-muted-foreground">
                Use {'{user}'} for the member mention and {'{memberCount}'} for the server member
                count.
              </p>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <label htmlFor="rules-channel-id" className="space-y-2">
                  <span className="text-sm font-medium">Rules Channel ID</span>
                  <ChannelSelector
                    id="rules-channel-id"
                    guildId={guildId}
                    selected={
                      draftConfig.welcome?.rulesChannel ? [draftConfig.welcome.rulesChannel] : []
                    }
                    onChange={(selected) => updateWelcomeField('rulesChannel', selected[0] ?? null)}
                    disabled={saving}
                    placeholder="Select rules channel"
                    maxSelections={1}
                    filter="text"
                  />
                </label>
                <label htmlFor="verified-role-id" className="space-y-2">
                  <span className="text-sm font-medium">Verified Role ID</span>
                  <RoleSelector
                    id="verified-role-id"
                    guildId={guildId}
                    selected={
                      draftConfig.welcome?.verifiedRole ? [draftConfig.welcome.verifiedRole] : []
                    }
                    onChange={(selected) => updateWelcomeField('verifiedRole', selected[0] ?? null)}
                    disabled={saving}
                    placeholder="Select verified role"
                    maxSelections={1}
                  />
                </label>
                <label htmlFor="intro-channel-id" className="space-y-2">
                  <span className="text-sm font-medium">Intro Channel ID</span>
                  <ChannelSelector
                    id="intro-channel-id"
                    guildId={guildId}
                    selected={
                      draftConfig.welcome?.introChannel ? [draftConfig.welcome.introChannel] : []
                    }
                    onChange={(selected) => updateWelcomeField('introChannel', selected[0] ?? null)}
                    disabled={saving}
                    placeholder="Select intro channel"
                    maxSelections={1}
                    filter="text"
                  />
                </label>
              </div>
            </div>
          }
          advancedContent={
            <div className="space-y-4">
              <fieldset className="space-y-2 rounded-md border p-3">
                <legend className="text-sm font-medium">Role Menu</legend>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Enable self-assignable role menu
                  </span>
                  <ToggleSwitch
                    checked={draftConfig.welcome?.roleMenu?.enabled ?? false}
                    onChange={(v) => updateWelcomeRoleMenu('enabled', v)}
                    disabled={saving}
                    label="Role Menu"
                  />
                </div>
                <div className="space-y-3">
                  {(draftConfig.welcome?.roleMenu?.options ?? []).map((opt, i) => (
                    <div key={opt.id} className="flex flex-col gap-2 rounded-md border p-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={opt.label ?? ''}
                          onChange={(e) => {
                            const opts = [...(draftConfig.welcome?.roleMenu?.options ?? [])];
                            opts[i] = { ...opts[i], label: e.target.value };
                            updateWelcomeRoleMenu('options', opts);
                          }}
                          disabled={saving}
                          className={`${inputClasses} flex-1`}
                          placeholder="Label (shown in menu)"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const opts = [...(draftConfig.welcome?.roleMenu?.options ?? [])].filter(
                              (o) => o.id !== opt.id,
                            );
                            updateWelcomeRoleMenu('options', opts);
                          }}
                          disabled={saving}
                          aria-label={`Remove role option ${opt.label || i + 1}`}
                        >
                          ✕
                        </Button>
                      </div>
                      <RoleSelector
                        guildId={guildId}
                        selected={opt.roleId ? [opt.roleId] : []}
                        onChange={(selected) => {
                          const opts = [...(draftConfig.welcome?.roleMenu?.options ?? [])];
                          opts[i] = { ...opts[i], roleId: selected[0] ?? '' };
                          updateWelcomeRoleMenu('options', opts);
                        }}
                        placeholder="Select role"
                        disabled={saving}
                        maxSelections={1}
                      />
                      <input
                        type="text"
                        value={opt.description ?? ''}
                        onChange={(e) => {
                          const opts = [...(draftConfig.welcome?.roleMenu?.options ?? [])];
                          opts[i] = { ...opts[i], description: e.target.value || undefined };
                          updateWelcomeRoleMenu('options', opts);
                        }}
                        disabled={saving}
                        className={inputClasses}
                        placeholder="Description (optional)"
                      />
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const opts = [
                        ...(draftConfig.welcome?.roleMenu?.options ?? []),
                        { id: generateId(), label: '', roleId: '' },
                      ];
                      updateWelcomeRoleMenu('options', opts);
                    }}
                    disabled={saving || (draftConfig.welcome?.roleMenu?.options ?? []).length >= 25}
                  >
                    + Add Role Option
                  </Button>
                </div>
              </fieldset>

              <fieldset className="space-y-2 rounded-md border p-3">
                <legend className="text-sm font-medium">DM Sequence</legend>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Enable onboarding DMs</span>
                  <ToggleSwitch
                    checked={draftConfig.welcome?.dmSequence?.enabled ?? false}
                    onChange={(v) => updateWelcomeDmSequence('enabled', v)}
                    disabled={saving}
                    label="DM Sequence"
                  />
                </div>
                <textarea
                  value={dmStepsRaw}
                  onChange={(e) => setDmStepsRaw(e.target.value)}
                  onBlur={() => {
                    const parsed = dmStepsRaw
                      .split('\n')
                      .map((line) => line.trim())
                      .filter(Boolean);
                    updateWelcomeDmSequence('steps', parsed);
                    setDmStepsRaw(parsed.join('\n'));
                  }}
                  rows={4}
                  disabled={saving}
                  className={inputClasses}
                  placeholder="One DM step per line"
                />
              </fieldset>
            </div>
          }
          forceOpenAdvanced={forceOpenAdvancedFeatureId === 'welcome'}
        />
      )}

      <CommunitySettingsSection
        draftConfig={draftConfig}
        saving={saving}
        guildId={guildId}
        updateDraftConfig={updateDraftConfig}
        activeCategoryId="onboarding-growth"
        visibleFeatureIds={visibleFeatureIds}
        forceOpenAdvancedFeatureId={forceOpenAdvancedFeatureId}
      />
    </>
  );
}
