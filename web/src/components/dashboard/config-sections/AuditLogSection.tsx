'use client';

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
 * Audit Log settings content — rendered inside a SettingsFeatureCard wrapper
 * in config-editor.tsx. Do not add a Card here; the parent provides it.
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
    <div className="space-y-6">
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
          {retentionDays === 0
            ? 'Keeping audit entries indefinitely'
            : `Entries older than ${retentionDays} day${retentionDays === 1 ? '' : 's'} will be purged`}
        </p>
      </div>
    </div>
  );
}
