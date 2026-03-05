'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { parseNumberInput } from '@/lib/config-normalization';
import type { GuildConfig } from '@/lib/config-utils';
import { ToggleSwitch } from '../toggle-switch';

interface MemorySectionProps {
  draftConfig: GuildConfig;
  saving: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onFieldChange: (field: string, value: unknown) => void;
}

/** Shared input styling for text inputs. */
const inputClasses =
  'w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Memory configuration section.
 *
 * Provides controls for AI context memory and auto-extraction settings.
 */
export function MemorySection({
  draftConfig,
  saving,
  onEnabledChange,
  onFieldChange,
}: MemorySectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Memory</CardTitle>
            <CardDescription>Configure AI context memory and auto-extraction.</CardDescription>
          </div>
          <ToggleSwitch
            checked={draftConfig.memory?.enabled ?? false}
            onChange={onEnabledChange}
            disabled={saving}
            label="Memory"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <label htmlFor="max-context-memories" className="space-y-2">
          <span className="text-sm font-medium">Max Context Memories</span>
          <input
            id="max-context-memories"
            type="number"
            min={1}
            value={draftConfig.memory?.maxContextMemories ?? 10}
            onChange={(e) => {
              const num = parseNumberInput(e.target.value, 1);
              if (num !== undefined) onFieldChange('maxContextMemories', num);
            }}
            disabled={saving}
            className={inputClasses}
          />
        </label>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Auto-Extract</span>
          <ToggleSwitch
            checked={draftConfig.memory?.autoExtract ?? false}
            onChange={(v) => onFieldChange('autoExtract', v)}
            disabled={saving}
            label="Auto-Extract"
          />
        </div>
      </CardContent>
    </Card>
  );
}
