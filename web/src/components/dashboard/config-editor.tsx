'use client';

import { Loader2, Save } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useGuildSelection } from '@/hooks/use-guild-selection';
import type { GuildConfig } from '@/lib/config-utils';
import { computePatches, deepEqual } from '@/lib/config-utils';
import { SYSTEM_PROMPT_MAX_LENGTH } from '@/types/config';
import { ConfigDiff } from './config-diff';
import { AiSection } from './config-sections/AiSection';
import { ModerationSection } from './config-sections/ModerationSection';
import { TriageSection } from './config-sections/TriageSection';
import { WelcomeSection } from './config-sections/WelcomeSection';
import { DiscardChangesButton } from './reset-defaults-button';

/**
 * Type guard that checks whether a value is a guild configuration object returned by the API.
 */
function isGuildConfig(data: unknown): data is GuildConfig {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return false;
  const obj = data as Record<string, unknown>;
  const knownSections = ['ai', 'welcome', 'spam', 'moderation', 'triage'] as const;
  const hasKnownSection = knownSections.some((key) => key in obj);
  if (!hasKnownSection) return false;
  for (const key of knownSections) {
    if (key in obj) {
      const val = obj[key];
      if (val !== undefined && (typeof val !== 'object' || val === null || Array.isArray(val))) {
        return false;
      }
    }
  }
  return true;
}

export function ConfigEditor() {
  const guildId = useGuildSelection() ?? '';
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** The config as last fetched from the API (the "saved" state). */
  const [savedConfig, setSavedConfig] = useState<GuildConfig | null>(null);
  /** Working copy that the user edits. */
  const [draftConfig, setDraftConfig] = useState<GuildConfig | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // ── Load config when guild changes ─────────────────────────────
  const fetchConfig = useCallback(async (id: string) => {
    if (!id) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/guilds/${encodeURIComponent(id)}/config`, {
        signal: controller.signal,
        cache: 'no-store',
      });

      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const data: unknown = await res.json();
      if (!isGuildConfig(data)) {
        throw new Error('Invalid config response');
      }

      setSavedConfig(data);
      setDraftConfig(structuredClone(data));
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const msg = (err as Error).message || 'Failed to load config';
      setError(msg);
      toast.error('Failed to load config', { description: msg });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig(guildId);
    return () => abortRef.current?.abort();
  }, [guildId, fetchConfig]);

  // ── Derived state ──────────────────────────────────────────────
  const hasChanges = useMemo(() => {
    if (!savedConfig || !draftConfig) return false;
    return !deepEqual(savedConfig, draftConfig);
  }, [savedConfig, draftConfig]);

  const hasValidationErrors = useMemo(() => {
    if (!draftConfig) return false;
    const promptLength = draftConfig.ai?.systemPrompt?.length ?? 0;
    return promptLength > SYSTEM_PROMPT_MAX_LENGTH;
  }, [draftConfig]);

  // ── Warn on unsaved changes before navigation ──────────────────
  useEffect(() => {
    if (!hasChanges) return;

    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = '';
    }

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasChanges]);

  // ── Save changes (batched: parallel PATCH per section) ─────────
  const saveChanges = useCallback(async () => {
    if (!guildId || !savedConfig || !draftConfig) return;

    if (hasValidationErrors) {
      toast.error('Cannot save', {
        description: 'Fix validation errors before saving.',
      });
      return;
    }

    const patches = computePatches(savedConfig, draftConfig);
    if (patches.length === 0) {
      toast.info('No changes to save.');
      return;
    }

    const bySection = new Map<string, Array<{ path: string; value: unknown }>>();
    for (const patch of patches) {
      const section = patch.path.split('.')[0];
      if (!bySection.has(section)) bySection.set(section, []);
      bySection.get(section)?.push(patch);
    }

    setSaving(true);

    const saveAbortController = new AbortController();
    const { signal } = saveAbortController;

    const failedSections: string[] = [];

    async function sendSection(sectionPatches: Array<{ path: string; value: unknown }>) {
      for (const patch of sectionPatches) {
        const res = await fetch(`/api/guilds/${encodeURIComponent(guildId)}/config`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
          cache: 'no-store',
          signal,
        });

        if (res.status === 401) {
          saveAbortController.abort();
          window.location.href = '/login';
          return;
        }

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
        }
      }
    }

    try {
      const results = await Promise.allSettled(
        Array.from(bySection.entries()).map(async ([section, sectionPatches]) => {
          try {
            await sendSection(sectionPatches);
          } catch (err) {
            failedSections.push(section);
            throw err;
          }
        }),
      );

      const hasFailures = results.some((r) => r.status === 'rejected');

      if (hasFailures) {
        const succeededSections = Array.from(bySection.keys()).filter(
          (s) => !failedSections.includes(s),
        );
        if (succeededSections.length > 0) {
          const snapshot = draftConfig;
          setSavedConfig((prev) => {
            if (!prev) return prev;
            const updated = { ...prev };
            for (const section of succeededSections) {
              (updated as Record<string, unknown>)[section] = (snapshot as Record<string, unknown>)[
                section
              ];
            }
            return updated;
          });
        }
        toast.error('Some sections failed to save', {
          description: `Failed: ${failedSections.join(', ')}`,
        });
      } else {
        toast.success('Config saved successfully!');
        await fetchConfig(guildId);
      }
    } catch (err) {
      const msg = (err as Error).message || 'Failed to save config';
      toast.error('Failed to save config', { description: msg });
    } finally {
      setSaving(false);
    }
  }, [guildId, savedConfig, draftConfig, hasValidationErrors, fetchConfig]);

  // ── Keyboard shortcut: Ctrl/Cmd+S to save ──────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (hasChanges && !saving && !hasValidationErrors) {
          saveChanges();
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasChanges, saving, hasValidationErrors, saveChanges]);

  // ── Discard edits ──────────────────────────────────────────────
  const discardChanges = useCallback(() => {
    if (!savedConfig) return;
    setDraftConfig(structuredClone(savedConfig));
    toast.success('Changes discarded.');
  }, [savedConfig]);

  // ── Draft updaters ─────────────────────────────────────────────
  const updateSystemPrompt = useCallback((value: string) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, ai: { ...prev.ai, systemPrompt: value } };
    });
  }, []);

  const updateAiEnabled = useCallback((enabled: boolean) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, ai: { ...prev.ai, enabled } };
    });
  }, []);

  const updateWelcomeEnabled = useCallback((enabled: boolean) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, welcome: { ...prev.welcome, enabled } };
    });
  }, []);

  const updateWelcomeMessage = useCallback((message: string) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, welcome: { ...prev.welcome, message } };
    });
  }, []);

  const updateModerationEnabled = useCallback((enabled: boolean) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, moderation: { ...prev.moderation, enabled } };
    });
  }, []);

  const updateModerationField = useCallback((field: string, value: unknown) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, moderation: { ...prev.moderation, [field]: value } };
    });
  }, []);

  const updateModerationDmNotification = useCallback((action: string, value: boolean) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        moderation: {
          ...prev.moderation,
          dmNotifications: { ...prev.moderation?.dmNotifications, [action]: value },
        },
      };
    });
  }, []);

  const updateModerationEscalation = useCallback((enabled: boolean) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        moderation: {
          ...prev.moderation,
          escalation: { ...prev.moderation?.escalation, enabled },
        },
      };
    });
  }, []);

  const updateTriageEnabled = useCallback((enabled: boolean) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, triage: { ...prev.triage, enabled } };
    });
  }, []);

  const updateTriageField = useCallback((field: string, value: unknown) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, triage: { ...prev.triage, [field]: value } };
    });
  }, []);

  // ── No guild selected ──────────────────────────────────────────
  if (!guildId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Bot Configuration</CardTitle>
          <CardDescription>
            Select a server from the sidebar to manage its configuration.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // ── Loading state ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" role="status">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Loading configuration...</span>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────
  if (error) {
    return (
      <Card className="border-destructive/50" role="alert">
        <CardHeader>
          <CardTitle className="text-destructive">Failed to Load Config</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => fetchConfig(guildId)}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!draftConfig) return null;

  // ── Editor UI ──────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bot Configuration</h1>
          <p className="text-sm text-muted-foreground">
            Manage AI, welcome messages, and other settings.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DiscardChangesButton
            onReset={discardChanges}
            disabled={saving || !hasChanges}
            sectionLabel="all unsaved changes"
          />
          <Button
            onClick={saveChanges}
            disabled={saving || !hasChanges || hasValidationErrors}
            aria-keyshortcuts="Control+S Meta+S"
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Unsaved changes banner */}
      {hasChanges && (
        <div
          className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200"
          role="status"
        >
          You have unsaved changes.{' '}
          <kbd className="rounded border border-yellow-500/30 bg-yellow-500/10 px-1.5 py-0.5 font-mono text-xs">
            Ctrl+S
          </kbd>{' '}
          to save.
        </div>
      )}

      {/* AI section */}
      <AiSection
        draftConfig={draftConfig}
        saving={saving}
        onEnabledChange={updateAiEnabled}
        onSystemPromptChange={updateSystemPrompt}
      />

      {/* Welcome section */}
      <WelcomeSection
        draftConfig={draftConfig}
        saving={saving}
        onEnabledChange={updateWelcomeEnabled}
        onMessageChange={updateWelcomeMessage}
      />

      {/* Moderation section */}
      <ModerationSection
        draftConfig={draftConfig}
        saving={saving}
        onEnabledChange={updateModerationEnabled}
        onFieldChange={updateModerationField}
        onDmNotificationChange={updateModerationDmNotification}
        onEscalationChange={updateModerationEscalation}
      />

      {/* Triage section */}
      <TriageSection
        draftConfig={draftConfig}
        saving={saving}
        onEnabledChange={updateTriageEnabled}
        onFieldChange={updateTriageField}
      />

      {/* Diff view */}
      {hasChanges && savedConfig && <ConfigDiff original={savedConfig} modified={draftConfig} />}
    </div>
  );
}
