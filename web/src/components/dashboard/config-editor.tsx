'use client';

import { Loader2, RotateCcw, Save } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  type GuildConfigSectionKey,
  updateNestedField,
  updateSectionEnabled,
  updateSectionField,
} from '@/lib/config-updates';
import { computePatches, deepEqual, type GuildConfig } from '@/lib/config-utils';
import { GUILD_SELECTED_EVENT, SELECTED_GUILD_KEY } from '@/lib/guild-selection';
import { SYSTEM_PROMPT_MAX_LENGTH } from '@/types/config';
import { ConfigDiff } from './config-diff';
import { ConfigDiffModal } from './config-diff-modal';
import {
  AiAutoModSection,
  AiSection,
  ChallengesSection,
  CommunityFeaturesSection,
  EngagementSection,
  GitHubSection,
  MemorySection,
  ModerationSection,
  PermissionsSection,
  ReputationSection,
  StarboardSection,
  TicketsSection,
  TriageSection,
  WelcomeSection,
} from './config-sections';
import { DiscardChangesButton } from './reset-defaults-button';

/**
 * Generate a UUID string.
 *
 * Produces a v4-style UUID; in environments with native support this will use the platform API.
 *
 * @returns A v4 UUID string.
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Determines whether a value matches the expected GuildConfig shape returned by the API.
 *
 * Checks that `data` is a plain object that contains at least one known top-level config section
 * and that any present known sections are objects (not `null`, not primitives, and not arrays).
 *
 * @returns `true` if `data` appears to be a GuildConfig, `false` otherwise.
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
    'aiAutoMod',
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
 * discard, and validate edits.
 */
export function ConfigEditor() {
  const [guildId, setGuildId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [prevSavedConfig, setPrevSavedConfig] = useState<{
    guildId: string;
    config: GuildConfig;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** The config as last fetched from the API (the "saved" state). */
  const [savedConfig, setSavedConfig] = useState<GuildConfig | null>(null);
  /** Working copy that the user edits. */
  const [draftConfig, setDraftConfig] = useState<GuildConfig | null>(null);

  /** Raw textarea strings — kept separate so partial input isn't stripped on every keystroke. */
  const [dmStepsRaw, setDmStepsRaw] = useState('');
  const [protectRoleIdsRaw, setProtectRoleIdsRaw] = useState('');

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
      setProtectRoleIdsRaw((data.moderation?.protectRoles?.roleIds ?? []).join(', '));
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

  /** Top-level config sections that have pending changes. */
  const changedSections = useMemo(() => {
    if (!savedConfig || !draftConfig) return [];
    const patches = computePatches(savedConfig, draftConfig);
    return [...new Set(patches.map((p) => p.path.split('.')[0]))];
  }, [savedConfig, draftConfig]);

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

  // ── Open diff modal before saving ─────────────────────────────
  const openDiffModal = useCallback(() => {
    if (!guildId || !savedConfig || !draftConfig) return;
    if (hasValidationErrors) {
      toast.error('Cannot save', {
        description: 'Fix validation errors before saving.',
      });
      return;
    }
    if (!hasChanges) {
      toast.info('No changes to save.');
      return;
    }
    setShowDiffModal(true);
  }, [guildId, savedConfig, draftConfig, hasValidationErrors, hasChanges]);

  // ── Revert a single top-level section to saved state ──────────
  const revertSection = useCallback(
    (section: string) => {
      if (!savedConfig) return;
      setDraftConfig((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          [section]: (savedConfig as Record<string, unknown>)[section],
        } as GuildConfig;
      });
      // Keep raw string mirrors consistent
      if (section === 'welcome') {
        setDmStepsRaw((savedConfig.welcome?.dmSequence?.steps ?? []).join('\n'));
      }
      if (section === 'moderation') {
        setProtectRoleIdsRaw((savedConfig.moderation?.protectRoles?.roleIds ?? []).join(', '));
      }
      toast.success(`Reverted ${section} changes.`);
    },
    [savedConfig],
  );

  // ── Execute the save (called from diff modal confirm) ──────────
  const executeSave = useCallback(async () => {
    if (!guildId || !savedConfig || !draftConfig) return;

    if (hasValidationErrors) {
      toast.error('Cannot save', {
        description: 'Fix validation errors before saving.',
      });
      return;
    }

    const patches = computePatches(savedConfig, draftConfig);
    if (patches.length === 0) {
      setShowDiffModal(false);
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

    const saveAbortController = new AbortController();
    const { signal } = saveAbortController;

    const failedSections: string[] = [];

    /**
     * Applies a sequence of JSON Patch-like updates to the current guild's configuration via PATCH requests.
     *
     * @param sectionPatches - An ordered array of patch objects, each with a `path` (JSON pointer-like string) and `value` to send as the request body for a single PATCH operation.
     *
     * @throws Error - If the server responds with 401 (causes an abort and redirects to /login) or if any PATCH request returns a non-OK response; the error message contains the server-provided `error` field when available or the HTTP status.
     */
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
        setShowDiffModal(false);
        setPrevSavedConfig({ guildId, config: structuredClone(savedConfig) as GuildConfig });
        await fetchConfig(guildId);
      }
    } catch (err) {
      const msg = (err as Error).message || 'Failed to save config';
      toast.error('Failed to save config', { description: msg });
    } finally {
      setSaving(false);
    }
  }, [guildId, savedConfig, draftConfig, hasValidationErrors, fetchConfig]);

  // Clear undo snapshot when guild changes.
  // guildId is intentionally included so the effect re-runs on guild switch even though
  // setPrevSavedConfig is a stable ref and biome would normally flag guildId as "extra".
  // biome-ignore lint/correctness/useExhaustiveDependencies: guildId triggers the reset
  useEffect(() => {
    setPrevSavedConfig(null);
  }, [guildId]);

  // ── Undo last save ─────────────────────────────────────────────
  const undoLastSave = useCallback(() => {
    if (!prevSavedConfig) return;
    if (prevSavedConfig.guildId !== guildId) {
      setPrevSavedConfig(null);
      return;
    }
    setDraftConfig(structuredClone(prevSavedConfig.config));
    setDmStepsRaw((prevSavedConfig.config.welcome?.dmSequence?.steps ?? []).join('\n'));
    setProtectRoleIdsRaw(
      (prevSavedConfig.config.moderation?.protectRoles?.roleIds ?? []).join(', '),
    );
    setPrevSavedConfig(null);
    toast.info('Reverted to previous saved state. Save again to apply.');
  }, [prevSavedConfig, guildId]);

  // ── Keyboard shortcut: Ctrl/Cmd+S → open diff preview ─────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (hasChanges && !saving && !hasValidationErrors) {
          openDiffModal();
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasChanges, saving, hasValidationErrors, openDiffModal]);

  // ── Discard edits ──────────────────────────────────────────────
  const discardChanges = useCallback(() => {
    if (!savedConfig) return;
    setDraftConfig(structuredClone(savedConfig));
    setDmStepsRaw((savedConfig.welcome?.dmSequence?.steps ?? []).join('\n'));
    setProtectRoleIdsRaw((savedConfig.moderation?.protectRoles?.roleIds ?? []).join(', '));
    toast.success('Changes discarded.');
  }, [savedConfig]);

  // ── Section update handlers ────────────────────────────────────
  const createSectionUpdater = useCallback(
    <K extends GuildConfigSectionKey>(section: K) => ({
      setEnabled: (enabled: boolean) => {
        updateDraftConfig((prev) => updateSectionEnabled(prev, section, enabled));
      },
      setField: (field: string, value: unknown) => {
        updateDraftConfig((prev) => updateSectionField(prev, section, field, value));
      },
      setNestedField: (nestedKey: string, field: string, value: unknown) => {
        updateDraftConfig((prev) => updateNestedField(prev, section, nestedKey, field, value));
      },
    }),
    [updateDraftConfig],
  );

  const aiUpdater = createSectionUpdater('ai');
  const welcomeUpdater = createSectionUpdater('welcome');
  const moderationUpdater = createSectionUpdater('moderation');
  const triageUpdater = createSectionUpdater('triage');
  const starboardUpdater = createSectionUpdater('starboard');
  const permissionsUpdater = createSectionUpdater('permissions');
  const memoryUpdater = createSectionUpdater('memory');
  const reputationUpdater = createSectionUpdater('reputation');
  const challengesUpdater = createSectionUpdater('challenges');

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
          {prevSavedConfig && !hasChanges && (
            <Button
              variant="outline"
              size="sm"
              onClick={undoLastSave}
              disabled={saving}
              aria-label="Undo last save"
            >
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
              Undo Last Save
            </Button>
          )}
          <DiscardChangesButton
            onReset={discardChanges}
            disabled={saving || !hasChanges}
            sectionLabel="all unsaved changes"
          />
          <div className="relative">
            <Button
              onClick={openDiffModal}
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
            {hasChanges && !saving && (
              <span
                className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-yellow-400 ring-2 ring-background"
                aria-hidden="true"
                title="Unsaved changes"
              />
            )}
          </div>
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

      {/* AI Section */}
      <AiSection
        draftConfig={draftConfig}
        guildId={guildId}
        saving={saving}
        onEnabledChange={aiUpdater.setEnabled}
        onSystemPromptChange={(value) => aiUpdater.setField('systemPrompt', value)}
        onBlockedChannelsChange={(channels) => aiUpdater.setField('blockedChannelIds', channels)}
      />

      {/* Welcome Section */}
      <WelcomeSection
        draftConfig={draftConfig}
        guildId={guildId}
        saving={saving}
        dmStepsRaw={dmStepsRaw}
        onEnabledChange={welcomeUpdater.setEnabled}
        onMessageChange={(value) => welcomeUpdater.setField('message', value)}
        onFieldChange={welcomeUpdater.setField}
        onRoleMenuChange={(field, value) => welcomeUpdater.setNestedField('roleMenu', field, value)}
        onDmSequenceChange={(field, value) =>
          welcomeUpdater.setNestedField('dmSequence', field, value)
        }
        onDmStepsRawChange={setDmStepsRaw}
      />

      {/* Moderation Section */}
      <ModerationSection
        draftConfig={draftConfig}
        guildId={guildId}
        saving={saving}
        protectRoleIdsRaw={protectRoleIdsRaw}
        onEnabledChange={moderationUpdater.setEnabled}
        onFieldChange={moderationUpdater.setField}
        onDmNotificationChange={(action, value) =>
          moderationUpdater.setNestedField('dmNotifications', action, value)
        }
        onEscalationChange={(enabled) =>
          moderationUpdater.setNestedField('escalation', 'enabled', enabled)
        }
        onRateLimitChange={(field, value) =>
          moderationUpdater.setNestedField('rateLimit', field, value)
        }
        onLinkFilterChange={(field, value) =>
          moderationUpdater.setNestedField('linkFilter', field, value)
        }
        onProtectRolesChange={(field, value) =>
          moderationUpdater.setNestedField('protectRoles', field, value)
        }
        onProtectRoleIdsRawChange={setProtectRoleIdsRaw}
      />

      {/* AI Auto-Moderation Section */}
      <AiAutoModSection
        draftConfig={draftConfig}
        saving={saving}
        onFieldChange={(field, value) => {
          updateDraftConfig((prev) => ({
            ...prev,
            aiAutoMod: { ...((prev.aiAutoMod as Record<string, unknown>) || {}), [field]: value },
          }));
        }}
      />

      {/* Triage Section */}
      <TriageSection
        draftConfig={draftConfig}
        guildId={guildId}
        saving={saving}
        onEnabledChange={triageUpdater.setEnabled}
        onFieldChange={triageUpdater.setField}
      />

      {/* Starboard Section */}
      <StarboardSection
        draftConfig={draftConfig}
        saving={saving}
        onFieldChange={starboardUpdater.setField}
      />

      {/* Permissions Section */}
      <PermissionsSection
        draftConfig={draftConfig}
        guildId={guildId}
        saving={saving}
        onFieldChange={permissionsUpdater.setField}
      />

      {/* Memory Section */}
      <MemorySection
        draftConfig={draftConfig}
        saving={saving}
        onEnabledChange={memoryUpdater.setEnabled}
        onFieldChange={memoryUpdater.setField}
      />

      {/* Community Features Section */}
      <CommunityFeaturesSection
        draftConfig={draftConfig}
        saving={saving}
        onToggleChange={(key, enabled) => {
          updateDraftConfig((prev) => ({
            ...prev,
            [key]: {
              ...((prev[key as keyof GuildConfig] as Record<string, unknown>) || {}),
              enabled,
            },
          }));
        }}
      />

      {/* Engagement / Activity Badges Section */}
      <EngagementSection
        draftConfig={draftConfig}
        saving={saving}
        onActivityBadgesChange={(badges) => {
          updateDraftConfig((prev) => ({
            ...prev,
            engagement: { ...(prev.engagement || {}), activityBadges: badges },
          }));
        }}
      />

      {/* Reputation / XP Section */}
      <ReputationSection
        draftConfig={draftConfig}
        saving={saving}
        onEnabledChange={reputationUpdater.setEnabled}
        onFieldChange={reputationUpdater.setField}
      />

      {/* Daily Coding Challenges Section */}
      <ChallengesSection
        draftConfig={draftConfig}
        saving={saving}
        onEnabledChange={challengesUpdater.setEnabled}
        onFieldChange={challengesUpdater.setField}
      />

      {/* GitHub Feed Section */}
      <GitHubSection
        draftConfig={draftConfig}
        saving={saving}
        onFieldChange={(field, value) => {
          updateDraftConfig((prev) => ({
            ...prev,
            github: {
              ...(prev.github || {}),
              feed: { ...(prev.github?.feed || {}), [field]: value },
            },
          }));
        }}
      />

      {/* Tickets Section */}
      <TicketsSection
        draftConfig={draftConfig}
        saving={saving}
        onEnabledChange={(enabled) => {
          updateDraftConfig((prev) => ({
            ...prev,
            tickets: { ...(prev.tickets || {}), enabled },
          }));
        }}
        onFieldChange={(field, value) => {
          updateDraftConfig((prev) => ({
            ...prev,
            tickets: { ...(prev.tickets || {}), [field]: value },
          }));
        }}
      />

      {/* Inline diff view */}
      {hasChanges && savedConfig && <ConfigDiff original={savedConfig} modified={draftConfig} />}

      {/* Diff modal */}
      {savedConfig && (
        <ConfigDiffModal
          open={showDiffModal}
          onOpenChange={setShowDiffModal}
          original={savedConfig}
          modified={draftConfig}
          changedSections={changedSections}
          onConfirm={executeSave}
          onRevertSection={revertSection}
          saving={saving}
        />
      )}
    </div>
  );
}
