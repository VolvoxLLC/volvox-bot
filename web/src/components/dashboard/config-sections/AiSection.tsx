'use client';

import { SystemPromptEditor } from '@/components/dashboard/system-prompt-editor';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChannelSelector } from '@/components/ui/channel-selector';
import type { GuildConfig } from '@/lib/config-utils';
import { SYSTEM_PROMPT_MAX_LENGTH } from '@/types/config';
import { ToggleSwitch } from '../toggle-switch';

interface AiSectionProps {
  draftConfig: GuildConfig;
  guildId: string;
  saving: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onSystemPromptChange: (value: string) => void;
  onBlockedChannelsChange: (channels: string[]) => void;
}

/**
 * AI Chat configuration section.
 *
 * Provides controls for enabling/disabling AI chat, editing the system prompt,
 * and selecting blocked channels where the AI will not respond.
 */
export function AiSection({
  draftConfig,
  guildId,
  saving,
  onEnabledChange,
  onSystemPromptChange,
  onBlockedChannelsChange,
}: AiSectionProps) {
  return (
    <>
      {/* AI section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">AI Chat</CardTitle>
              <CardDescription>Configure the AI assistant behavior.</CardDescription>
            </div>
            <ToggleSwitch
              checked={draftConfig.ai?.enabled ?? false}
              onChange={onEnabledChange}
              disabled={saving}
              label="AI Chat"
            />
          </div>
        </CardHeader>
      </Card>

      {/* System Prompt */}
      <SystemPromptEditor
        value={draftConfig.ai?.systemPrompt ?? ''}
        onChange={onSystemPromptChange}
        disabled={saving}
        maxLength={SYSTEM_PROMPT_MAX_LENGTH}
      />

      {/* AI Blocked Channels */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Blocked Channels</CardTitle>
          <CardDescription>
            The AI will not respond in these channels (or their threads).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {guildId ? (
            <ChannelSelector
              id="ai-blocked-channels"
              guildId={guildId}
              selected={(draftConfig.ai?.blockedChannelIds ?? []) as string[]}
              onChange={onBlockedChannelsChange}
              placeholder="Select channels to block AI in..."
              disabled={saving}
              filter="text"
            />
          ) : (
            <p className="text-muted-foreground text-sm">Select a server first</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
