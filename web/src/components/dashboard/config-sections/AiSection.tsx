"use client";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { ToggleSwitch } from "@/components/dashboard/toggle-switch";
import { SystemPromptEditor } from "@/components/dashboard/system-prompt-editor";
import { SYSTEM_PROMPT_MAX_LENGTH } from "@/types/config";
import type { GuildConfig } from "@/lib/config-utils";

interface AiSectionProps {
  draftConfig: GuildConfig;
  saving: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onSystemPromptChange: (value: string) => void;
}

export function AiSection({ draftConfig, saving, onEnabledChange, onSystemPromptChange }: AiSectionProps) {
  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">AI Chat</CardTitle>
              <CardDescription>
                Configure the AI assistant behavior.
              </CardDescription>
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

      <SystemPromptEditor
        value={draftConfig.ai?.systemPrompt ?? ""}
        onChange={onSystemPromptChange}
        disabled={saving}
        maxLength={SYSTEM_PROMPT_MAX_LENGTH}
      />
    </>
  );
}
