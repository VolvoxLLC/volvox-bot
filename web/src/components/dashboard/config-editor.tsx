'use client';

import { useEffect, useState } from 'react';
import { SELECTED_GUILD_KEY } from '@/lib/guild-selection';
import type { GuildConfig } from './config-editor-utils';
import { isGuildConfig } from './config-editor-utils';
import { DiscardChangesButton } from './reset-defaults-button';
import { SystemPromptEditor } from './system-prompt-editor';

function getSelectedGuildId(): string {
  try {
    return localStorage.getItem(SELECTED_GUILD_KEY) ?? '';
  } catch {
    return '';
  }
}

export function ConfigEditor() {
  const [draftConfig, setDraftConfig] = useState<GuildConfig | null>(null);
  const [savedConfig, setSavedConfig] = useState<GuildConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const guildId = getSelectedGuildId();
    if (!guildId) {
      setLoading(false);
      setDraftConfig({});
      return;
    }

    let cancelled = false;

    async function loadConfig() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/guilds/${encodeURIComponent(guildId)}/config`, {
          cache: 'no-store',
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data: unknown = await res.json();
        if (!isGuildConfig(data)) {
          throw new Error('Invalid config response');
        }

        if (!cancelled) {
          setDraftConfig(data);
          setSavedConfig(data);
          setHasChanges(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message || 'Failed to load config');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div>Loading configuration…</div>;
  }

  if (error) {
    return <div role="alert">{error}</div>;
  }

  async function saveChanges() {
    const guildId = getSelectedGuildId();
    if (!guildId || !draftConfig) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/guilds/${encodeURIComponent(guildId)}/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'ai.systemPrompt',
          value: draftConfig.ai?.systemPrompt ?? '',
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const updatedSection: unknown = await res.json();
      const nextDraftConfig = {
        ...(draftConfig ?? {}),
        ai: updatedSection && typeof updatedSection === 'object' ? updatedSection : draftConfig.ai,
      } satisfies GuildConfig;

      setDraftConfig(nextDraftConfig);
      setSavedConfig(nextDraftConfig);
      setHasChanges(false);
    } catch (err) {
      setError((err as Error).message || 'Failed to save config');
    } finally {
      setSaving(false);
    }
  }

  function discardChanges() {
    if (!savedConfig) {
      return;
    }

    setDraftConfig(structuredClone(savedConfig));
    setHasChanges(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Bot Configuration</h1>
          <p className="text-sm text-muted-foreground">Manage guild configuration sections.</p>
        </div>
        <div className="flex items-center gap-2">
          <DiscardChangesButton
            onReset={discardChanges}
            disabled={!hasChanges || saving}
            sectionLabel="all unsaved changes"
          />
          <button
            type="button"
            onClick={() => void saveChanges()}
            disabled={!hasChanges || saving}
            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">AI Chat</h2>
        <SystemPromptEditor
          value={draftConfig?.ai?.systemPrompt ?? ''}
          onChange={(systemPrompt) => {
            setDraftConfig((prev) => ({
              ...(prev ?? {}),
              ai: {
                ...(prev?.ai ?? {}),
                systemPrompt,
              },
            }));
            setHasChanges(true);
          }}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Welcome Messages</h2>
        <p className="text-sm text-muted-foreground">
          Welcome message configuration is available in the settings workspace.
        </p>
      </section>
    </div>
  );
}
