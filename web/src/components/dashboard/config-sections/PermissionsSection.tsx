'use client';

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

/**
 * Render a permissions configuration card with an enable toggle and admin/moderator role selectors.
 *
 * @returns The rendered permissions configuration card element
 */
export function PermissionsSection({
  draftConfig,
  guildId,
  saving,
  onFieldChange,
}: PermissionsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Permissions</CardTitle>
            <CardDescription>Configure role-based access control.</CardDescription>
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
      </CardContent>
    </Card>
  );
}
