'use client';

import { ToggleSwitch } from '@/components/dashboard/toggle-switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { GuildConfig } from '@/lib/config-utils';

const inputClasses =
  'w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

interface WelcomeSectionProps {
  draftConfig: GuildConfig;
  saving: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onMessageChange: (message: string) => void;
}

export function WelcomeSection({
  draftConfig,
  saving,
  onEnabledChange,
  onMessageChange,
}: WelcomeSectionProps) {
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
      <CardContent>
        <label className="space-y-2">
          <span className="text-sm font-medium">Welcome Message</span>
          <textarea
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
      </CardContent>
    </Card>
  );
}
