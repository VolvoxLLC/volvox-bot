'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import {
  CONFIG_CATEGORIES,
  getMatchedFeatureIds,
  getMatchingSearchItems,
} from '@/components/dashboard/config-workspace/config-categories';
import type {
  ConfigCategoryId,
  ConfigFeatureId,
  ConfigSearchItem,
} from '@/components/dashboard/config-workspace/types';
import { computePatches, deepEqual } from '@/lib/config-utils';
import { GUILD_SELECTED_EVENT, SELECTED_GUILD_KEY } from '@/lib/guild-selection';
import { SYSTEM_PROMPT_MAX_LENGTH } from '@/types/config';
import type { GuildConfig } from './config-editor-utils';
import { generateId, isGuildConfig } from './config-editor-utils';

export type { GuildConfig } from './config-editor-utils';

/** Values exposed by the config context to all dashboard consumers. */
export interface ConfigContextValue {
  guildId: string;
  draftConfig: GuildConfig | null;
  savedConfig: GuildConfig | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  hasChanges: boolean;
  hasValidationErrors: boolean;
  changedSections: string[];
  updateDraftConfig: (updater: (prev: GuildConfig) => GuildConfig) => void;
  searchQuery: string;
  visibleFeatureIds: Set<ConfigFeatureId>;
  forceOpenAdvancedFeatureId: ConfigFeatureId | null;
  openDiffModal: () => void;
  discardChanges: () => void;
  undoLastSave: () => void;
  executeSave: () => Promise<void>;
  revertSection: (section: string) => void;
  showDiffModal: boolean;
  setShowDiffModal: (open: boolean) => void;
  prevSavedConfig: { guildId: string; config: GuildConfig } | null;
  dirtyCategoryCounts: Record<ConfigCategoryId, number>;
  changedCategoryCount: number;
  fetchConfig: (id: string) => Promise<void>;
  searchResults: ConfigSearchItem[];
  handleSearchSelect: (item: ConfigSearchItem) => void;
  handleSearchChange: (value: string) => void;
  activeCategoryId: ConfigCategoryId | null;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

/**
 * Access the shared config editor state.
 *
 * @throws {Error} If called outside of a `ConfigProvider`.
 * @returns The current `ConfigContextValue`.
 */
export function useConfigContext(): ConfigContextValue {
  const ctx = useContext(ConfigContext);
  if (!ctx) {
    throw new Error('useConfigContext must be used within ConfigProvider');
  }
  return ctx;
}

/**
 * Parse the active config category slug from a dashboard pathname.
 *
 * @param pathname - The current URL pathname (e.g. `/dashboard/settings/ai-automation`)
 * @returns The category id if the pathname has a valid category segment; `null` for the landing page.
 */
function parseCategoryFromPathname(pathname: string): ConfigCategoryId | null {
  const prefix = '/dashboard/settings/';
  if (!pathname.startsWith(prefix)) return null;
  const slug = pathname.slice(prefix.length).split('/')[0];
  if (!slug) return null;
  const match = CONFIG_CATEGORIES.find((c) => c.id === slug);
  return match ? match.id : null;
}

/**
 * Provides shared config editor state to all dashboard children.
 *
 * Manages guild selection, config fetching, draft editing, validation,
 * search, save/discard/undo flows, keyboard shortcuts, and derived state.
 *
 * @param props.children - React children to render within the provider.
 */
export function ConfigProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [guildId, setGuildId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [prevSavedConfig, setPrevSavedConfig] = useState<{
    guildId: string;
    config: GuildConfig;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedConfig, setSavedConfig] = useState<GuildConfig | null>(null);
  const [draftConfig, setDraftConfig] = useState<GuildConfig | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [focusFeatureId, setFocusFeatureId] = useState<ConfigFeatureId | null>(null);
  const [selectedSearchItemId, setSelectedSearchItemId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Derive active category from URL
  const activeCategoryId = useMemo(() => parseCategoryFromPathname(pathname), [pathname]);

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

  // ── Reset focus state on route change ──────────────────────────
  const prevPathnameRef = useRef(pathname);
  useEffect(() => {
    if (pathname !== prevPathnameRef.current) {
      setFocusFeatureId(null);
      setSelectedSearchItemId(null);
      prevPathnameRef.current = pathname;
    }
  }, [pathname]);

  // ── Derived state ──────────────────────────────────────────────
  const hasChanges = useMemo(() => {
    if (!savedConfig || !draftConfig) return false;
    return !deepEqual(savedConfig, draftConfig);
  }, [savedConfig, draftConfig]);

  const hasValidationErrors = useMemo(() => {
    if (!draftConfig) return false;
    const roleMenuEnabled = draftConfig.welcome?.roleMenu?.enabled ?? false;
    const roleMenuOptions = draftConfig.welcome?.roleMenu?.options ?? [];
    const hasRoleMenuErrors = roleMenuOptions.some(
      (opt) => !opt.label?.trim() || !opt.roleId?.trim(),
    );
    if (roleMenuEnabled && hasRoleMenuErrors) return true;
    const promptLength = draftConfig.ai?.systemPrompt?.length ?? 0;
    return promptLength > SYSTEM_PROMPT_MAX_LENGTH;
  }, [draftConfig]);

  const changedSections = useMemo(() => {
    if (!savedConfig || !draftConfig) return [];
    const patches = computePatches(savedConfig, draftConfig);
    return [...new Set(patches.map((p) => p.path.split('.')[0]))];
  }, [savedConfig, draftConfig]);

  const searchResults = useMemo(() => getMatchingSearchItems(searchQuery), [searchQuery]);

  const matchedFeatureIds = useMemo(() => getMatchedFeatureIds(searchQuery), [searchQuery]);

  const activeCategory = useMemo(
    () =>
      activeCategoryId ? (CONFIG_CATEGORIES.find((c) => c.id === activeCategoryId) ?? null) : null,
    [activeCategoryId],
  );

  const visibleFeatureIds = useMemo(() => {
    if (!activeCategory) return new Set<ConfigFeatureId>();
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

  // ── Search handlers ────────────────────────────────────────────
  const handleSearchSelect = useCallback(
    (item: ConfigSearchItem) => {
      router.push(`/dashboard/settings/${item.categoryId}`);
      setFocusFeatureId(item.featureId);
      setSelectedSearchItemId(item.id);
    },
    [router],
  );

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    setSelectedSearchItemId(null);
  }, []);

  // ── Focus feature effect ───────────────────────────────────────
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

  // ── Auto-dismiss prevSavedConfig after 30s ─────────────────────
  useEffect(() => {
    if (!prevSavedConfig) return;
    const timer = window.setTimeout(() => {
      setPrevSavedConfig(null);
    }, 30_000);
    return () => window.clearTimeout(timer);
  }, [prevSavedConfig]);

  // ── Keyboard shortcut: Ctrl/Cmd+S → open diff preview ─────────
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

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 's') return;

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

  // ── Revert a single section ────────────────────────────────────
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
      toast.success(`Reverted ${section} changes.`);
    },
    [savedConfig],
  );

  // ── Execute save (batched PATCH per section) ───────────────────
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

  // ── Undo last save ─────────────────────────────────────────────
  const undoLastSave = useCallback(() => {
    if (!prevSavedConfig) return;
    if (prevSavedConfig.guildId !== guildId) {
      setPrevSavedConfig(null);
      return;
    }
    setDraftConfig(structuredClone(prevSavedConfig.config));
    setPrevSavedConfig(null);
    toast.info('Reverted to previous saved state. Save again to apply.');
  }, [prevSavedConfig, guildId]);

  // ── Discard edits ──────────────────────────────────────────────
  const discardChanges = useCallback(() => {
    if (!savedConfig) return;
    setDraftConfig(structuredClone(savedConfig));
    toast.success('Changes discarded.');
  }, [savedConfig]);

  const value = useMemo<ConfigContextValue>(
    () => ({
      guildId,
      draftConfig,
      savedConfig,
      loading,
      saving,
      error,
      hasChanges,
      hasValidationErrors,
      changedSections,
      updateDraftConfig,
      searchQuery,
      visibleFeatureIds,
      forceOpenAdvancedFeatureId,
      openDiffModal,
      discardChanges,
      undoLastSave,
      executeSave,
      revertSection,
      showDiffModal,
      setShowDiffModal,
      prevSavedConfig,
      dirtyCategoryCounts,
      changedCategoryCount,
      fetchConfig,
      searchResults,
      handleSearchSelect,
      handleSearchChange,
      activeCategoryId,
    }),
    [
      guildId,
      draftConfig,
      savedConfig,
      loading,
      saving,
      error,
      hasChanges,
      hasValidationErrors,
      changedSections,
      updateDraftConfig,
      searchQuery,
      visibleFeatureIds,
      forceOpenAdvancedFeatureId,
      openDiffModal,
      discardChanges,
      undoLastSave,
      executeSave,
      revertSection,
      showDiffModal,
      prevSavedConfig,
      dirtyCategoryCounts,
      changedCategoryCount,
      fetchConfig,
      searchResults,
      handleSearchSelect,
      handleSearchChange,
      activeCategoryId,
    ],
  );

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}
