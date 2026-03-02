'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChannelSelector } from '@/components/ui/channel-selector';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useGuildSelection } from '@/hooks/use-guild-selection';
import type { GuildConfig } from '@/lib/config-utils';

const ACTION_OPTIONS = [
  { value: 'none', label: 'No action' },
  { value: 'delete', label: 'Delete message' },
  { value: 'flag', label: 'Flag for review' },
  { value: 'warn', label: 'Warn user' },
  { value: 'timeout', label: 'Timeout user' },
  { value: 'kick', label: 'Kick user' },
  { value: 'ban', label: 'Ban user' },
] as const;

const MODEL_OPTIONS = [
  { value: 'claude-haiku-4-5', label: 'Claude Haiku (fast, low cost)' },
  { value: 'claude-sonnet-4-5', label: 'Claude Sonnet (balanced)' },
] as const;

interface AiAutoModSectionProps {
  draftConfig: GuildConfig;
  saving: boolean;
  onFieldChange: (field: string, value: unknown) => void;
}

/**
 * Render the AI Auto-Moderation settings section.
 * Controls enabling/disabling AI analysis, per-category thresholds and actions,
 * flag channel selection, and model selection.
 */
export function AiAutoModSection({ draftConfig, saving, onFieldChange }: AiAutoModSectionProps) {
  const guildId = useGuildSelection();
  const cfg = draftConfig.aiAutoMod as Record<string, unknown> | undefined;

  if (!cfg) return null;

  const enabled = Boolean(cfg.enabled);
  const thresholds = (cfg.thresholds as Record<string, number>) ?? {
    toxicity: 0.7,
    spam: 0.8,
    harassment: 0.7,
  };
  const actions = (cfg.actions as Record<string, string>) ?? {
    toxicity: 'flag',
    spam: 'delete',
    harassment: 'warn',
  };
  const flagChannelId = (cfg.flagChannelId as string) ?? '';
  const selectedFlagChannels = flagChannelId ? [flagChannelId] : [];
  const model = (cfg.model as string) ?? 'claude-haiku-4-5';
  const autoDelete = Boolean(cfg.autoDelete ?? true);

  const handleThresholdChange = (category: string, value: number[]) => {
    onFieldChange('thresholds', { ...thresholds, [category]: value[0] });
  };

  const handleActionChange = (category: string, value: string) => {
    onFieldChange('actions', { ...actions, [category]: value });
  };

  const handleFlagChannelChange = (channels: string[]) => {
    onFieldChange('flagChannelId', channels[0] ?? null);
  };

  const categories: Array<{ key: string; label: string; description: string }> = [
    {
      key: 'toxicity',
      label: 'Toxicity',
      description: 'Hateful language, slurs, extreme negativity',
    },
    {
      key: 'spam',
      label: 'Spam',
      description: 'Repetitive content, scam links, advertisements',
    },
    {
      key: 'harassment',
      label: 'Harassment',
      description: 'Targeted attacks, threats, bullying',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">AI Auto-Moderation</CardTitle>
            <CardDescription>
              Use Claude AI to analyze messages and take automatic moderation actions.
            </CardDescription>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(v) => onFieldChange('enabled', v)}
            disabled={saving}
            aria-label="Toggle AI Auto-Moderation"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Model */}
        <div className="space-y-2">
          <Label htmlFor="ai-automod-model">AI Model</Label>
          <Select
            value={model}
            onValueChange={(v) => onFieldChange('model', v)}
            disabled={saving || !enabled}
          >
            <SelectTrigger id="ai-automod-model">
              <SelectValue placeholder="Select model" />
            </SelectTrigger>
            <SelectContent>
              {MODEL_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Flag channel */}
        <div className="space-y-2">
          <Label>Flag Review Channel</Label>
          <p className="text-muted-foreground text-xs">
            Flagged messages are posted here for manual review.
          </p>
          {guildId ? (
            <ChannelSelector
              guildId={guildId}
              selected={selectedFlagChannels}
              onChange={handleFlagChannelChange}
              placeholder="Select review channel..."
              disabled={saving || !enabled}
              maxSelections={1}
              filter="text"
            />
          ) : (
            <p className="text-muted-foreground text-sm">Select a server first</p>
          )}
        </div>

        {/* Auto-delete */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Auto-delete flagged messages</Label>
            <p className="text-muted-foreground text-xs">
              Delete the offending message before taking action.
            </p>
          </div>
          <Switch
            checked={autoDelete}
            onCheckedChange={(v) => onFieldChange('autoDelete', v)}
            disabled={saving || !enabled}
            aria-label="Toggle auto-delete"
          />
        </div>

        {/* Per-category thresholds and actions */}
        <div className="space-y-4">
          <Label className="text-sm font-medium">Category Thresholds &amp; Actions</Label>
          <p className="text-muted-foreground text-xs">
            Set the confidence threshold (0–100%) and action for each category.
          </p>
          {categories.map(({ key, label, description }) => (
            <div key={key} className="rounded-md border p-4 space-y-3">
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-muted-foreground text-xs">{description}</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Threshold</span>
                    <span>{Math.round((thresholds[key] ?? 0.7) * 100)}%</span>
                  </div>
                  <Slider
                    min={0}
                    max={1}
                    step={0.05}
                    value={[thresholds[key] ?? 0.7]}
                    onValueChange={(v) => handleThresholdChange(key, v)}
                    disabled={saving || !enabled}
                  />
                </div>
                <div className="w-40">
                  <Select
                    value={actions[key] ?? 'flag'}
                    onValueChange={(v) => handleActionChange(key, v)}
                    disabled={saving || !enabled}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
