'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { GuildConfig } from '@/lib/config-utils';

interface AuditLogSectionProps {
  draftConfig: GuildConfig;
  saving: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onRetentionDaysChange: (days: number) => void;
}

/**
 * Render the Audit Log settings card with controls for enabling audit logging
 * and configuring how long entries are retained before auto-purge.
 *
 * @param draftConfig - Current draft guild configuration.
 * @param saving - When true, controls are disabled while a save is in progress.
 * @param onEnabledChange - Called with the new enabled state.
 * @param onRetentionDaysChange - Called with the new retention period in days.
 */
export function AuditLogSection({
  draftConfig,
  saving,
  onEnabledChange,
  onRetentionDaysChange,
}: AuditLogSectionProps) {
  const enabled = draftConfig.auditLog?.enabled ?? true;
  const retentionDays = draftConfig.auditLog?.retentionDays ?? 90;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit Log</CardTitle>
        <CardDescription>
          Record admin actions taken via the dashboard (config changes, XP adjustments, warnings).
          Entries are stored in the database and viewable from the Audit Log page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable / Disable */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label className="text-base">Enable Audit Logging</Label>
            <p className="text-sm text-muted-foreground">
              When disabled, dashboard mutations are no longer recorded.
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={onEnabledChange}
            disabled={saving}
            aria-label="Enable audit logging"
          />
        </div>

        {/* Retention Days */}
        <div className="space-y-2">
          <Label htmlFor="audit-retention">Retention Period (days)</Label>
          <p className="text-sm text-muted-foreground">
            Audit entries older than this are automatically purged during nightly maintenance. Set to{' '}
            <strong>0</strong> to keep entries indefinitely.
          </p>
          <Input
            id="audit-retention"
            type="number"
            min={0}
            max={3650}
            step={1}
            className="w-40"
            value={retentionDays}
            disabled={saving || !enabled}
            onChange={(e) => {
              const parsed = Number.parseInt(e.target.value, 10);
              if (!Number.isNaN(parsed) && parsed >= 0) {
                onRetentionDaysChange(parsed);
              }
            }}
            aria-label="Audit log retention period in days"
          />
          <p className="text-xs text-muted-foreground">
            {retentionDays === 0 ? 'Keeping audit entries indefinitely' : `Entries older than ${retentionDays} day${retentionDays === 1 ? '' : 's'} will be purged`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
