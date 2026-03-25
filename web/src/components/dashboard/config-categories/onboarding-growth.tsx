'use client';

import { useCallback, useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { useConfigContext } from '@/components/dashboard/config-context';
import { generateId, inputClasses } from '@/components/dashboard/config-editor-utils';
import { CommunitySettingsSection } from '@/components/dashboard/config-sections/CommunitySettingsSection';
import { SettingsFeatureCard } from '@/components/dashboard/config-workspace/settings-feature-card';
import { Button } from '@/components/ui/button';
import { ChannelSelector } from '@/components/ui/channel-selector';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RoleSelector } from '@/components/ui/role-selector';
import { ToggleSwitch } from '../toggle-switch';

/**
 * Inline info icon that shows help text in a popover on click.
 */
function InfoTip({ text }: { text: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="ml-1 inline-flex cursor-help align-middle text-muted-foreground/60 hover:text-muted-foreground"
          aria-label="More info"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" className="max-w-xs text-xs text-muted-foreground">
        {text}
      </PopoverContent>
    </Popover>
  );
}

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

  const updateWelcomeDynamic = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => ({
        ...prev,
        welcome: {
          ...(prev.welcome ?? {}),
          dynamic: { ...(prev.welcome?.dynamic ?? {}), [field]: value },
        },
      }));
    },
    [updateDraftConfig],
  );

  const welcomePreview = useMemo(() => {
    let text = draftConfig?.welcome?.message ?? '';
    if (!text) return '';

    // Static variables — sample values
    text = text
      .replace(/{user}/g, '@johndoe')
      .replace(/{username}/g, 'johndoe')
      .replace(/{server}/g, 'Volvox')
      .replace(/{memberCount}/g, '142');

    // Dynamic variables — sample values (only if dynamic is enabled)
    if (draftConfig?.welcome?.dynamic?.enabled) {
      text = text
        .replace(/{greeting}/g, 'Good morning @johndoe! You just joined Volvox.')
        .replace(
          /{vibeLine}/g,
          'Things are moving at a healthy pace in #general, so you\'ll fit right in.',
        )
        .replace(/{ctaLine}/g, 'Start in #general, check out #introductions, and browse #announcements.')
        .replace(/{milestoneLine}/g, 'You just rolled in as member #142.')
        .replace(/{timeOfDay}/g, 'morning')
        .replace(/{activityLevel}/g, 'steady')
        .replace(/{topChannels}/g, '#general, #projects, #showcase');
    }

    return text;
  }, [draftConfig?.welcome?.message, draftConfig?.welcome?.dynamic?.enabled]);

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
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <label htmlFor="welcome-message" className="space-y-2 block">
                  <span className="text-sm font-medium">Welcome Message</span>
                  <textarea
                    id="welcome-message"
                    value={draftConfig.welcome?.message ?? ''}
                    onChange={(e) => updateWelcomeMessage(e.target.value)}
                    rows={6}
                    disabled={saving}
                    className={inputClasses}
                    placeholder="Welcome message template..."
                    aria-describedby="welcome-message-hint"
                  />
                </label>
                <div className="space-y-2">
                  <span className="text-sm font-medium text-muted-foreground">Preview</span>
                  <textarea
                    value={welcomePreview}
                    rows={6}
                    disabled
                    readOnly
                    className={`${inputClasses} cursor-default opacity-70`}
                    aria-label="Welcome message preview"
                  />
                </div>
              </div>
              <details className="group">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                  Template Variables
                </summary>
                <div className="mt-2 space-y-3 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Always available</p>
                  <div className="grid grid-cols-1 gap-1.5">
                    <div>
                      <code>{'{user}'}</code> — Member mention{' '}
                      <span className="italic text-muted-foreground/70">@johndoe</span>
                    </div>
                    <div>
                      <code>{'{username}'}</code> — Plain username{' '}
                      <span className="italic text-muted-foreground/70">johndoe</span>
                    </div>
                    <div>
                      <code>{'{server}'}</code> — Server name{' '}
                      <span className="italic text-muted-foreground/70">Volvox</span>
                    </div>
                    <div>
                      <code>{'{memberCount}'}</code> — Member count{' '}
                      <span className="italic text-muted-foreground/70">142</span>
                    </div>
                  </div>
                  <p className="font-medium text-foreground">
                    Dynamic Welcome{' '}
                    <span className="font-normal text-muted-foreground">
                      (requires Dynamic Welcome enabled)
                    </span>
                  </p>
                  <div className="grid grid-cols-1 gap-1.5">
                    <div>
                      <code>{'{greeting}'}</code> — Time-of-day greeting{' '}
                      <span className="italic text-muted-foreground/70">
                        Good morning @johndoe! You just joined Volvox.
                      </span>
                    </div>
                    <div>
                      <code>{'{vibeLine}'}</code> — Activity description{' '}
                      <span className="italic text-muted-foreground/70">
                        {"You're catching us in a quiet window - perfect time to introduce yourself."}
                      </span>
                    </div>
                    <div>
                      <code>{'{ctaLine}'}</code> — Channel suggestions CTA{' '}
                      <span className="italic text-muted-foreground/70">
                        Start in #general, check out #introductions, and browse #announcements.
                      </span>
                    </div>
                    <div>
                      <code>{'{milestoneLine}'}</code> — Member milestone{' '}
                      <span className="italic text-muted-foreground/70">
                        You just rolled in as member #142.
                      </span>
                    </div>
                    <div>
                      <code>{'{timeOfDay}'}</code> — Time period{' '}
                      <span className="italic text-muted-foreground/70">morning</span>
                    </div>
                    <div>
                      <code>{'{activityLevel}'}</code> — Activity level{' '}
                      <span className="italic text-muted-foreground/70">steady</span>
                    </div>
                    <div>
                      <code>{'{topChannels}'}</code> — Most active channels{' '}
                      <span className="italic text-muted-foreground/70">
                        #general, #projects, #showcase
                      </span>
                    </div>
                  </div>
                </div>
              </details>

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
              <fieldset className="space-y-4 rounded-md border p-3">
                <legend className="text-sm font-medium">Dynamic Welcome</legend>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Enable dynamic context-aware variables
                    <InfoTip text="When enabled, your welcome template can use variables like {greeting}, {vibeLine}, {ctaLine}, {milestoneLine}, {timeOfDay}, {activityLevel}, and {topChannels} that change based on time of day, server activity, and channel popularity." />
                  </span>
                  <ToggleSwitch
                    checked={draftConfig.welcome?.dynamic?.enabled ?? false}
                    onChange={(v) => updateWelcomeDynamic('enabled', v)}
                    disabled={saving}
                    label="Dynamic Welcome"
                  />
                </div>

                <label className="space-y-1 block">
                  <span className="text-sm font-medium">
                    Highlight Channels
                    <InfoTip text="Channels suggested to new members in the {ctaLine} and {topChannels} variables. If no channels have recent activity, these are used as fallbacks." />
                  </span>
                  <ChannelSelector
                    guildId={guildId}
                    selected={draftConfig.welcome?.dynamic?.highlightChannels ?? []}
                    onChange={(selected) => updateWelcomeDynamic('highlightChannels', selected)}
                    disabled={saving}
                    placeholder="Select channels to highlight"
                    filter="text"
                  />
                </label>

                <label className="space-y-1 block">
                  <span className="text-sm font-medium">
                    Exclude Channels
                    <InfoTip text="Channels to ignore when measuring server activity. Messages in these channels won't count toward the activity level." />
                  </span>
                  <ChannelSelector
                    guildId={guildId}
                    selected={draftConfig.welcome?.dynamic?.excludeChannels ?? []}
                    onChange={(selected) => updateWelcomeDynamic('excludeChannels', selected)}
                    disabled={saving}
                    placeholder="Select channels to exclude"
                    filter="text"
                  />
                </label>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <label className="space-y-1 block">
                    <span className="text-sm font-medium">
                      Timezone
                      <InfoTip text="Used to determine time of day for the {greeting} and {timeOfDay} variables (e.g. morning vs evening greetings)." />
                    </span>
                    <input
                      type="text"
                      value={draftConfig.welcome?.dynamic?.timezone ?? 'America/New_York'}
                      onChange={(e) => updateWelcomeDynamic('timezone', e.target.value)}
                      disabled={saving}
                      className={inputClasses}
                      placeholder="America/New_York"
                    />
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-sm font-medium">
                      Activity Window
                      <InfoTip text="How many minutes of recent message history to consider when calculating the {activityLevel} (quiet/light/steady/busy/hype)." />
                    </span>
                    <input
                      type="number"
                      min={5}
                      max={10080}
                      value={draftConfig.welcome?.dynamic?.activityWindowMinutes ?? 45}
                      onChange={(e) =>
                        updateWelcomeDynamic('activityWindowMinutes', Number(e.target.value) || 45)
                      }
                      disabled={saving}
                      className={inputClasses}
                    />
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-sm font-medium">
                      Milestone Interval
                      <InfoTip text="Every Nth member gets a special milestone message in {milestoneLine} (e.g. every 25th member). Notable counts like 100, 500, 1000 always trigger." />
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      value={draftConfig.welcome?.dynamic?.milestoneInterval ?? 25}
                      onChange={(e) =>
                        updateWelcomeDynamic('milestoneInterval', Number(e.target.value) || 25)
                      }
                      disabled={saving}
                      className={inputClasses}
                    />
                  </label>
                </div>
              </fieldset>

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
