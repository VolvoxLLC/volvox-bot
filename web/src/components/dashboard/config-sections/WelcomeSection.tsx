'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChannelSelector } from '@/components/ui/channel-selector';
import { RoleSelector } from '@/components/ui/role-selector';
import type { GuildConfig } from '@/lib/config-utils';
import { ToggleSwitch } from '../toggle-switch';

interface WelcomeSectionProps {
  draftConfig: GuildConfig;
  guildId: string;
  saving: boolean;
  dmStepsRaw: string;
  onEnabledChange: (enabled: boolean) => void;
  onMessageChange: (message: string) => void;
  onFieldChange: (field: string, value: unknown) => void;
  onRoleMenuChange: (field: string, value: unknown) => void;
  onDmSequenceChange: (field: string, value: unknown) => void;
  onDmStepsRawChange: (value: string) => void;
}

/** Shared input styling for text inputs and textareas. */
const inputClasses =
  'w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Generate a UUID with fallback for environments without crypto.randomUUID.
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Welcome Messages configuration section.
 *
 * Provides controls for welcome messages, role menu, and DM sequence settings.
 */
export function WelcomeSection({
  draftConfig,
  guildId,
  saving,
  dmStepsRaw,
  onEnabledChange,
  onMessageChange,
  onFieldChange,
  onRoleMenuChange,
  onDmSequenceChange,
  onDmStepsRawChange,
}: WelcomeSectionProps) {
  const roleMenuOptions = draftConfig.welcome?.roleMenu?.options ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Welcome Messages</CardTitle>
            <CardDescription>Greet new members when they join the server.</CardDescription>
          </div>
          <ToggleSwitch
            checked={draftConfig.welcome?.enabled ?? false}
            onChange={onEnabledChange}
            disabled={saving}
            label="Welcome Messages"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <label htmlFor="welcome-message" className="space-y-2">
          <span className="text-sm font-medium">Welcome Message</span>
          <textarea
            id="welcome-message"
            value={draftConfig.welcome?.message ?? ''}
            onChange={(e) => onMessageChange(e.target.value)}
            rows={4}
            disabled={saving}
            className={inputClasses}
            placeholder="Welcome message template..."
            aria-describedby="welcome-message-hint"
          />
        </label>
        <p id="welcome-message-hint" className="mt-1 text-xs text-muted-foreground">
          Use {'{user}'} for the member mention and {'{memberCount}'} for the server member count.
        </p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <span className="text-sm font-medium">Rules Channel</span>
            {guildId ? (
              <ChannelSelector
                guildId={guildId}
                selected={draftConfig.welcome?.rulesChannel ? [draftConfig.welcome.rulesChannel] : []}
                onChange={(selected) => onFieldChange('rulesChannel', selected[0] ?? null)}
                placeholder="Select rules channel..."
                disabled={saving}
                maxSelections={1}
              />
            ) : (
              <p className="text-muted-foreground text-sm">Select a server first</p>
            )}
          </div>
          <div className="space-y-2">
            <span className="text-sm font-medium">Verified Role</span>
            {guildId ? (
              <RoleSelector
                guildId={guildId}
                selected={draftConfig.welcome?.verifiedRole ? [draftConfig.welcome.verifiedRole] : []}
                onChange={(selected) => onFieldChange('verifiedRole', selected[0] ?? null)}
                placeholder="Select verified role..."
                disabled={saving}
                maxSelections={1}
              />
            ) : (
              <p className="text-muted-foreground text-sm">Select a server first</p>
            )}
          </div>
          <div className="space-y-2">
            <span className="text-sm font-medium">Intro Channel</span>
            {guildId ? (
              <ChannelSelector
                guildId={guildId}
                selected={draftConfig.welcome?.introChannel ? [draftConfig.welcome.introChannel] : []}
                onChange={(selected) => onFieldChange('introChannel', selected[0] ?? null)}
                placeholder="Select intro channel..."
                disabled={saving}
                maxSelections={1}
              />
            ) : (
              <p className="text-muted-foreground text-sm">Select a server first</p>
            )}
          </div>
        </div>

        <fieldset className="space-y-2 rounded-md border p-3">
          <legend className="text-sm font-medium">Role Menu</legend>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Enable self-assignable role menu</span>
            <ToggleSwitch
              checked={draftConfig.welcome?.roleMenu?.enabled ?? false}
              onChange={(v) => onRoleMenuChange('enabled', v)}
              disabled={saving}
              label="Role Menu"
            />
          </div>
          <div className="space-y-3">
            {roleMenuOptions.map((opt, i) => (
              <div key={opt.id} className="flex flex-col gap-2 rounded-md border p-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={opt.label ?? ''}
                    onChange={(e) => {
                      const opts = [...roleMenuOptions];
                      opts[i] = { ...opts[i], label: e.target.value };
                      onRoleMenuChange('options', opts);
                    }}
                    disabled={saving}
                    className={`${inputClasses} flex-1`}
                    placeholder="Label (shown in menu)"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const opts = roleMenuOptions.filter((o) => o.id !== opt.id);
                      onRoleMenuChange('options', opts);
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
                    const opts = [...roleMenuOptions];
                    opts[i] = { ...opts[i], roleId: selected[0] ?? '' };
                    onRoleMenuChange('options', opts);
                  }}
                  placeholder="Select role"
                  disabled={saving}
                  maxSelections={1}
                />
                <input
                  type="text"
                  value={opt.description ?? ''}
                  onChange={(e) => {
                    const opts = [...roleMenuOptions];
                    opts[i] = { ...opts[i], description: e.target.value || undefined };
                    onRoleMenuChange('options', opts);
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
                const opts = [...roleMenuOptions, { id: generateId(), label: '', roleId: '' }];
                onRoleMenuChange('options', opts);
              }}
              disabled={saving || roleMenuOptions.length >= 25}
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
              onChange={(v) => onDmSequenceChange('enabled', v)}
              disabled={saving}
              label="DM Sequence"
            />
          </div>
          <textarea
            value={dmStepsRaw}
            onChange={(e) => {
              const raw = e.target.value;
              onDmStepsRawChange(raw);
              // Call onDmSequenceChange on every change to prevent Ctrl+S data loss
              const parsed = raw
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean);
              onDmSequenceChange('steps', parsed);
            }}
            onBlur={(e) => {
              // Use e.currentTarget.value for consistency
              const parsed = e.currentTarget.value
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean);
              onDmSequenceChange('steps', parsed);
              onDmStepsRawChange(parsed.join('\n'));
            }}
            rows={4}
            disabled={saving}
            className={inputClasses}
            placeholder="One DM step per line"
          />
        </fieldset>
      </CardContent>
    </Card>
  );
}
