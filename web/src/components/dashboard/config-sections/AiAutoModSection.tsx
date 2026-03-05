'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { decimalToPercent, percentToDecimal } from '@/lib/config-normalization';
import type { GuildConfig } from '@/lib/config-utils';
import { ToggleSwitch } from '../toggle-switch';

interface AiAutoModSectionProps {
  draftConfig: GuildConfig;
  saving: boolean;
  onFieldChange: (field: string, value: unknown) => void;
}

/** Shared input styling for text inputs and selects. */
const inputClasses =
  'w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

/**
 * AI Auto-Moderation configuration section.
 *
 * Provides controls for AI-powered moderation including thresholds,
 * actions per category (toxicity, spam, harassment), and auto-delete settings.
 */
export function AiAutoModSection({ draftConfig, saving, onFieldChange }: AiAutoModSectionProps) {
  // Provide defaults so section renders even when aiAutoMod is missing
  const cfg = draftConfig.aiAutoMod ?? {
    enabled: false,
    thresholds: { toxicity: 0.7, spam: 0.7, harassment: 0.7 },
    actions: { toxicity: 'flag', spam: 'flag', harassment: 'flag' },
    flagChannelId: null,
    autoDelete: true,
  };

  const thresholds = (cfg.thresholds as Record<string, number>) ?? {};
  const actions = (cfg.actions as Record<string, string>) ?? {};

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
          <ToggleSwitch
            checked={cfg.enabled ?? false}
            onChange={(v) => onFieldChange('enabled', v)}
            disabled={saving}
            label="AI Auto-Moderation"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <label htmlFor="ai-automod-flag-channel" className="space-y-2">
          <span className="text-sm font-medium">Flag Review Channel ID</span>
          <input
            id="ai-automod-flag-channel"
            type="text"
            value={(cfg.flagChannelId as string) ?? ''}
            onChange={(e) => onFieldChange('flagChannelId', e.target.value || null)}
            disabled={saving}
            className={inputClasses}
            placeholder="Channel ID where flagged messages are posted"
          />
        </label>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Auto-delete flagged messages</span>
          <ToggleSwitch
            checked={cfg.autoDelete ?? true}
            onChange={(v) => onFieldChange('autoDelete', v)}
            disabled={saving}
            label="Auto-delete"
          />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Thresholds (0–100)</legend>
          <p className="text-muted-foreground text-xs">
            Confidence threshold (%) above which the action triggers.
          </p>
          {(['toxicity', 'spam', 'harassment'] as const).map((cat) => (
            <label key={cat} htmlFor={`ai-threshold-${cat}`} className="flex items-center gap-3">
              <span className="w-24 text-sm capitalize">{cat}</span>
              <input
                id={`ai-threshold-${cat}`}
                type="number"
                min={0}
                max={100}
                step={5}
                value={decimalToPercent(thresholds[cat] ?? 0.7)}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  const v = percentToDecimal(raw);
                  onFieldChange('thresholds', {
                    ...thresholds,
                    [cat]: v,
                  });
                }}
                disabled={saving}
                className={`${inputClasses} w-24`}
              />
              <span className="text-muted-foreground text-xs">%</span>
            </label>
          ))}
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Actions</legend>
          {(['toxicity', 'spam', 'harassment'] as const).map((cat) => (
            <label key={cat} htmlFor={`ai-action-${cat}`} className="flex items-center gap-3">
              <span className="w-24 text-sm capitalize">{cat}</span>
              <select
                id={`ai-action-${cat}`}
                value={actions[cat] ?? 'flag'}
                onChange={(e) => {
                  onFieldChange('actions', {
                    ...actions,
                    [cat]: e.target.value,
                  });
                }}
                disabled={saving}
                className={inputClasses}
              >
                <option value="none">No action</option>
                <option value="delete">Delete message</option>
                <option value="flag">Flag for review</option>
                <option value="warn">Warn user</option>
                <option value="timeout">Timeout user</option>
                <option value="kick">Kick user</option>
                <option value="ban">Ban user</option>
              </select>
            </label>
          ))}
        </fieldset>
      </CardContent>
    </Card>
  );
}
