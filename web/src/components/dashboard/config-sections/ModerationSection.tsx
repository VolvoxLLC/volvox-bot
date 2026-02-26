"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { ToggleSwitch } from "@/components/dashboard/toggle-switch";
import type { GuildConfig } from "@/lib/config-utils";

const inputClasses =
  "w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

interface ModerationSectionProps {
  draftConfig: GuildConfig;
  saving: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onFieldChange: (field: string, value: unknown) => void;
  onDmNotificationChange: (action: string, value: boolean) => void;
  onEscalationChange: (enabled: boolean) => void;
}

export function ModerationSection({
  draftConfig,
  saving,
  onEnabledChange,
  onFieldChange,
  onDmNotificationChange,
  onEscalationChange,
}: ModerationSectionProps) {
  if (!draftConfig.moderation) return null;

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
        <label className="space-y-2">
          <span className="text-sm font-medium">Alert Channel ID</span>
          <input
            type="text"
            value={draftConfig.moderation?.alertChannelId ?? ""}
            onChange={(e) => onFieldChange("alertChannelId", e.target.value)}
            disabled={saving}
            className={inputClasses}
            placeholder="Channel ID for moderation alerts"
          />
        </label>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Auto-delete flagged messages</span>
          <ToggleSwitch
            checked={draftConfig.moderation?.autoDelete ?? false}
            onChange={(v) => onFieldChange("autoDelete", v)}
            disabled={saving}
            label="Auto Delete"
          />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">DM Notifications</legend>
          {(["warn", "timeout", "kick", "ban"] as const).map((action) => (
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
      </CardContent>
    </Card>
  );
}
