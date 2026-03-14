'use client';

import { Loader2, RotateCcw, Save } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CategoryNavigation } from '@/components/dashboard/config-workspace/category-navigation';
import {
  CONFIG_CATEGORIES,
  DEFAULT_CONFIG_CATEGORY,
  getMatchedFeatureIds,
  getMatchingSearchItems,
} from '@/components/dashboard/config-workspace/config-categories';
import { ConfigSearch } from '@/components/dashboard/config-workspace/config-search';
import { SettingsFeatureCard } from '@/components/dashboard/config-workspace/settings-feature-card';
import type {
  ConfigCategoryId,
  ConfigFeatureId,
  ConfigSearchItem,
} from '@/components/dashboard/config-workspace/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChannelSelector } from '@/components/ui/channel-selector';
import { RoleSelector } from '@/components/ui/role-selector';
import { computePatches, deepEqual } from '@/lib/config-utils';
import { GUILD_SELECTED_EVENT, SELECTED_GUILD_KEY } from '@/lib/guild-selection';
import type { BotConfig, ChannelMode, DeepPartial } from '@/types/config';
import { SYSTEM_PROMPT_MAX_LENGTH } from '@/types/config';
import { ConfigDiff } from './config-diff';
import { ConfigDiffModal } from './config-diff-modal';
import { AuditLogSection } from './config-sections/AuditLogSection';
import { ChannelModeSection } from './config-sections/ChannelModeSection';
import { CommunitySettingsSection } from './config-sections/CommunitySettingsSection';
import { DiscardChangesButton } from './reset-defaults-button';
import { SystemPromptEditor } from './system-prompt-editor';
import { ToggleSwitch } from './toggle-switch';

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
    'auditLog',
    'botStatus',
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
 * Edit a guild's bot configuration via a categorized editor with per-section controls.
 *
 * Loads the authoritative config for the selected guild, keeps an editable draft, validates edits,
 * and persists changes as batched, top-level section PATCHes. Provides discard and undo flows,
 * an unsaved-changes warning, keyboard shortcuts (Ctrl/Cmd+S to open the diff preview, '/' to focus
 * search), and a diff modal to review or revert per-section changes before saving.
 *
 * @returns The editor UI as JSX when a guild is selected and a draft config exists; `null` otherwise.
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
  const [activeCategoryId, setActiveCategoryId] =
    useState<ConfigCategoryId>(DEFAULT_CONFIG_CATEGORY);
  const [searchQuery, setSearchQuery] = useState('');
  const [focusFeatureId, setFocusFeatureId] = useState<ConfigFeatureId | null>(null);
  const [selectedSearchItemId, setSelectedSearchItemId] = useState<string | null>(null);

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
    setPrevSavedConfig(null);
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

  /** Top-level config sections that have pending changes. */
  const changedSections = useMemo(() => {
    if (!savedConfig || !draftConfig) return [];
    const patches = computePatches(savedConfig, draftConfig);
    return [...new Set(patches.map((p) => p.path.split('.')[0]))];
  }, [savedConfig, draftConfig]);

  const searchResults = useMemo(() => getMatchingSearchItems(searchQuery), [searchQuery]);

  const matchedFeatureIds = useMemo(() => getMatchedFeatureIds(searchQuery), [searchQuery]);

  const activeCategory = useMemo(
    () =>
      CONFIG_CATEGORIES.find((category) => category.id === activeCategoryId) ??
      CONFIG_CATEGORIES[0],
    [activeCategoryId],
  );

  const visibleFeatureIds = useMemo(() => {
    if (!searchQuery.trim()) return new Set(activeCategory.featureIds);
    return new Set(
      activeCategory.featureIds.filter((featureId) => matchedFeatureIds.has(featureId)),
    );
  }, [activeCategory, searchQuery, matchedFeatureIds]);

  const selectedSearchItem = useMemo(
    () => searchResults.find((item) => item.id === selectedSearchItemId) ?? null,
    [searchResults, selectedSearchItemId],
  );

  const forceOpenAdvancedFeatureId = useMemo(() => {
    if (!searchQuery.trim()) return null;

    if (selectedSearchItem?.isAdvanced && selectedSearchItem.categoryId === activeCategoryId) {
      return selectedSearchItem.featureId;
    }

    const activeAdvancedMatch = searchResults.find(
      (item) => item.categoryId === activeCategoryId && item.isAdvanced,
    );

    return activeAdvancedMatch?.featureId ?? null;
  }, [searchQuery, selectedSearchItem, searchResults, activeCategoryId]);

  const dirtyCategoryCounts = useMemo(() => {
    return CONFIG_CATEGORIES.reduce(
      (acc, category) => {
        const changedCount = changedSections.filter((section) =>
          category.sectionKeys.includes(section as never),
        ).length;
        acc[category.id] = changedCount;
        return acc;
      },
      {
        'ai-automation': 0,
        'onboarding-growth': 0,
        'moderation-safety': 0,
        'community-tools': 0,
        'support-integrations': 0,
      } as Record<ConfigCategoryId, number>,
    );
  }, [changedSections]);

  const changedCategoryCount = useMemo(
    () => Object.values(dirtyCategoryCounts).filter((count) => count > 0).length,
    [dirtyCategoryCounts],
  );

  const handleSearchSelect = useCallback((item: ConfigSearchItem) => {
    setActiveCategoryId(item.categoryId);
    setFocusFeatureId(item.featureId);
    setSelectedSearchItemId(item.id);
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    setSelectedSearchItemId(null);
  }, []);

  useEffect(() => {
    if (!focusFeatureId) return;
    const frameId = window.requestAnimationFrame(() => {
      const target = document.getElementById(`feature-${focusFeatureId}`);
      if (!target) return;
      target.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      const focusable = target.querySelector<HTMLElement>(
        'input, textarea, select, button, [role="switch"]',
      );
      focusable?.focus();
      setFocusFeatureId(null);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [focusFeatureId]);

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
        setShowDiffModal(false);
        // Store previous config for undo (1 level deep; scoped to current guild)
        setPrevSavedConfig({ guildId, config: structuredClone(savedConfig) as GuildConfig });
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

  // ── Undo last save ─────────────────────────────────────────────
  const undoLastSave = useCallback(() => {
    if (!prevSavedConfig) return;
    // Guard: discard snapshot if guild changed since save
    if (prevSavedConfig.guildId !== guildId) {
      setPrevSavedConfig(null);
      return;
    }
    setDraftConfig(structuredClone(prevSavedConfig.config));
    setDmStepsRaw((prevSavedConfig.config.welcome?.dmSequence?.steps ?? []).join('\n'));
    setPrevSavedConfig(null);
    toast.info('Reverted to previous saved state. Save again to apply.');
  }, [prevSavedConfig, guildId]);

  // ── Auto-dismiss "Undo last save" button after 30 s ───────────
  useEffect(() => {
    if (!prevSavedConfig) return;
    const timer = window.setTimeout(() => {
      setPrevSavedConfig(null);
    }, 30_000);
    return () => window.clearTimeout(timer);
  }, [prevSavedConfig]);

  // ── Keyboard shortcut: Ctrl/Cmd+S → open diff preview ─────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 's') return;

      // Don't intercept the browser's native save when the user is typing in a
      // form field — e.g. if they genuinely want to save a <textarea> selection
      // via the OS, or simply don't expect a config-save to fire mid-edit.
      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;

      if (isTyping) return;

      e.preventDefault();
      if (hasChanges && !saving && !hasValidationErrors) {
        openDiffModal();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasChanges, saving, hasValidationErrors, openDiffModal]);

  useEffect(() => {
    function onSearchKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isInputTarget =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;

      if (!isInputTarget && event.key === '/') {
        event.preventDefault();
        const searchInput = document.getElementById('config-search');
        searchInput?.focus();
      }

      if (event.key === 'Escape' && searchQuery.trim()) {
        setSearchQuery('');
      }
    }

    window.addEventListener('keydown', onSearchKeyDown);
    return () => window.removeEventListener('keydown', onSearchKeyDown);
  }, [searchQuery]);

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

  const updateAiBlockedChannels = useCallback(
    (channels: string[]) => {
      updateDraftConfig((prev) => {
        if (!prev) return prev;
        return { ...prev, ai: { ...prev.ai, blockedChannelIds: channels } } as GuildConfig;
      });
    },
    [updateDraftConfig],
  );

  const updateChannelMode = useCallback(
    (channelId: string, mode: ChannelMode | undefined) => {
      updateDraftConfig((prev) => {
        if (!prev) return prev;
        const modes = { ...(prev.ai?.channelModes ?? {}) } as Record<string, ChannelMode>;
        const currentDefault: ChannelMode =
          (prev.ai?.defaultChannelMode as ChannelMode) ?? 'mention';
        if (mode === undefined || mode === currentDefault) {
          // Don't persist overrides that match the default — remove them
          delete modes[channelId];
        } else {
          modes[channelId] = mode;
        }
        return { ...prev, ai: { ...prev.ai, channelModes: modes } } as GuildConfig;
      });
    },
    [updateDraftConfig],
  );

  const updateDefaultChannelMode = useCallback(
    (mode: ChannelMode) => {
      updateDraftConfig((prev) => {
        if (!prev) return prev;
        // Prune any per-channel overrides that now match the new default
        const existingModes = { ...(prev.ai?.channelModes ?? {}) } as Record<string, ChannelMode>;
        for (const [channelId, channelMode] of Object.entries(existingModes)) {
          if (channelMode === mode) {
            delete existingModes[channelId];
          }
        }
        return {
          ...prev,
          ai: { ...prev.ai, defaultChannelMode: mode, channelModes: existingModes },
        } as GuildConfig;
      });
    },
    [updateDraftConfig],
  );

  const resetAllChannelModes = useCallback(() => {
    updateDraftConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, ai: { ...prev.ai, channelModes: {} } } as GuildConfig;
    });
  }, [updateDraftConfig]);

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

  const updateAuditLogField = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => {
        if (!prev) return prev;
        return { ...prev, auditLog: { ...prev.auditLog, [field]: value } } as GuildConfig;
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

  const updateAiAutoModField = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          aiAutoMod: { ...prev.aiAutoMod, [field]: value },
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

  const updateProtectRolesField = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => {
        if (!prev) return prev;
        const existingProtectRoles = prev.moderation?.protectRoles ?? {
          enabled: true,
          includeAdmins: true,
          includeModerators: true,
          includeServerOwner: true,
          roleIds: [],
        };
        return {
          ...prev,
          moderation: {
            ...prev.moderation,
            protectRoles: { ...existingProtectRoles, [field]: value },
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
        const updated = { ...prev.permissions, [field]: value };
        // Auto-clear legacy singular fields whenever the plural arrays are written,
        // so computePatches never includes both the old and new forms simultaneously.
        if (field === 'adminRoleIds') updated.adminRoleId = null;
        if (field === 'moderatorRoleIds') updated.moderatorRoleId = null;
        return { ...prev, permissions: updated } as GuildConfig;
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

  const updateBotStatusField = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => {
        if (!prev) return prev;
        return { ...prev, botStatus: { ...prev.botStatus, [field]: value } } as GuildConfig;
      });
    },
    [updateDraftConfig],
  );

  const updateBotStatusRotationField = useCallback(
    (field: string, value: unknown) => {
      updateDraftConfig((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          botStatus: {
            ...(prev.botStatus ?? {}),
            rotation: { ...(prev.botStatus?.rotation ?? {}), [field]: value },
          },
        } as GuildConfig;
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bot Configuration</h1>
          <p className="text-sm text-muted-foreground">
            Manage settings by category for faster edits and fewer misses.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Undo last save — visible only after a successful save with no new changes */}
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
          {/* Save button with unsaved-changes indicator dot */}
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
                title={`Unsaved changes in ${changedSections.length} section${changedSections.length === 1 ? '' : 's'}: ${changedSections.join(', ')}`}
              />
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[260px_minmax(0,1fr)]">
        {/* Unsaved changes banner — spans both columns */}
        {hasChanges && (
          <output
            aria-live="polite"
            className="col-span-full rounded-md border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-200"
          >
            You have unsaved changes in {changedCategoryCount}{' '}
            {changedCategoryCount === 1 ? 'category' : 'categories'}.{' '}
            <kbd className="rounded border border-yellow-500/30 bg-yellow-500/10 px-1.5 py-0.5 font-mono text-xs">
              Ctrl/⌘+S
            </kbd>{' '}
            to save.
          </output>
        )}

        {hasValidationErrors && (
          <output
            aria-live="polite"
            className="col-span-full rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            Fix validation errors before changes can be saved.
          </output>
        )}
        <CategoryNavigation
          activeCategoryId={activeCategoryId}
          dirtyCounts={dirtyCategoryCounts}
          onCategoryChange={setActiveCategoryId}
        />

        <div className="space-y-4">
          <div className="space-y-3 rounded-lg border bg-card p-4">
            <p className="text-sm font-medium">{activeCategory.label}</p>
            <p className="text-xs text-muted-foreground">{activeCategory.description}</p>
            <ConfigSearch
              value={searchQuery}
              onChange={handleSearchChange}
              results={searchResults}
              onSelect={handleSearchSelect}
            />
          </div>

          {searchQuery.trim() && visibleFeatureIds.size === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">No Matching Settings</CardTitle>
                <CardDescription>
                  No results in {activeCategory.label}. Try another keyword or jump from search
                  results.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" size="sm" onClick={() => setSearchQuery('')}>
                  Clear Search
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {/* AI section */}
          {activeCategoryId === 'ai-automation' && visibleFeatureIds.has('ai-chat') && (
            <SettingsFeatureCard
              featureId="ai-chat"
              title="AI Chat"
              description="Configure assistant behavior and response scope."
              enabled={draftConfig.ai?.enabled ?? false}
              onEnabledChange={updateAiEnabled}
              disabled={saving}
              basicContent={
                <SystemPromptEditor
                  value={draftConfig.ai?.systemPrompt ?? ''}
                  onChange={updateSystemPrompt}
                  disabled={saving}
                  maxLength={SYSTEM_PROMPT_MAX_LENGTH}
                />
              }
              advancedContent={
                guildId ? (
                  <div className="space-y-2">
                    <label htmlFor="ai-blocked-channels" className="block">
                      <span className="text-sm font-medium">Blocked Channels</span>
                    </label>
                    <p className="text-xs text-muted-foreground">
                      The bot will not read messages, respond, or run triage in these channels.
                    </p>
                    <ChannelSelector
                      id="ai-blocked-channels"
                      guildId={guildId}
                      selected={(draftConfig.ai?.blockedChannelIds ?? []) as string[]}
                      onChange={updateAiBlockedChannels}
                      placeholder="Select channels to block AI in..."
                      disabled={saving}
                      filter="text"
                    />
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">Select a server first</p>
                )
              }
              forceOpenAdvanced={forceOpenAdvancedFeatureId === 'ai-chat'}
            />
          )}

          {/* Channel Mode section */}
          {activeCategoryId === 'ai-automation' && visibleFeatureIds.has('ai-chat') && guildId && (
            <ChannelModeSection
              draftConfig={draftConfig}
              saving={saving}
              guildId={guildId}
              onChannelModeChange={updateChannelMode}
              onDefaultModeChange={updateDefaultChannelMode}
              onResetAll={resetAllChannelModes}
            />
          )}

          {/* Welcome section */}
          {activeCategoryId === 'onboarding-growth' && visibleFeatureIds.has('welcome') && (
            <SettingsFeatureCard
              featureId="welcome"
              title="Welcome Messages"
              description="Greet and onboard new members when they join."
              enabled={draftConfig.welcome?.enabled ?? false}
              onEnabledChange={updateWelcomeEnabled}
              disabled={saving}
              basicContent={
                <div className="space-y-4">
                  <label htmlFor="welcome-message" className="space-y-2 block">
                    <span className="text-sm font-medium">Welcome Message</span>
                    <textarea
                      id="welcome-message"
                      value={draftConfig.welcome?.message ?? ''}
                      onChange={(e) => updateWelcomeMessage(e.target.value)}
                      rows={4}
                      disabled={saving}
                      className={inputClasses}
                      placeholder="Welcome message template..."
                      aria-describedby="welcome-message-hint"
                    />
                  </label>
                  <p id="welcome-message-hint" className="text-xs text-muted-foreground">
                    Use {'{user}'} for the member mention and {'{memberCount}'} for the server
                    member count.
                  </p>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <label htmlFor="rules-channel-id" className="space-y-2">
                      <span className="text-sm font-medium">Rules Channel ID</span>
                      <ChannelSelector
                        id="rules-channel-id"
                        guildId={guildId}
                        selected={
                          draftConfig.welcome?.rulesChannel
                            ? [draftConfig.welcome.rulesChannel]
                            : []
                        }
                        onChange={(selected) =>
                          updateWelcomeField('rulesChannel', selected[0] ?? null)
                        }
                        disabled={saving}
                        placeholder="Select rules channel"
                        maxSelections={1}
                        filter="text"
                      />
                    </label>
                    <label htmlFor="verified-role-id" className="space-y-2">
                      <span className="text-sm font-medium">Verified Role ID</span>
                      <RoleSelector
                        id="verified-role-id"
                        guildId={guildId}
                        selected={
                          draftConfig.welcome?.verifiedRole
                            ? [draftConfig.welcome.verifiedRole]
                            : []
                        }
                        onChange={(selected) =>
                          updateWelcomeField('verifiedRole', selected[0] ?? null)
                        }
                        disabled={saving}
                        placeholder="Select verified role"
                        maxSelections={1}
                      />
                    </label>
                    <label htmlFor="intro-channel-id" className="space-y-2">
                      <span className="text-sm font-medium">Intro Channel ID</span>
                      <ChannelSelector
                        id="intro-channel-id"
                        guildId={guildId}
                        selected={
                          draftConfig.welcome?.introChannel
                            ? [draftConfig.welcome.introChannel]
                            : []
                        }
                        onChange={(selected) =>
                          updateWelcomeField('introChannel', selected[0] ?? null)
                        }
                        disabled={saving}
                        placeholder="Select intro channel"
                        maxSelections={1}
                        filter="text"
                      />
                    </label>
                  </div>
                </div>
              }
              advancedContent={
                <div className="space-y-4">
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
                                const opts = [
                                  ...(draftConfig.welcome?.roleMenu?.options ?? []),
                                ].filter((o) => o.id !== opt.id);
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
                        disabled={
                          saving || (draftConfig.welcome?.roleMenu?.options ?? []).length >= 25
                        }
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
                </div>
              }
              forceOpenAdvanced={forceOpenAdvancedFeatureId === 'welcome'}
            />
          )}

          {/* Moderation section */}
          {draftConfig.moderation &&
            activeCategoryId === 'moderation-safety' &&
            visibleFeatureIds.has('moderation') && (
              <SettingsFeatureCard
                featureId="moderation"
                title="Moderation"
                description="Configure moderation alerts, notification behavior, and enforcement rules."
                enabled={draftConfig.moderation?.enabled ?? false}
                onEnabledChange={updateModerationEnabled}
                disabled={saving}
                basicContent={
                  <div className="space-y-4">
                    <label htmlFor="alert-channel-id" className="space-y-2 block">
                      <span className="text-sm font-medium">Alert Channel ID</span>
                      <ChannelSelector
                        id="alert-channel-id"
                        guildId={guildId}
                        selected={
                          draftConfig.moderation?.alertChannelId
                            ? [draftConfig.moderation.alertChannelId]
                            : []
                        }
                        onChange={(selected) =>
                          updateModerationField('alertChannelId', selected[0] ?? null)
                        }
                        disabled={saving}
                        placeholder="Select moderation alert channel"
                        maxSelections={1}
                        filter="text"
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
                  </div>
                }
                advancedContent={
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Escalation Enabled</span>
                      <ToggleSwitch
                        checked={draftConfig.moderation?.escalation?.enabled ?? false}
                        onChange={(v) => updateModerationEscalation(v)}
                        disabled={saving}
                        label="Escalation"
                      />
                    </div>

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
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <label htmlFor="max-messages" className="space-y-2">
                          <span className="text-sm text-muted-foreground">Max Messages</span>
                          <input
                            id="max-messages"
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
                        <label htmlFor="window-seconds" className="space-y-2">
                          <span className="text-sm text-muted-foreground">Window (seconds)</span>
                          <input
                            id="window-seconds"
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
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <label htmlFor="mute-after-triggers" className="space-y-2">
                          <span className="text-sm text-muted-foreground">Mute After Triggers</span>
                          <input
                            id="mute-after-triggers"
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
                        <label htmlFor="mute-window-s" className="space-y-2">
                          <span className="text-sm text-muted-foreground">Mute Window (s)</span>
                          <input
                            id="mute-window-s"
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
                        <label htmlFor="mute-duration-s" className="space-y-2">
                          <span className="text-sm text-muted-foreground">Mute Duration (s)</span>
                          <input
                            id="mute-duration-s"
                            type="number"
                            min={1}
                            value={draftConfig.moderation?.rateLimit?.muteDurationSeconds ?? 300}
                            onChange={(e) => {
                              const num = parseNumberInput(e.target.value, 1);
                              if (num !== undefined)
                                updateRateLimitField('muteDurationSeconds', num);
                            }}
                            disabled={saving}
                            className={inputClasses}
                          />
                        </label>
                      </div>
                    </fieldset>

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
                      <label htmlFor="blocked-domains" className="space-y-2">
                        <span className="text-sm text-muted-foreground">Blocked Domains</span>
                        <input
                          id="blocked-domains"
                          type="text"
                          value={(draftConfig.moderation?.linkFilter?.blockedDomains ?? []).join(
                            ', ',
                          )}
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

                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium">Protect Roles from Moderation</legend>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Enabled</span>
                        <ToggleSwitch
                          checked={draftConfig.moderation?.protectRoles?.enabled ?? true}
                          onChange={(v) => updateProtectRolesField('enabled', v)}
                          disabled={saving}
                          label="Protect Roles"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Include admins</span>
                        <ToggleSwitch
                          checked={draftConfig.moderation?.protectRoles?.includeAdmins ?? true}
                          onChange={(v) => updateProtectRolesField('includeAdmins', v)}
                          disabled={saving}
                          label="Include admins"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Include moderators</span>
                        <ToggleSwitch
                          checked={draftConfig.moderation?.protectRoles?.includeModerators ?? true}
                          onChange={(v) => updateProtectRolesField('includeModerators', v)}
                          disabled={saving}
                          label="Include moderators"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Include server owner</span>
                        <ToggleSwitch
                          checked={draftConfig.moderation?.protectRoles?.includeServerOwner ?? true}
                          onChange={(v) => updateProtectRolesField('includeServerOwner', v)}
                          disabled={saving}
                          label="Include server owner"
                        />
                      </div>
                      <label htmlFor="protected-role-ids" className="space-y-2">
                        <span className="text-sm text-muted-foreground">
                          Additional protected roles
                        </span>
                        <RoleSelector
                          id="protected-role-ids"
                          guildId={guildId}
                          selected={
                            (draftConfig.moderation?.protectRoles?.roleIds ?? []) as string[]
                          }
                          onChange={(selected) => updateProtectRolesField('roleIds', selected)}
                          disabled={saving}
                          placeholder="Select protected roles"
                        />
                      </label>
                    </fieldset>
                  </div>
                }
                forceOpenAdvanced={forceOpenAdvancedFeatureId === 'moderation'}
              />
            )}

          {/* AI Auto-Moderation section */}
          {draftConfig.aiAutoMod &&
            activeCategoryId === 'ai-automation' &&
            visibleFeatureIds.has('ai-automod') && (
              <SettingsFeatureCard
                featureId="ai-automod"
                title="AI Auto-Moderation"
                description="Analyze messages with AI and apply moderation actions."
                enabled={Boolean(draftConfig.aiAutoMod?.enabled)}
                onEnabledChange={(v) => updateAiAutoModField('enabled', v)}
                disabled={saving}
                basicContent={
                  <div className="space-y-4">
                    <label htmlFor="ai-automod-flag-channel" className="space-y-2 block">
                      <span className="text-sm font-medium">Flag Review Channel ID</span>
                      <ChannelSelector
                        id="ai-automod-flag-channel"
                        guildId={guildId}
                        selected={
                          draftConfig.aiAutoMod?.flagChannelId
                            ? [draftConfig.aiAutoMod.flagChannelId]
                            : []
                        }
                        onChange={(selected) =>
                          updateAiAutoModField('flagChannelId', selected[0] ?? null)
                        }
                        disabled={saving}
                        placeholder="Select flag review channel"
                        maxSelections={1}
                        filter="text"
                      />
                    </label>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Auto-delete flagged messages</span>
                      <ToggleSwitch
                        checked={Boolean(draftConfig.aiAutoMod?.autoDelete ?? true)}
                        onChange={(v) => updateAiAutoModField('autoDelete', v)}
                        disabled={saving}
                        label="Auto-delete"
                      />
                    </div>
                  </div>
                }
                advancedContent={
                  <div className="space-y-4">
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium">Thresholds (0–100)</legend>
                      <p className="text-muted-foreground text-xs">
                        Confidence threshold (%) above which the action triggers.
                      </p>
                      {(['toxicity', 'spam', 'harassment'] as const).map((cat) => (
                        <label
                          key={cat}
                          htmlFor={`ai-threshold-${cat}`}
                          className="flex items-center gap-3"
                        >
                          <span className="w-24 text-sm capitalize">{cat}</span>
                          <input
                            id={`ai-threshold-${cat}`}
                            type="number"
                            min={0}
                            max={100}
                            step={5}
                            value={Math.round(
                              ((draftConfig.aiAutoMod?.thresholds as Record<string, number>)?.[
                                cat
                              ] ?? 0.7) * 100,
                            )}
                            onChange={(e) => {
                              const raw = Number(e.target.value);
                              const v = Number.isNaN(raw) ? 0 : Math.min(1, Math.max(0, raw / 100));
                              updateAiAutoModField('thresholds', {
                                ...((draftConfig.aiAutoMod?.thresholds as Record<string, number>) ??
                                  {}),
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
                        <label
                          key={cat}
                          htmlFor={`ai-action-${cat}`}
                          className="flex items-center gap-3"
                        >
                          <span className="w-24 text-sm capitalize">{cat}</span>
                          <select
                            id={`ai-action-${cat}`}
                            value={
                              (draftConfig.aiAutoMod?.actions as Record<string, string>)?.[cat] ??
                              'flag'
                            }
                            onChange={(e) => {
                              updateAiAutoModField('actions', {
                                ...((draftConfig.aiAutoMod?.actions as Record<string, string>) ??
                                  {}),
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
                  </div>
                }
                forceOpenAdvanced={forceOpenAdvancedFeatureId === 'ai-automod'}
              />
            )}

          {/* Triage section */}
          {draftConfig.triage &&
            activeCategoryId === 'ai-automation' &&
            visibleFeatureIds.has('triage') && (
              <SettingsFeatureCard
                featureId="triage"
                title="Triage"
                description="Classifier, responder, and triage orchestration settings."
                enabled={draftConfig.triage?.enabled ?? false}
                onEnabledChange={updateTriageEnabled}
                disabled={saving}
                basicContent={
                  <div className="space-y-4">
                    <label htmlFor="classify-model" className="space-y-2 block">
                      <span className="text-sm font-medium">Classify Model</span>
                      <input
                        id="classify-model"
                        type="text"
                        value={draftConfig.triage?.classifyModel ?? ''}
                        onChange={(e) => updateTriageField('classifyModel', e.target.value)}
                        disabled={saving}
                        className={inputClasses}
                        placeholder="e.g. claude-haiku-4-5"
                      />
                    </label>
                    <label htmlFor="respond-model" className="space-y-2 block">
                      <span className="text-sm font-medium">Respond Model</span>
                      <input
                        id="respond-model"
                        type="text"
                        value={draftConfig.triage?.respondModel ?? ''}
                        onChange={(e) => updateTriageField('respondModel', e.target.value)}
                        disabled={saving}
                        className={inputClasses}
                        placeholder="e.g. claude-sonnet-4-6"
                      />
                    </label>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <label htmlFor="classify-budget" className="space-y-2">
                        <span className="text-sm font-medium">Classify Budget</span>
                        <input
                          id="classify-budget"
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
                      <label htmlFor="respond-budget" className="space-y-2">
                        <span className="text-sm font-medium">Respond Budget</span>
                        <input
                          id="respond-budget"
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
                    <label htmlFor="moderation-log-channel" className="space-y-2 block">
                      <span className="text-sm font-medium">Moderation Log Channel</span>
                      <ChannelSelector
                        id="moderation-log-channel"
                        guildId={guildId}
                        selected={
                          draftConfig.triage?.moderationLogChannel
                            ? [draftConfig.triage.moderationLogChannel]
                            : []
                        }
                        onChange={(selected) =>
                          updateTriageField('moderationLogChannel', selected[0] ?? null)
                        }
                        disabled={saving}
                        placeholder="Select moderation log channel"
                        maxSelections={1}
                        filter="text"
                      />
                    </label>
                  </div>
                }
                advancedContent={
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <label htmlFor="default-interval-ms" className="space-y-2">
                        <span className="text-sm font-medium">Default Interval (ms)</span>
                        <input
                          id="default-interval-ms"
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
                      <label htmlFor="timeout-ms" className="space-y-2">
                        <span className="text-sm font-medium">Timeout (ms)</span>
                        <input
                          id="timeout-ms"
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
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <label htmlFor="context-messages" className="space-y-2">
                        <span className="text-sm font-medium">Context Messages</span>
                        <input
                          id="context-messages"
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
                      <label htmlFor="max-buffer-size" className="space-y-2">
                        <span className="text-sm font-medium">Max Buffer Size</span>
                        <input
                          id="max-buffer-size"
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
                  </div>
                }
                forceOpenAdvanced={forceOpenAdvancedFeatureId === 'triage'}
              />
            )}

          {activeCategoryId === 'moderation-safety' && visibleFeatureIds.has('starboard') && (
            <SettingsFeatureCard
              featureId="starboard"
              title="Starboard"
              description="Pin popular messages to a starboard channel."
              enabled={draftConfig.starboard?.enabled ?? false}
              onEnabledChange={(v) => updateStarboardField('enabled', v)}
              disabled={saving}
              basicContent={
                <div className="space-y-4">
                  <label htmlFor="channel-id" className="space-y-2 block">
                    <span className="text-sm font-medium">Channel ID</span>
                    <ChannelSelector
                      id="channel-id"
                      guildId={guildId}
                      selected={
                        draftConfig.starboard?.channelId ? [draftConfig.starboard.channelId] : []
                      }
                      onChange={(selected) => updateStarboardField('channelId', selected[0] ?? '')}
                      disabled={saving}
                      placeholder="Select starboard channel"
                      maxSelections={1}
                      filter="text"
                    />
                  </label>
                  <label htmlFor="threshold" className="space-y-2 block">
                    <span className="text-sm font-medium">Threshold</span>
                    <input
                      id="threshold"
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
                </div>
              }
              advancedContent={
                <div className="space-y-4">
                  <label htmlFor="emoji" className="space-y-2 block">
                    <span className="text-sm font-medium">Emoji</span>
                    <div className="flex items-center gap-2">
                      <input
                        id="emoji"
                        type="text"
                        value={draftConfig.starboard?.emoji ?? '*'}
                        onChange={(e) =>
                          updateStarboardField('emoji', e.target.value.trim() || '*')
                        }
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
                  </label>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Allow Self-Star</span>
                    <ToggleSwitch
                      checked={draftConfig.starboard?.selfStarAllowed ?? false}
                      onChange={(v) => updateStarboardField('selfStarAllowed', v)}
                      disabled={saving}
                      label="Self-Star Allowed"
                    />
                  </div>
                  <label htmlFor="ignored-channels" className="space-y-2 block">
                    <span className="text-sm font-medium">Ignored Channels</span>
                    <ChannelSelector
                      id="ignored-channels"
                      guildId={guildId}
                      selected={(draftConfig.starboard?.ignoredChannels ?? []) as string[]}
                      onChange={(selected) => updateStarboardField('ignoredChannels', selected)}
                      disabled={saving}
                      placeholder="Select ignored channels"
                      filter="text"
                    />
                  </label>
                </div>
              }
              forceOpenAdvanced={forceOpenAdvancedFeatureId === 'starboard'}
            />
          )}

          {activeCategoryId === 'moderation-safety' && visibleFeatureIds.has('permissions') && (
            <SettingsFeatureCard
              featureId="permissions"
              title="Permissions"
              description="Configure role-based access and owner overrides."
              enabled={draftConfig.permissions?.enabled ?? false}
              onEnabledChange={(v) => updatePermissionsField('enabled', v)}
              disabled={saving}
              basicContent={
                <div className="space-y-4">
                  <label htmlFor="admin-role-ids" className="space-y-2 block">
                    <span className="text-sm font-medium">Admin Roles</span>
                    <RoleSelector
                      id="admin-role-ids"
                      guildId={guildId}
                      selected={[
                        ...(draftConfig.permissions?.adminRoleIds ?? []),
                        ...(draftConfig.permissions?.adminRoleId &&
                        !(draftConfig.permissions?.adminRoleIds ?? []).includes(
                          draftConfig.permissions.adminRoleId,
                        )
                          ? [draftConfig.permissions.adminRoleId]
                          : []),
                      ]}
                      onChange={(selected) => {
                        updatePermissionsField('adminRoleIds', selected);
                      }}
                      placeholder="Select admin roles"
                      disabled={saving}
                    />
                  </label>
                  <label htmlFor="moderator-role-ids" className="space-y-2 block">
                    <span className="text-sm font-medium">Moderator Roles</span>
                    <RoleSelector
                      id="moderator-role-ids"
                      guildId={guildId}
                      selected={[
                        ...(draftConfig.permissions?.moderatorRoleIds ?? []),
                        ...(draftConfig.permissions?.moderatorRoleId &&
                        !(draftConfig.permissions?.moderatorRoleIds ?? []).includes(
                          draftConfig.permissions.moderatorRoleId,
                        )
                          ? [draftConfig.permissions.moderatorRoleId]
                          : []),
                      ]}
                      onChange={(selected) => {
                        updatePermissionsField('moderatorRoleIds', selected);
                      }}
                      placeholder="Select moderator roles"
                      disabled={saving}
                    />
                  </label>
                </div>
              }
              advancedContent={
                <label htmlFor="bot-owners" className="space-y-2 block">
                  <span className="text-sm font-medium">Bot Owners</span>
                  <input
                    id="bot-owners"
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
              }
              forceOpenAdvanced={forceOpenAdvancedFeatureId === 'permissions'}
            />
          )}

          {activeCategoryId === 'moderation-safety' && visibleFeatureIds.has('audit-log') && (
            <SettingsFeatureCard
              featureId="audit-log"
              title="Audit Log"
              description="Record admin actions taken via the dashboard (config changes, XP adjustments, warnings)."
              enabled={draftConfig.auditLog?.enabled ?? true}
              onEnabledChange={(v) => updateAuditLogField('enabled', v)}
              disabled={saving}
              forceOpenAdvanced={forceOpenAdvancedFeatureId === 'audit-log'}
              basicContent={
                <AuditLogSection
                  draftConfig={draftConfig ?? {}}
                  saving={saving}
                  onEnabledChange={(v) => updateAuditLogField('enabled', v)}
                  onRetentionDaysChange={(days) => updateAuditLogField('retentionDays', days)}
                />
              }
            />
          )}

          {activeCategoryId === 'ai-automation' && visibleFeatureIds.has('memory') && (
            <SettingsFeatureCard
              featureId="memory"
              title="Memory"
              description="Configure AI context memory and extraction."
              enabled={draftConfig.memory?.enabled ?? false}
              onEnabledChange={(v) => updateMemoryField('enabled', v)}
              disabled={saving}
              basicContent={
                <label htmlFor="max-context-memories" className="space-y-2 block">
                  <span className="text-sm font-medium">Max Context Memories</span>
                  <input
                    id="max-context-memories"
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
              }
              advancedContent={
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Auto-Extract</span>
                  <ToggleSwitch
                    checked={draftConfig.memory?.autoExtract ?? false}
                    onChange={(v) => updateMemoryField('autoExtract', v)}
                    disabled={saving}
                    label="Auto-Extract"
                  />
                </div>
              }
              forceOpenAdvanced={forceOpenAdvancedFeatureId === 'memory'}
            />
          )}

          {activeCategoryId === 'community-tools' && visibleFeatureIds.has('bot-status') && (
            <SettingsFeatureCard
              featureId="bot-status"
              title="Bot Presence"
              description="Set bot presence and rotate status messages."
              enabled={draftConfig.botStatus?.enabled ?? true}
              onEnabledChange={(v) => updateBotStatusField('enabled', v)}
              disabled={saving}
              basicContent={
                <div className="space-y-4">
                  <label htmlFor="bot-status-value" className="space-y-2 block">
                    <span className="text-sm font-medium">Presence Status</span>
                    <select
                      id="bot-status-value"
                      value={draftConfig.botStatus?.status ?? 'online'}
                      onChange={(e) => updateBotStatusField('status', e.target.value)}
                      disabled={saving}
                      className={inputClasses}
                    >
                      <option value="online">Online</option>
                      <option value="idle">Idle</option>
                      <option value="dnd">Do Not Disturb</option>
                      <option value="invisible">Invisible</option>
                    </select>
                  </label>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Enable Rotation</span>
                    <ToggleSwitch
                      checked={draftConfig.botStatus?.rotation?.enabled ?? false}
                      onChange={(v) => updateBotStatusRotationField('enabled', v)}
                      disabled={saving}
                      label="Enable Rotation"
                    />
                  </div>
                </div>
              }
              advancedContent={
                <div className="space-y-4">
                  <label htmlFor="bot-status-interval-minutes" className="space-y-2 block">
                    <span className="text-sm font-medium">Rotation Interval (minutes)</span>
                    <input
                      id="bot-status-interval-minutes"
                      type="number"
                      min={1}
                      value={draftConfig.botStatus?.rotation?.intervalMinutes ?? 5}
                      onChange={(e) => {
                        const num = parseNumberInput(e.target.value, 1);
                        if (num !== undefined) updateBotStatusRotationField('intervalMinutes', num);
                      }}
                      disabled={saving}
                      className={inputClasses}
                    />
                  </label>
                </div>
              }
              forceOpenAdvanced={forceOpenAdvancedFeatureId === 'bot-status'}
            />
          )}

          <CommunitySettingsSection
            draftConfig={draftConfig}
            saving={saving}
            guildId={guildId}
            inputClasses={inputClasses}
            defaultActivityBadges={DEFAULT_ACTIVITY_BADGES}
            parseNumberInput={parseNumberInput}
            updateDraftConfig={updateDraftConfig}
            activeCategoryId={activeCategoryId}
            visibleFeatureIds={visibleFeatureIds}
            forceOpenAdvancedFeatureId={forceOpenAdvancedFeatureId}
          />
        </div>
      </div>

      {hasChanges && savedConfig && (
        <ConfigDiff
          original={savedConfig}
          modified={draftConfig}
          changedSections={changedSections}
          onRevertSection={revertSection}
        />
      )}

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
