'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RoleSelector } from '@/components/ui/role-selector';
import type { GuildConfig } from '@/lib/config-utils';
import { ToggleSwitch } from '../toggle-switch';

interface PermissionsSectionProps {
  draftConfig: GuildConfig;
  guildId: string;
  saving: boolean;
  onFieldChange: (field: string, value: unknown) => void;
}

/** Shared input styling for text inputs. */
const inputClasses =
  'w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Permissions configuration section.
 *
 * Provides controls for role-based access and bot owner overrides.
 */
export function PermissionsSection({
  draftConfig,
  guildId,
  saving,
  onFieldChange,
}: PermissionsSectionProps) {
  // Local state for bot owners raw input (parsed on blur)
  const botOwnersDisplay = (draftConfig.permissions?.botOwners ?? []).join(', ');
  const [botOwnersRaw, setBotOwnersRaw] = useState(botOwnersDisplay);
  useEffect(() => {
    setBotOwnersRaw(botOwnersDisplay);
  }, [botOwnersDisplay]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Permissions</CardTitle>
            <CardDescription>Configure role-based access and bot owner overrides.</CardDescription>
          </div>
          <ToggleSwitch
            checked={draftConfig.permissions?.enabled ?? false}
            onChange={(v) => onFieldChange('enabled', v)}
            disabled={saving}
            label="Permissions"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <span className="text-sm font-medium">Admin Role</span>
          <RoleSelector
            id="admin-role-id"
            guildId={guildId}
            selected={
              draftConfig.permissions?.adminRoleId ? [draftConfig.permissions.adminRoleId] : []
            }
            onChange={(selected) => onFieldChange('adminRoleId', selected[0] ?? null)}
            placeholder="Select admin role"
            disabled={saving}
            maxSelections={1}
          />
        </div>
        <div className="space-y-2">
          <span className="text-sm font-medium">Moderator Role</span>
          <RoleSelector
            id="moderator-role-id"
            guildId={guildId}
            selected={
              draftConfig.permissions?.moderatorRoleId
                ? [draftConfig.permissions.moderatorRoleId]
                : []
            }
            onChange={(selected) => onFieldChange('moderatorRoleId', selected[0] ?? null)}
            placeholder="Select moderator role"
            disabled={saving}
            maxSelections={1}
          />
        </div>
        <label htmlFor="bot-owners" className="space-y-2">
          <span className="text-sm font-medium">Bot Owners</span>
          <input
            id="bot-owners"
            type="text"
            value={botOwnersRaw}
            onChange={(e) => setBotOwnersRaw(e.target.value)}
            onBlur={() =>
              onFieldChange(
                'botOwners',
                botOwnersRaw
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
      </CardContent>
    </Card>
  );
}
