'use client';

import { Loader2, Save } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { RoleSelector } from '@/components/ui/role-selector';
import { GUILD_SELECTED_EVENT, SELECTED_GUILD_KEY } from '@/lib/guild-selection';
import type { BotConfig, DeepPartial } from '@/types/config';
import { SYSTEM_PROMPT_MAX_LENGTH } from '@/types/config';
import { ConfigDiff } from './config-diff';
import { DiscardChangesButton } from './reset-defaults-button';
import { SystemPromptEditor } from './system-prompt-editor';

/** Config sections exposed by the API — all fields optional for partial API responses. */
type GuildConfig = DeepPartial<BotConfig>;

/** Shared input styling for text inputs and textareas in the config editor. */
const inputClasses =
  'w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Generate a UUID with fallback for environments without crypto.randomUUID.
 *
 * @returns A UUID v4 string.
 */
function generateId(): string {
  // Use crypto.randomUUID if available
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: generate a UUID-like string
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const DEFAULT_ACTIVITY_BADGES = [
  { days: 90, label: '👑 Legend' },
  { days: 30, label: '🌳 Veteran' },
  { days: 7, label: '🌿 Regular' },
  { days: 0, label: '🌱 Newcomer' },
] as const;

/**
 * Parse a numeric text input into a number, applying optional minimum/maximum bounds.
 *
 * @param raw - The input string to parse; an empty string yields `undefined`.
 * @param min - Optional lower bound; if the parsed value is less than `min`, `min` is returned.
 * @param max - Optional upper bound; if the parsed value is greater than `max`, `max` is returned.
 * @returns `undefined` if `raw` is empty or cannot be parsed as a finite number, otherwise the parsed number (clamped to `min`/`max` when provided).
 */
function parseNumberInput(raw: string, min?: number, max?: number): number | undefined {
  if (raw === '') return undefined;
  const num = Number(raw);
  if (!Number.isFinite(num)) return undefined;
  if (min !== undefined && num < min) return min;
  if (max !== undefined && num > max) return max;
  return num;
}

/**
 * Type guard that checks whether a value is a guild configuration object returned by the API.
 *
 * @returns `true` if the value is an object containing at least one known top-level section
 *   (`ai`, `welcome`, `spam`, `moderation`, `triage`, `starboard`, `permissions`, `memory`) and each present section is a plain object
 *   (not an array or null). Returns `false` otherwise.
 */
function isGuildConfig(data: unknown): data is GuildConfig {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return false;
  const obj = data as Record<string, unknown>;
  const knownSections = [
    'ai',
    'welcome',
    'spam',
    'moderation',
    'triage',
    'starboard',
    'permissions',
    'memory',
    'help',
    'announce',
    'snippet',
    'poll',
    'showcase',
    'tldr',
    'reputation',
    'afk',
    'engagement',
    'github',
    'review',
    'challenges',
    'tickets',
  ] as const;
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

/**
 * Edit a guild's bot configuration through a multi-section UI.
 *
 * Loads the authoritative config for the selected guild, maintains a mutable draft for user edits,
 * computes and applies per-section patches to persist changes, and provides controls to save,
 * discard, and validate edits (including an unsaved-changes warning and keyboard shortcut).
 *
 * @returns The editor UI as JSX when a guild is selected and a draft config exists; `null` otherwise.
 */
export function ConfigEditor() {
  const [guildId, setGuildId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** The config as last fetched from the API (the "saved" state). */
  const [savedConfig, setSavedConfig] = useState<GuildConfig | null>(null);
  /** Working copy that the user edits. */
  const [draftConfig, setDraftConfig] = useState<GuildConfig | null>(null);

  /** Raw textarea strings — kept separate so partial input isn't stripped on every keystroke. */
  const [dmStepsRaw, setDmStepsRaw] = useState('');

  const abortRef = useRef<AbortController | null>(null);

  const updateDraftConfig = useCallback((updater: (prev: GuildConfig) => GuildConfig) => {
    setDraftConfig((prev) => updater((prev ?? {}) as GuildConfig));
  }, []);

  // ── Guild selection ────────────────────────────────────────────
  useEffect(() => {
    let stored = '';
    try {
      stored = localStorage.getItem(SELECTED_GUILD_KEY) ?? '';
    } catch {
      // localStorage may be unavailable in SSR or restricted environments
    }
    setGuildId(stored);

    function onGuildSelected(e: Event) {
      const detail = (e as CustomEvent<string>).detail;
      setGuildId(detail);
    }
    function onStorage(e: StorageEvent) {
      if (e.key === SELECTED_GUILD_KEY) {
        setGuildId(e.newValue ?? '');
      }
    }

    window.addEventListener(GUILD_SELECTED_EVENT, onGuildSelected);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(GUILD_SELECTED_EVENT, onGuildSelected);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

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

      // Ensure role menu options have stable IDs
      if (data.welcome?.roleMenu?.options) {
        data.welcome.roleMenu.options = data.welcome.roleMenu.options.map((opt) => ({
          ...opt,
          id: opt.id || generateId(),
        }));
      }
      setSavedConfig(data);
      setDraftConfig(structuredClone(data));
      setDmStepsRaw((data.welcome?.dmSequence?.steps ?? []).join('\n'));
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

  // Check for validation errors before allowing save.
  // Currently only validates system prompt length; extend with additional checks as needed.
  const hasValidationErrors = useMemo(() => {
    if (!draftConfig) return false;
    // Role menu validation: all options must have non-empty label and roleId
    const roleMenuEnabled = draftConfig.welcome?.roleMenu?.enabled ?? false;
    const roleMenuOptions = draftConfig.welcome?.roleMenu?.options ?? [];
    const hasRoleMenuErrors = roleMenuOptions.some(
      (opt) => !opt.label?.trim() || !opt.roleId?.trim(),
    );
    if (roleMenuEnabled && hasRoleMenuErrors) return true;
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

    // Group patches by top-level section for batched requests
    const bySection = new Map<string, Array<{ path: string; value: unknown }>>();
    for (const patch of patches) {
      const section = patch.path.split('.')[0];
      const sectionPatches = bySection.get(section);
      if (sectionPatches) {
        sectionPatches.push(patch);
        continue;
      }
      bySection.set(section, [patch]);
    }

    setSaving(true);

    // Shared AbortController for all section saves - aborts all in-flight requests on 401
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
          // Abort all other in-flight requests before redirecting
          saveAbortController.abort();
          window.location.href = '/login';
          throw new Error('Unauthorized');
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
        // Partial failure: merge only succeeded sections into savedConfig so
        // the user can retry failed sections without losing their unsaved edits.
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
        // Full success: reload to get the authoritative version from the server
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
    setDmStepsRaw((savedConfig.welcome?.dmSequence?.steps ?? []).join('\n'));
    toast.success('Changes discarded.');
  }, [savedConfig]);

  // ── Draft updaters ─────────────────────────────────────────────
  const updateSystemPrompt = useCallback(
    (value: string) => {
      updateDraftConfig((prev) => {
        if (!prev) return prev;
        return { ...prev, ai: { ...prev.ai, systemPrompt: value } } as GuildConfig;
      });
    },
    [updateDraftConfig],
  );

  const updateAiEnabled = useCallback(
    (enabled: boolean) => {
      updateDraftConfig((prev) => {
        if (!prev) return prev;
        return { ...prev, ai: { ...prev.ai, enabled } } as GuildConfig;
      });
    },
    [updateDraftConfig],
  );

  const updateWelcomeEnabled = useCallback(
    (enabled: boolean) => {
      updateDraftConfig((prev) => {
        if (!prev) return prev;
        return { ...prev, welcome: { ...prev.welcome, enabled } } as GuildConfig;
      });
    },
    [updateDraftConfig],
  );

  const updateWelcomeMessage = useCallback(
    (message: string) => {
      updateDraftConfig((prev) => {
        if (!prev) return prev;
        return { ...prev, welcome: { ...prev.welcome, message } } as GuildConfig;
      });
    },
    [updateDraftConfig],
  );

  const updateWelcomeField = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => {
        if (!prev) return prev;
        return { ...prev, welcome: { ...(prev.welcome ?? {}), [field]: value } } as GuildConfig;
      });
    },
    [updateDraftConfig],
  );

  const updateWelcomeRoleMenu = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          welcome: {
            ...(prev.welcome ?? {}),
            roleMenu: { ...(prev.welcome?.roleMenu ?? {}), [field]: value },
          },
        } as GuildConfig;
      });
    },
    [updateDraftConfig],
  );

  const updateWelcomeDmSequence = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          welcome: {
            ...(prev.welcome ?? {}),
            dmSequence: { ...(prev.welcome?.dmSequence ?? {}), [field]: value },
          },
        } as GuildConfig;
      });
    },
    [updateDraftConfig],
  );

  const updateModerationEnabled = useCallback(
    (enabled: boolean) => {
      updateDraftConfig((prev) => {
        if (!prev) return prev;
        return { ...prev, moderation: { ...prev.moderation, enabled } } as GuildConfig;
      });
    },
    [updateDraftConfig],
  );

  const updateModerationField = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => {
        if (!prev) return prev;
        return { ...prev, moderation: { ...prev.moderation, [field]: value } } as GuildConfig;
      });
    },
    [updateDraftConfig],
  );

  const updateModerationDmNotification = useCallback(
    (action: string, value: boolean) => {
      updateDraftConfig((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          moderation: {
            ...prev.moderation,
            dmNotifications: { ...prev.moderation?.dmNotifications, [action]: value },
          },
        } as GuildConfig;
      });
    },
    [updateDraftConfig],
  );

  const updateModerationEscalation = useCallback(
    (enabled: boolean) => {
      updateDraftConfig((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          moderation: {
            ...prev.moderation,
            escalation: { ...prev.moderation?.escalation, enabled },
          },
        } as GuildConfig;
      });
    },
    [updateDraftConfig],
  );

  const updateTriageEnabled = useCallback(
    (enabled: boolean) => {
      updateDraftConfig((prev) => {
        if (!prev) return prev;
        return { ...prev, triage: { ...prev.triage, enabled } } as GuildConfig;
      });
    },
    [updateDraftConfig],
  );

  const updateTriageField = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => {
        if (!prev) return prev;
        return { ...prev, triage: { ...prev.triage, [field]: value } } as GuildConfig;
      });
    },
    [updateDraftConfig],
  );

  const updateStarboardField = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => {
        if (!prev) return prev;
        return { ...prev, starboard: { ...prev.starboard, [field]: value } } as GuildConfig;
      });
    },
    [updateDraftConfig],
  );

  const updateRateLimitField = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          moderation: {
            ...prev.moderation,
            rateLimit: { ...prev.moderation?.rateLimit, [field]: value },
          },
        } as GuildConfig;
      });
    },
    [updateDraftConfig],
  );

  const updateLinkFilterField = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          moderation: {
            ...prev.moderation,
            linkFilter: { ...prev.moderation?.linkFilter, [field]: value },
          },
        } as GuildConfig;
      });
    },
    [updateDraftConfig],
  );

  const updatePermissionsField = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => {
        if (!prev) return prev;
        return { ...prev, permissions: { ...prev.permissions, [field]: value } } as GuildConfig;
      });
    },
    [updateDraftConfig],
  );

  const updateMemoryField = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => {
        if (!prev) return prev;
        return { ...prev, memory: { ...prev.memory, [field]: value } } as GuildConfig;
      });
    },
    [updateDraftConfig],
  );

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
      <output className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Loading configuration...</span>
      </output>
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
        <output
          aria-live="polite"
          className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200"
        >
          You have unsaved changes.{' '}
          <kbd className="rounded border border-yellow-500/30 bg-yellow-500/10 px-1.5 py-0.5 font-mono text-xs">
            Ctrl+S
          </kbd>{' '}
          to save.
        </output>
      )}

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
              onChange={updateAiEnabled}
              disabled={saving}
              label="AI Chat"
            />
          </div>
        </CardHeader>
      </Card>

      {/* System Prompt */}
      <SystemPromptEditor
        value={draftConfig.ai?.systemPrompt ?? ''}
        onChange={updateSystemPrompt}
        disabled={saving}
        maxLength={SYSTEM_PROMPT_MAX_LENGTH}
      />

      {/* Welcome section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Welcome Messages</CardTitle>
              <CardDescription>Greet new members when they join the server.</CardDescription>
            </div>
            <ToggleSwitch
              checked={draftConfig.welcome?.enabled ?? false}
              onChange={updateWelcomeEnabled}
              disabled={saving}
              label="Welcome Messages"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="space-y-2">
            <span className="text-sm font-medium">Welcome Message</span>
            <textarea
              value={draftConfig.welcome?.message ?? ''}
              onChange={(e) => updateWelcomeMessage(e.target.value)}
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

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <label className="space-y-2">
              <span className="text-sm font-medium">Rules Channel ID</span>
              <input
                type="text"
                value={draftConfig.welcome?.rulesChannel ?? ''}
                onChange={(e) => updateWelcomeField('rulesChannel', e.target.value.trim() || null)}
                disabled={saving}
                className={inputClasses}
                placeholder="Channel where Accept Rules button lives"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Verified Role ID</span>
              <input
                type="text"
                value={draftConfig.welcome?.verifiedRole ?? ''}
                onChange={(e) => updateWelcomeField('verifiedRole', e.target.value.trim() || null)}
                disabled={saving}
                className={inputClasses}
                placeholder="Role granted after rules acceptance"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Intro Channel ID</span>
              <input
                type="text"
                value={draftConfig.welcome?.introChannel ?? ''}
                onChange={(e) => updateWelcomeField('introChannel', e.target.value.trim() || null)}
                disabled={saving}
                className={inputClasses}
                placeholder="Channel to prompt member intros"
              />
            </label>
          </div>

          <fieldset className="space-y-2 rounded-md border p-3">
            <legend className="text-sm font-medium">Role Menu</legend>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Enable self-assignable role menu
              </span>
              <ToggleSwitch
                checked={draftConfig.welcome?.roleMenu?.enabled ?? false}
                onChange={(v) => updateWelcomeRoleMenu('enabled', v)}
                disabled={saving}
                label="Role Menu"
              />
            </div>
            <div className="space-y-3">
              {(draftConfig.welcome?.roleMenu?.options ?? []).map((opt, i) => (
                <div key={opt.id} className="flex flex-col gap-2 rounded-md border p-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={opt.label ?? ''}
                      onChange={(e) => {
                        const opts = [...(draftConfig.welcome?.roleMenu?.options ?? [])];
                        opts[i] = { ...opts[i], label: e.target.value };
                        updateWelcomeRoleMenu('options', opts);
                      }}
                      disabled={saving}
                      className={`${inputClasses} flex-1`}
                      placeholder="Label (shown in menu)"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const opts = [...(draftConfig.welcome?.roleMenu?.options ?? [])].filter(
                          (o) => o.id !== opt.id,
                        );
                        updateWelcomeRoleMenu('options', opts);
                      }}
                      disabled={saving}
                      aria-label={`Remove role option ${opt.label || i + 1}`}
                    >
                      ✕
                    </Button>
                  </div>
                  <RoleSelector
                    guildId={guildId}
                    selected={opt.roleId ? [opt.roleId] : []}
                    onChange={(selected) => {
                      const opts = [...(draftConfig.welcome?.roleMenu?.options ?? [])];
                      opts[i] = { ...opts[i], roleId: selected[0] ?? '' };
                      updateWelcomeRoleMenu('options', opts);
                    }}
                    placeholder="Select role"
                    disabled={saving}
                    maxSelections={1}
                  />
                  <input
                    type="text"
                    value={opt.description ?? ''}
                    onChange={(e) => {
                      const opts = [...(draftConfig.welcome?.roleMenu?.options ?? [])];
                      opts[i] = { ...opts[i], description: e.target.value || undefined };
                      updateWelcomeRoleMenu('options', opts);
                    }}
                    disabled={saving}
                    className={inputClasses}
                    placeholder="Description (optional)"
                  />
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const opts = [
                    ...(draftConfig.welcome?.roleMenu?.options ?? []),
                    { id: generateId(), label: '', roleId: '' },
                  ];
                  updateWelcomeRoleMenu('options', opts);
                }}
                disabled={saving || (draftConfig.welcome?.roleMenu?.options ?? []).length >= 25}
              >
                + Add Role Option
              </Button>
            </div>
          </fieldset>

          <fieldset className="space-y-2 rounded-md border p-3">
            <legend className="text-sm font-medium">DM Sequence</legend>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Enable onboarding DMs</span>
              <ToggleSwitch
                checked={draftConfig.welcome?.dmSequence?.enabled ?? false}
                onChange={(v) => updateWelcomeDmSequence('enabled', v)}
                disabled={saving}
                label="DM Sequence"
              />
            </div>
            <textarea
              value={dmStepsRaw}
              onChange={(e) => setDmStepsRaw(e.target.value)}
              onBlur={() => {
                const parsed = dmStepsRaw
                  .split('\n')
                  .map((line) => line.trim())
                  .filter(Boolean);
                updateWelcomeDmSequence('steps', parsed);
                setDmStepsRaw(parsed.join('\n'));
              }}
              rows={4}
              disabled={saving}
              className={inputClasses}
              placeholder="One DM step per line"
            />
          </fieldset>
        </CardContent>
      </Card>

      {/* Moderation section */}
      {draftConfig.moderation && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Moderation</CardTitle>
                <CardDescription>
                  Configure moderation, escalation, and logging settings.
                </CardDescription>
              </div>
              <ToggleSwitch
                checked={draftConfig.moderation?.enabled ?? false}
                onChange={updateModerationEnabled}
                disabled={saving}
                label="Moderation"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="space-y-2">
              <span className="text-sm font-medium">Alert Channel ID</span>
              <input
                type="text"
                value={draftConfig.moderation?.alertChannelId ?? ''}
                onChange={(e) => updateModerationField('alertChannelId', e.target.value)}
                disabled={saving}
                className={inputClasses}
                placeholder="Channel ID for moderation alerts"
              />
            </label>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Auto-delete flagged messages</span>
              <ToggleSwitch
                checked={draftConfig.moderation?.autoDelete ?? false}
                onChange={(v) => updateModerationField('autoDelete', v)}
                disabled={saving}
                label="Auto Delete"
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">DM Notifications</legend>
              {(['warn', 'timeout', 'kick', 'ban'] as const).map((action) => (
                <div key={action} className="flex items-center justify-between">
                  <span className="text-sm capitalize text-muted-foreground">{action}</span>
                  <ToggleSwitch
                    checked={draftConfig.moderation?.dmNotifications?.[action] ?? false}
                    onChange={(v) => updateModerationDmNotification(action, v)}
                    disabled={saving}
                    label={`DM on ${action}`}
                  />
                </div>
              ))}
            </fieldset>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Escalation Enabled</span>
              <ToggleSwitch
                checked={draftConfig.moderation?.escalation?.enabled ?? false}
                onChange={(v) => updateModerationEscalation(v)}
                disabled={saving}
                label="Escalation"
              />
            </div>

            {/* Rate Limiting sub-section */}
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Rate Limiting</legend>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Enabled</span>
                <ToggleSwitch
                  checked={draftConfig.moderation?.rateLimit?.enabled ?? false}
                  onChange={(v) => updateRateLimitField('enabled', v)}
                  disabled={saving}
                  label="Rate Limiting"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="space-y-2">
                  <span className="text-sm text-muted-foreground">Max Messages</span>
                  <input
                    type="number"
                    min={1}
                    value={draftConfig.moderation?.rateLimit?.maxMessages ?? 10}
                    onChange={(e) => {
                      const num = parseNumberInput(e.target.value, 1);
                      if (num !== undefined) updateRateLimitField('maxMessages', num);
                    }}
                    disabled={saving}
                    className={inputClasses}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-muted-foreground">Window (seconds)</span>
                  <input
                    type="number"
                    min={1}
                    value={draftConfig.moderation?.rateLimit?.windowSeconds ?? 10}
                    onChange={(e) => {
                      const num = parseNumberInput(e.target.value, 1);
                      if (num !== undefined) updateRateLimitField('windowSeconds', num);
                    }}
                    disabled={saving}
                    className={inputClasses}
                  />
                </label>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <label className="space-y-2">
                  <span className="text-sm text-muted-foreground">Mute After Triggers</span>
                  <input
                    type="number"
                    min={1}
                    value={draftConfig.moderation?.rateLimit?.muteAfterTriggers ?? 3}
                    onChange={(e) => {
                      const num = parseNumberInput(e.target.value, 1);
                      if (num !== undefined) updateRateLimitField('muteAfterTriggers', num);
                    }}
                    disabled={saving}
                    className={inputClasses}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-muted-foreground">Mute Window (s)</span>
                  <input
                    type="number"
                    min={1}
                    value={draftConfig.moderation?.rateLimit?.muteWindowSeconds ?? 300}
                    onChange={(e) => {
                      const num = parseNumberInput(e.target.value, 1);
                      if (num !== undefined) updateRateLimitField('muteWindowSeconds', num);
                    }}
                    disabled={saving}
                    className={inputClasses}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-muted-foreground">Mute Duration (s)</span>
                  <input
                    type="number"
                    min={1}
                    value={draftConfig.moderation?.rateLimit?.muteDurationSeconds ?? 300}
                    onChange={(e) => {
                      const num = parseNumberInput(e.target.value, 1);
                      if (num !== undefined) updateRateLimitField('muteDurationSeconds', num);
                    }}
                    disabled={saving}
                    className={inputClasses}
                  />
                </label>
              </div>
            </fieldset>

            {/* Link Filtering sub-section */}
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Link Filtering</legend>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Enabled</span>
                <ToggleSwitch
                  checked={draftConfig.moderation?.linkFilter?.enabled ?? false}
                  onChange={(v) => updateLinkFilterField('enabled', v)}
                  disabled={saving}
                  label="Link Filtering"
                />
              </div>
              <label className="space-y-2">
                <span className="text-sm text-muted-foreground">Blocked Domains</span>
                <input
                  type="text"
                  value={(draftConfig.moderation?.linkFilter?.blockedDomains ?? []).join(', ')}
                  onChange={(e) =>
                    updateLinkFilterField(
                      'blockedDomains',
                      e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    )
                  }
                  disabled={saving}
                  className={inputClasses}
                  placeholder="example.com, spam.net"
                />
              </label>
            </fieldset>
          </CardContent>
        </Card>
      )}

      {/* Triage section */}
      {draftConfig.triage && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Triage</CardTitle>
                <CardDescription>
                  Configure message triage classifier, responder models, and channels.
                </CardDescription>
              </div>
              <ToggleSwitch
                checked={draftConfig.triage?.enabled ?? false}
                onChange={updateTriageEnabled}
                disabled={saving}
                label="Triage"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="space-y-2">
              <span className="text-sm font-medium">Classify Model</span>
              <input
                type="text"
                value={draftConfig.triage?.classifyModel ?? ''}
                onChange={(e) => updateTriageField('classifyModel', e.target.value)}
                disabled={saving}
                className={inputClasses}
                placeholder="e.g. claude-haiku-4-5"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Respond Model</span>
              <input
                type="text"
                value={draftConfig.triage?.respondModel ?? ''}
                onChange={(e) => updateTriageField('respondModel', e.target.value)}
                disabled={saving}
                className={inputClasses}
                placeholder="e.g. claude-sonnet-4-6"
              />
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="space-y-2">
                <span className="text-sm font-medium">Classify Budget</span>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={draftConfig.triage?.classifyBudget ?? 0}
                  onChange={(e) => {
                    const num = parseNumberInput(e.target.value, 0);
                    if (num !== undefined) updateTriageField('classifyBudget', num);
                  }}
                  disabled={saving}
                  className={inputClasses}
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium">Respond Budget</span>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={draftConfig.triage?.respondBudget ?? 0}
                  onChange={(e) => {
                    const num = parseNumberInput(e.target.value, 0);
                    if (num !== undefined) updateTriageField('respondBudget', num);
                  }}
                  disabled={saving}
                  className={inputClasses}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <label className="space-y-2">
                <span className="text-sm font-medium">Default Interval (ms)</span>
                <input
                  type="number"
                  min={1}
                  value={draftConfig.triage?.defaultInterval ?? 3000}
                  onChange={(e) => {
                    const num = parseNumberInput(e.target.value, 1);
                    if (num !== undefined) updateTriageField('defaultInterval', num);
                  }}
                  disabled={saving}
                  className={inputClasses}
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium">Timeout (ms)</span>
                <input
                  type="number"
                  min={1}
                  value={draftConfig.triage?.timeout ?? 30000}
                  onChange={(e) => {
                    const num = parseNumberInput(e.target.value, 1);
                    if (num !== undefined) updateTriageField('timeout', num);
                  }}
                  disabled={saving}
                  className={inputClasses}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <label className="space-y-2">
                <span className="text-sm font-medium">Context Messages</span>
                <input
                  type="number"
                  min={1}
                  value={draftConfig.triage?.contextMessages ?? 10}
                  onChange={(e) => {
                    const num = parseNumberInput(e.target.value, 1);
                    if (num !== undefined) updateTriageField('contextMessages', num);
                  }}
                  disabled={saving}
                  className={inputClasses}
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium">Max Buffer Size</span>
                <input
                  type="number"
                  min={1}
                  value={draftConfig.triage?.maxBufferSize ?? 30}
                  onChange={(e) => {
                    const num = parseNumberInput(e.target.value, 1);
                    if (num !== undefined) updateTriageField('maxBufferSize', num);
                  }}
                  disabled={saving}
                  className={inputClasses}
                />
              </label>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Streaming</span>
              <ToggleSwitch
                checked={draftConfig.triage?.streaming ?? false}
                onChange={(v) => updateTriageField('streaming', v)}
                disabled={saving}
                label="Streaming"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Moderation Response</span>
              <ToggleSwitch
                checked={draftConfig.triage?.moderationResponse ?? false}
                onChange={(v) => updateTriageField('moderationResponse', v)}
                disabled={saving}
                label="Moderation Response"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Debug Footer</span>
              <ToggleSwitch
                checked={draftConfig.triage?.debugFooter ?? false}
                onChange={(v) => updateTriageField('debugFooter', v)}
                disabled={saving}
                label="Debug Footer"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Status Reactions</span>
              <ToggleSwitch
                checked={draftConfig.triage?.statusReactions ?? false}
                onChange={(v) => updateTriageField('statusReactions', v)}
                disabled={saving}
                label="Status Reactions"
              />
            </div>
            <label className="space-y-2">
              <span className="text-sm font-medium">Moderation Log Channel</span>
              <input
                type="text"
                value={draftConfig.triage?.moderationLogChannel ?? ''}
                onChange={(e) => updateTriageField('moderationLogChannel', e.target.value)}
                disabled={saving}
                className={inputClasses}
                placeholder="Channel ID for moderation logs"
              />
            </label>
          </CardContent>
        </Card>
      )}

      {/* Starboard section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Starboard</CardTitle>
              <CardDescription>Pin popular messages to a starboard channel.</CardDescription>
            </div>
            <ToggleSwitch
              checked={draftConfig.starboard?.enabled ?? false}
              onChange={(v) => updateStarboardField('enabled', v)}
              disabled={saving}
              label="Starboard"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="space-y-2">
            <span className="text-sm font-medium">Channel ID</span>
            <input
              type="text"
              value={draftConfig.starboard?.channelId ?? ''}
              onChange={(e) => updateStarboardField('channelId', e.target.value)}
              disabled={saving}
              className={inputClasses}
              placeholder="Starboard channel ID"
            />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="space-y-2">
              <span className="text-sm font-medium">Threshold</span>
              <input
                type="number"
                min={1}
                value={draftConfig.starboard?.threshold ?? 3}
                onChange={(e) => {
                  const num = parseNumberInput(e.target.value, 1);
                  if (num !== undefined) updateStarboardField('threshold', num);
                }}
                disabled={saving}
                className={inputClasses}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Emoji</span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={draftConfig.starboard?.emoji ?? '*'}
                  onChange={(e) => updateStarboardField('emoji', e.target.value.trim() || '*')}
                  disabled={saving}
                  className={inputClasses}
                  placeholder="*"
                />
                <button
                  type="button"
                  onClick={() => updateStarboardField('emoji', '*')}
                  disabled={saving}
                  className={`shrink-0 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                    draftConfig.starboard?.emoji === '*'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-accent'
                  }`}
                >
                  Any ✱
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Set a specific emoji (e.g. ⭐ 🔥 👍) or click <strong>Any</strong> to let any emoji
                trigger the starboard.
              </p>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Allow Self-Star</span>
            <ToggleSwitch
              checked={draftConfig.starboard?.selfStarAllowed ?? false}
              onChange={(v) => updateStarboardField('selfStarAllowed', v)}
              disabled={saving}
              label="Self-Star Allowed"
            />
          </div>
          <label className="space-y-2">
            <span className="text-sm font-medium">Ignored Channels</span>
            <input
              type="text"
              value={(draftConfig.starboard?.ignoredChannels ?? []).join(', ')}
              onChange={(e) =>
                updateStarboardField(
                  'ignoredChannels',
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
              disabled={saving}
              className={inputClasses}
              placeholder="Comma-separated channel IDs"
            />
          </label>
        </CardContent>
      </Card>

      {/* Permissions section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Permissions</CardTitle>
              <CardDescription>
                Configure role-based access and bot owner overrides.
              </CardDescription>
            </div>
            <ToggleSwitch
              checked={draftConfig.permissions?.enabled ?? false}
              onChange={(v) => updatePermissionsField('enabled', v)}
              disabled={saving}
              label="Permissions"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="space-y-2">
            <span className="text-sm font-medium">Admin Role ID</span>
            <RoleSelector
              guildId={guildId}
              selected={
                draftConfig.permissions?.adminRoleId ? [draftConfig.permissions.adminRoleId] : []
              }
              onChange={(selected) => updatePermissionsField('adminRoleId', selected[0] ?? null)}
              placeholder="Select admin role"
              disabled={saving}
              maxSelections={1}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Moderator Role ID</span>
            <RoleSelector
              guildId={guildId}
              selected={
                draftConfig.permissions?.moderatorRoleId
                  ? [draftConfig.permissions.moderatorRoleId]
                  : []
              }
              onChange={(selected) =>
                updatePermissionsField('moderatorRoleId', selected[0] ?? null)
              }
              placeholder="Select moderator role"
              disabled={saving}
              maxSelections={1}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Bot Owners</span>
            <input
              type="text"
              value={(draftConfig.permissions?.botOwners ?? []).join(', ')}
              onChange={(e) =>
                updatePermissionsField(
                  'botOwners',
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
              disabled={saving}
              className={inputClasses}
              placeholder="Comma-separated user IDs"
            />
          </label>
        </CardContent>
      </Card>

      {/* Memory section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Memory</CardTitle>
              <CardDescription>Configure AI context memory and auto-extraction.</CardDescription>
            </div>
            <ToggleSwitch
              checked={draftConfig.memory?.enabled ?? false}
              onChange={(v) => updateMemoryField('enabled', v)}
              disabled={saving}
              label="Memory"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="space-y-2">
            <span className="text-sm font-medium">Max Context Memories</span>
            <input
              type="number"
              min={1}
              value={draftConfig.memory?.maxContextMemories ?? 10}
              onChange={(e) => {
                const num = parseNumberInput(e.target.value, 1);
                if (num !== undefined) updateMemoryField('maxContextMemories', num);
              }}
              disabled={saving}
              className={inputClasses}
            />
          </label>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Auto-Extract</span>
            <ToggleSwitch
              checked={draftConfig.memory?.autoExtract ?? false}
              onChange={(v) => updateMemoryField('autoExtract', v)}
              disabled={saving}
              label="Auto-Extract"
            />
          </div>
        </CardContent>
      </Card>

      {/* ═══ Community Feature Toggles ═══ */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Community Features</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground">
            Enable or disable community commands per guild.
          </p>
          {(
            [
              { key: 'help', label: 'Help / FAQ', desc: '/help command for server knowledge base' },
              { key: 'announce', label: 'Announcements', desc: '/announce for scheduled messages' },
              {
                key: 'snippet',
                label: 'Code Snippets',
                desc: '/snippet for saving and sharing code',
              },
              { key: 'poll', label: 'Polls', desc: '/poll for community voting' },
              {
                key: 'showcase',
                label: 'Project Showcase',
                desc: '/showcase to submit, browse, and upvote projects',
              },
              {
                key: 'review',
                label: 'Code Reviews',
                desc: '/review peer code review requests with claim workflow',
              },
              { key: 'tldr', label: 'TL;DR Summaries', desc: '/tldr for AI channel summaries' },
              { key: 'afk', label: 'AFK System', desc: '/afk auto-respond when members are away' },
              {
                key: 'engagement',
                label: 'Engagement Tracking',
                desc: '/profile stats — messages, reactions, days active',
              },
            ] as const
          ).map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium">{label}</span>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <ToggleSwitch
                checked={draftConfig[key]?.enabled ?? false}
                onChange={(v) => {
                  updateDraftConfig((prev) => ({
                    ...prev,
                    [key]: { ...prev[key], enabled: v },
                  }));
                }}
                disabled={saving}
                label={label}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ═══ Engagement / Activity Badges ═══ */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <CardTitle className="text-base">Activity Badges</CardTitle>
          <p className="text-xs text-muted-foreground">
            Configure the badge tiers shown on /profile. Each badge requires a minimum number of
            active days.
          </p>
          {(draftConfig.engagement?.activityBadges ?? DEFAULT_ACTIVITY_BADGES).map(
            (badge: { days?: number; label?: string }, i: number) => (
              <div
                key={`badge-${badge.days ?? 0}-${badge.label ?? i}`}
                className="flex items-center gap-2"
              >
                <Input
                  className="w-20"
                  type="number"
                  min={0}
                  value={badge.days ?? 0}
                  onChange={(e) => {
                    const badges = [
                      ...(draftConfig.engagement?.activityBadges ?? DEFAULT_ACTIVITY_BADGES),
                    ];
                    badges[i] = {
                      ...badges[i],
                      days: Math.max(0, parseInt(e.target.value, 10) || 0),
                    };
                    updateDraftConfig((prev) => ({
                      ...prev,
                      engagement: { ...prev.engagement, activityBadges: badges },
                    }));
                  }}
                  disabled={saving}
                />
                <span className="text-xs text-muted-foreground">days →</span>
                <Input
                  className="flex-1"
                  value={badge.label ?? ''}
                  onChange={(e) => {
                    const badges = [
                      ...(draftConfig.engagement?.activityBadges ?? DEFAULT_ACTIVITY_BADGES),
                    ];
                    badges[i] = { ...badges[i], label: e.target.value };
                    updateDraftConfig((prev) => ({
                      ...prev,
                      engagement: { ...prev.engagement, activityBadges: badges },
                    }));
                  }}
                  disabled={saving}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const badges = [...(draftConfig.engagement?.activityBadges ?? [])].filter(
                      (_, idx) => idx !== i,
                    );
                    updateDraftConfig((prev) => ({
                      ...prev,
                      engagement: { ...prev.engagement, activityBadges: badges },
                    }));
                  }}
                  disabled={
                    saving ||
                    (draftConfig.engagement?.activityBadges ?? DEFAULT_ACTIVITY_BADGES).length <= 1
                  }
                >
                  ✕
                </Button>
              </div>
            ),
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const badges = [
                ...(draftConfig.engagement?.activityBadges ?? DEFAULT_ACTIVITY_BADGES),
                { days: 0, label: '🌟 New Badge' },
              ];
              updateDraftConfig((prev) => ({
                ...prev,
                engagement: { ...prev.engagement, activityBadges: badges },
              }));
            }}
            disabled={saving}
          >
            + Add Badge
          </Button>
        </CardContent>
      </Card>

      {/* ═══ Reputation / XP Settings ═══ */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Reputation / XP</CardTitle>
            <ToggleSwitch
              checked={draftConfig.reputation?.enabled ?? false}
              onChange={(v) =>
                updateDraftConfig((prev) => ({
                  ...prev,
                  reputation: { ...prev.reputation, enabled: v },
                }))
              }
              disabled={saving}
              label="Reputation"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="space-y-2">
              <span className="text-sm font-medium">XP per Message (min)</span>
              <input
                type="number"
                min={1}
                max={100}
                value={draftConfig.reputation?.xpPerMessage?.[0] ?? 5}
                onChange={(e) => {
                  const num = parseNumberInput(e.target.value, 1, 100);
                  if (num !== undefined) {
                    const range = draftConfig.reputation?.xpPerMessage ?? [5, 15];
                    const newMax = num > range[1] ? num : range[1];
                    updateDraftConfig((prev) => ({
                      ...prev,
                      reputation: { ...prev.reputation, xpPerMessage: [num, newMax] },
                    }));
                  }
                }}
                disabled={saving}
                className={inputClasses}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">XP per Message (max)</span>
              <input
                type="number"
                min={1}
                max={100}
                value={draftConfig.reputation?.xpPerMessage?.[1] ?? 15}
                onChange={(e) => {
                  const num = parseNumberInput(e.target.value, 1, 100);
                  if (num !== undefined) {
                    const range = draftConfig.reputation?.xpPerMessage ?? [5, 15];
                    const newMin = num < range[0] ? num : range[0];
                    updateDraftConfig((prev) => ({
                      ...prev,
                      reputation: { ...prev.reputation, xpPerMessage: [newMin, num] },
                    }));
                  }
                }}
                disabled={saving}
                className={inputClasses}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">XP Cooldown (seconds)</span>
              <input
                type="number"
                min={0}
                value={draftConfig.reputation?.xpCooldownSeconds ?? 60}
                onChange={(e) => {
                  const num = parseNumberInput(e.target.value, 0);
                  if (num !== undefined)
                    updateDraftConfig((prev) => ({
                      ...prev,
                      reputation: { ...prev.reputation, xpCooldownSeconds: num },
                    }));
                }}
                disabled={saving}
                className={inputClasses}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Announce Channel ID</span>
              <input
                type="text"
                value={draftConfig.reputation?.announceChannelId ?? ''}
                onChange={(e) =>
                  updateDraftConfig((prev) => ({
                    ...prev,
                    reputation: {
                      ...prev.reputation,
                      announceChannelId: e.target.value.trim() || null,
                    },
                  }))
                }
                disabled={saving}
                className={inputClasses}
                placeholder="Channel ID for level-up announcements"
              />
            </label>
          </div>
          <label className="space-y-2">
            <span className="text-sm font-medium">
              Level Thresholds (comma-separated XP values)
            </span>
            <input
              type="text"
              value={(
                draftConfig.reputation?.levelThresholds ?? [
                  100, 300, 600, 1000, 1500, 2500, 4000, 6000, 8500, 12000,
                ]
              ).join(', ')}
              onChange={(e) => {
                const nums = e.target.value
                  .split(',')
                  .map((s) => Number(s.trim()))
                  .filter((n) => Number.isFinite(n) && n > 0);
                if (nums.length > 0) {
                  const sorted = [...nums].sort((a, b) => a - b);
                  updateDraftConfig((prev) => ({
                    ...prev,
                    reputation: { ...prev.reputation, levelThresholds: sorted },
                  }));
                }
              }}
              disabled={saving}
              className={inputClasses}
              placeholder="100, 300, 600, 1000, ..."
            />
            <p className="text-xs text-muted-foreground">
              XP required for each level (L1, L2, L3, ...). Add more values for more levels.
            </p>
          </label>
        </CardContent>
      </Card>

      {/* ═══ Daily Coding Challenges ═══ */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Daily Coding Challenges</CardTitle>
            <ToggleSwitch
              checked={draftConfig.challenges?.enabled ?? false}
              onChange={(v) =>
                updateDraftConfig(
                  (prev) =>
                    ({ ...prev, challenges: { ...prev.challenges, enabled: v } }) as GuildConfig,
                )
              }
              disabled={saving}
              label="Challenges"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Auto-post a daily coding challenge with hint and solve tracking.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <label className="space-y-2">
              <span className="text-sm font-medium">Challenge Channel ID</span>
              <input
                type="text"
                value={draftConfig.challenges?.channelId ?? ''}
                onChange={(e) =>
                  updateDraftConfig(
                    (prev) =>
                      ({
                        ...prev,
                        challenges: {
                          ...prev.challenges,
                          channelId: e.target.value.trim() || null,
                        },
                      }) as GuildConfig,
                  )
                }
                disabled={saving}
                className={inputClasses}
                placeholder="Channel ID for daily challenges"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Post Time (HH:MM)</span>
              <input
                type="text"
                value={draftConfig.challenges?.postTime ?? '09:00'}
                onChange={(e) =>
                  updateDraftConfig(
                    (prev) =>
                      ({
                        ...prev,
                        challenges: { ...prev.challenges, postTime: e.target.value },
                      }) as GuildConfig,
                  )
                }
                disabled={saving}
                className={inputClasses}
                placeholder="09:00"
              />
            </label>
            <label className="space-y-2 col-span-2">
              <span className="text-sm font-medium">Timezone</span>
              <input
                type="text"
                value={draftConfig.challenges?.timezone ?? 'America/New_York'}
                onChange={(e) =>
                  updateDraftConfig(
                    (prev) =>
                      ({
                        ...prev,
                        challenges: { ...prev.challenges, timezone: e.target.value },
                      }) as GuildConfig,
                  )
                }
                disabled={saving}
                className={inputClasses}
                placeholder="America/New_York"
              />
              <p className="text-xs text-muted-foreground">
                IANA timezone (e.g. America/Chicago, Europe/London)
              </p>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* ═══ GitHub Feed Settings ═══ */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">GitHub Activity Feed</CardTitle>
            <ToggleSwitch
              checked={draftConfig.github?.feed?.enabled ?? false}
              onChange={(v) =>
                updateDraftConfig((prev) => ({
                  ...prev,
                  github: { ...prev.github, feed: { ...prev.github?.feed, enabled: v } },
                }))
              }
              disabled={saving}
              label="GitHub Feed"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="space-y-2">
              <span className="text-sm font-medium">Feed Channel ID</span>
              <input
                type="text"
                value={draftConfig.github?.feed?.channelId ?? ''}
                onChange={(e) =>
                  updateDraftConfig((prev) => ({
                    ...prev,
                    github: {
                      ...prev.github,
                      feed: { ...prev.github?.feed, channelId: e.target.value.trim() || null },
                    },
                  }))
                }
                disabled={saving}
                className={inputClasses}
                placeholder="Channel ID for GitHub updates"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Poll Interval (minutes)</span>
              <input
                type="number"
                min={1}
                value={draftConfig.github?.feed?.pollIntervalMinutes ?? 5}
                onChange={(e) => {
                  const num = parseNumberInput(e.target.value, 1);
                  if (num !== undefined)
                    updateDraftConfig((prev) => ({
                      ...prev,
                      github: {
                        ...prev.github,
                        feed: { ...prev.github?.feed, pollIntervalMinutes: num },
                      },
                    }));
                }}
                disabled={saving}
                className={inputClasses}
              />
            </label>
          </div>
        </CardContent>
      </Card>

      {/* ═══ Tickets ═══ */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Tickets</CardTitle>
            <ToggleSwitch
              checked={draftConfig.tickets?.enabled ?? false}
              onChange={(v) =>
                updateDraftConfig((prev) => ({
                  ...prev,
                  tickets: { ...prev.tickets, enabled: v },
                }))
              }
              disabled={saving}
              label="Tickets"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="space-y-2">
            <span className="text-sm font-medium">Ticket Mode</span>
            <select
              value={draftConfig.tickets?.mode ?? 'thread'}
              onChange={(e) =>
                updateDraftConfig((prev) => ({
                  ...prev,
                  tickets: { ...prev.tickets, mode: e.target.value as 'thread' | 'channel' },
                }))
              }
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
          <div className="grid grid-cols-2 gap-4">
            <label className="space-y-2">
              <span className="text-sm font-medium">Support Role ID</span>
              <input
                type="text"
                value={draftConfig.tickets?.supportRole ?? ''}
                onChange={(e) =>
                  updateDraftConfig((prev) => ({
                    ...prev,
                    tickets: { ...prev.tickets, supportRole: e.target.value.trim() || null },
                  }))
                }
                disabled={saving}
                className={inputClasses}
                placeholder="Role ID for support staff"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Category Channel ID</span>
              <input
                type="text"
                value={draftConfig.tickets?.category ?? ''}
                onChange={(e) =>
                  updateDraftConfig((prev) => ({
                    ...prev,
                    tickets: { ...prev.tickets, category: e.target.value.trim() || null },
                  }))
                }
                disabled={saving}
                className={inputClasses}
                placeholder="Category for tickets"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Auto-Close Hours</span>
              <input
                type="number"
                min="1"
                max="720"
                value={draftConfig.tickets?.autoCloseHours ?? 48}
                onChange={(e) => {
                  const num = parseNumberInput(e.target.value, 1, 720);
                  if (num !== undefined)
                    updateDraftConfig((prev) => ({
                      ...prev,
                      tickets: { ...prev.tickets, autoCloseHours: num },
                    }));
                }}
                disabled={saving}
                className={inputClasses}
              />
              <p className="text-xs text-muted-foreground">
                Hours of inactivity before warning (then +24h to close)
              </p>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Max Open Per User</span>
              <input
                type="number"
                min="1"
                max="20"
                value={draftConfig.tickets?.maxOpenPerUser ?? 3}
                onChange={(e) => {
                  const num = parseNumberInput(e.target.value, 1, 20);
                  if (num !== undefined)
                    updateDraftConfig((prev) => ({
                      ...prev,
                      tickets: { ...prev.tickets, maxOpenPerUser: num },
                    }));
                }}
                disabled={saving}
                className={inputClasses}
              />
            </label>
            <label className="space-y-2 col-span-2">
              <span className="text-sm font-medium">Transcript Channel ID</span>
              <input
                type="text"
                value={draftConfig.tickets?.transcriptChannel ?? ''}
                onChange={(e) =>
                  updateDraftConfig((prev) => ({
                    ...prev,
                    tickets: { ...prev.tickets, transcriptChannel: e.target.value.trim() || null },
                  }))
                }
                disabled={saving}
                className={inputClasses}
                placeholder="Channel to post ticket transcripts"
              />
            </label>
          </div>
        </CardContent>
      </Card>
      {/* Diff view */}
      {hasChanges && savedConfig && <ConfigDiff original={savedConfig} modified={draftConfig} />}
    </div>
  );
}

// ── Toggle Switch ───────────────────────────────────────────────

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
}

/**
 * Renders an accessible toggle switch control.
 *
 * The switch reflects the `checked` state, calls `onChange` with the new boolean value when toggled,
 * and exposes an ARIA label derived from `label`.
 *
 * @param checked - Current on/off state of the switch.
 * @param onChange - Callback invoked with the new checked state when the switch is toggled.
 * @param disabled - When true, disables user interaction and applies disabled styling.
 * @param label - Human-readable name used for the switch's ARIA label.
 * @returns The button element acting as the toggle switch.
 */
function ToggleSwitch({ checked, onChange, disabled, label }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`Toggle ${label}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 aria-checked:bg-primary aria-[checked=false]:bg-muted"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0.5"
        data-state={checked ? 'checked' : 'unchecked'}
      />
    </button>
  );
}

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Determine whether two JSON-serializable values are deeply equal by recursively comparing primitives, arrays, and plain objects.
 *
 * @param a - First value to compare
 * @param b - Second value to compare
 * @returns `true` if `a` and `b` are structurally equal, `false` otherwise
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  if (typeof a === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => Object.hasOwn(bObj, key) && deepEqual(aObj[key], bObj[key]));
  }

  return false;
}

/**
 * Compute a flat list of dot-path patches that describe differences between two guild configs.
 *
 * Skips the root-level `guildId`, recurses into plain objects to emit leaf-level changes,
 * and produces a patch for any differing non-object value or array.
 *
 * @param original - The original (server-authoritative) guild configuration to compare against
 * @param modified - The modified guild configuration containing desired updates
 * @returns An array of patches where each item has a dot-separated `path` to the changed field and `value` set to the new value
 */
function computePatches(
  original: GuildConfig,
  modified: GuildConfig,
): Array<{ path: string; value: unknown }> {
  const patches: Array<{ path: string; value: unknown }> = [];

  /**
   * Traverse two plain-object trees and record leaf-level differences as path/value patches.
   *
   * Walks the structures rooted at `origObj` and `modObj`, compares values recursively, and appends
   * a patch { path, value } to the outer-scope `patches` array for each leaf or differing non-object
   * value in `modObj`. The root-level field named "guildId" is ignored.
   *
   * @param origObj - The original (source) object to compare against
   * @param modObj - The modified (target) object to derive patches from
   * @param prefix - Current dot-separated path prefix for nested keys (use empty string for root)
   */
  function walk(origObj: Record<string, unknown>, modObj: Record<string, unknown>, prefix: string) {
    const allKeys = new Set([...Object.keys(origObj), ...Object.keys(modObj)]);

    for (const key of allKeys) {
      // Skip the guildId metadata field
      if (prefix === '' && key === 'guildId') continue;

      const fullPath = prefix ? `${prefix}.${key}` : key;
      const origVal = origObj[key];
      const modVal = modObj[key];

      if (deepEqual(origVal, modVal)) continue;

      // If both are plain objects, recurse to find the leaf changes
      if (
        typeof origVal === 'object' &&
        origVal !== null &&
        !Array.isArray(origVal) &&
        typeof modVal === 'object' &&
        modVal !== null &&
        !Array.isArray(modVal)
      ) {
        walk(origVal as Record<string, unknown>, modVal as Record<string, unknown>, fullPath);
      } else {
        const patchValue = !Object.hasOwn(modObj, key) || modVal === undefined ? null : modVal;
        patches.push({ path: fullPath, value: patchValue });
      }
    }
  }

  walk(
    original as unknown as Record<string, unknown>,
    modified as unknown as Record<string, unknown>,
    '',
  );

  return patches;
}
