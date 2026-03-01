'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { GuildConfig } from '@/lib/config-utils';

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
          <Switch
            checked={draftConfig.welcome?.enabled ?? false}
            onCheckedChange={onEnabledChange}
            disabled={saving}
            aria-label="Toggle Welcome Messages"
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Label htmlFor="welcome-message">Welcome Message</Label>
          <Textarea
            id="welcome-message"
            value={draftConfig.welcome?.message ?? ''}
            onChange={(e) => onMessageChange(e.target.value)}
            rows={4}
            disabled={saving}
            placeholder="Welcome message template..."
            aria-describedby="welcome-message-hint"
          />
        </div>
        <p id="welcome-message-hint" className="mt-1 text-xs text-muted-foreground">
          Use {'{user}'} for the member mention and {'{memberCount}'} for the server member count.
        </p>
      </CardContent>
    </Card>
  );
}
