'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { parseNumberInput } from '@/lib/config-normalization';
import type { GuildConfig } from '@/lib/config-utils';
import { ToggleSwitch } from '../toggle-switch';

interface TicketsSectionProps {
  draftConfig: GuildConfig;
  saving: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onFieldChange: (field: string, value: unknown) => void;
}

/** Shared input styling for text inputs and selects. */
const inputClasses =
  'w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Renders the Tickets configuration card for a guild configuration.
 *
 * Displays an enable toggle and controls for ticket mode, support role ID,
 * category channel ID, auto-close hours, max open tickets per user, and
 * transcript channel ID. Inputs are disabled while `saving` is true and
 * changes are propagated via the provided callbacks.
 *
 * @param draftConfig - Current draft of the guild configuration
 * @param saving - Whether a save operation is in progress (disables inputs)
 * @param onEnabledChange - Called with the new enabled state when the toggle changes
 * @param onFieldChange - Called with field name and value when an input changes
 */
export function TicketsSection({
  draftConfig,
  saving,
  onEnabledChange,
  onFieldChange,
}: TicketsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Tickets</CardTitle>
          <ToggleSwitch
            checked={draftConfig.tickets?.enabled ?? false}
            onChange={onEnabledChange}
            disabled={saving}
            label="Tickets"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <label htmlFor="ticket-mode" className="space-y-2">
          <span className="text-sm font-medium">Ticket Mode</span>
          <select
            id="ticket-mode"
            value={draftConfig.tickets?.mode ?? 'thread'}
            onChange={(e) => onFieldChange('mode', e.target.value)}
            disabled={saving}
            className={inputClasses}
          >
            <option value="thread">Thread (private thread per ticket)</option>
            <option value="channel">Channel (dedicated text channel per ticket)</option>
          </select>
          <p className="text-xs text-muted-foreground">
            Thread mode creates private threads. Channel mode creates locked text channels with
            permission overrides.
          </p>
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label htmlFor="support-role-id" className="space-y-2">
            <span className="text-sm font-medium">Support Role ID</span>
            <input
              id="support-role-id"
              type="text"
              value={draftConfig.tickets?.supportRole ?? ''}
              onChange={(e) => onFieldChange('supportRole', e.target.value.trim() || null)}
              disabled={saving}
              className={inputClasses}
              placeholder="Role ID for support staff"
            />
          </label>
          <label htmlFor="category-channel-id" className="space-y-2">
            <span className="text-sm font-medium">Category Channel ID</span>
            <input
              id="category-channel-id"
              type="text"
              value={draftConfig.tickets?.category ?? ''}
              onChange={(e) => onFieldChange('category', e.target.value.trim() || null)}
              disabled={saving}
              className={inputClasses}
              placeholder="Category for tickets"
            />
          </label>
          <label htmlFor="auto-close-hours" className="space-y-2">
            <span className="text-sm font-medium">Auto-Close Hours</span>
            <input
              id="auto-close-hours"
              type="number"
              min={1}
              max={720}
              value={draftConfig.tickets?.autoCloseHours ?? 48}
              onChange={(e) => {
                const num = parseNumberInput(e.target.value, 1, 720);
                if (num !== undefined) onFieldChange('autoCloseHours', num);
              }}
              disabled={saving}
              className={inputClasses}
            />
            <p className="text-xs text-muted-foreground">
              Hours of inactivity before warning (then +24h to close)
            </p>
          </label>
          <label htmlFor="max-open-per-user" className="space-y-2">
            <span className="text-sm font-medium">Max Open Per User</span>
            <input
              id="max-open-per-user"
              type="number"
              min={1}
              max={20}
              value={draftConfig.tickets?.maxOpenPerUser ?? 3}
              onChange={(e) => {
                const num = parseNumberInput(e.target.value, 1, 20);
                if (num !== undefined) onFieldChange('maxOpenPerUser', num);
              }}
              disabled={saving}
              className={inputClasses}
            />
          </label>
          <label htmlFor="transcript-channel-id" className="space-y-2 col-span-2">
            <span className="text-sm font-medium">Transcript Channel ID</span>
            <input
              id="transcript-channel-id"
              type="text"
              value={draftConfig.tickets?.transcriptChannel ?? ''}
              onChange={(e) => onFieldChange('transcriptChannel', e.target.value.trim() || null)}
              disabled={saving}
              className={inputClasses}
              placeholder="Channel to post ticket transcripts"
            />
          </label>
        </div>
      </CardContent>
    </Card>
  );
}
