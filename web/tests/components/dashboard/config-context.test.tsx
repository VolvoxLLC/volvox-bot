import { renderHook, waitFor, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

const mockPush = vi.fn();
const mockPathname = vi.fn(() => '/dashboard/settings');
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: mockPush }),
}));

const minimalConfig = {
  ai: { enabled: false, systemPrompt: '', blockedChannelIds: [] },
  moderation: { enabled: false },
  welcome: {
    enabled: false,
    roleMenu: { enabled: false, options: [] },
    dmSequence: { enabled: false, steps: [] },
  },
  triage: { enabled: false },
  starboard: { enabled: false },
  permissions: { enabled: false, botOwners: [] },
  memory: { enabled: false },
};

function configResponse(body: unknown, init: Partial<Response> = {}) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    ...init,
  };
}

function mockConfigFetch(config: unknown = minimalConfig) {
  const fetchMock = vi.fn().mockResolvedValue(configResponse(config));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function renderConfigContext() {
  const { ConfigProvider, useConfigContext } = await import(
    '@/components/dashboard/config-context'
  );
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ConfigProvider>{children}</ConfigProvider>
  );
  return renderHook(() => useConfigContext(), { wrapper });
}

describe('ConfigProvider', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    localStorage.setItem('volvox-bot-selected-guild', 'guild-123');
    mockPathname.mockReturnValue('/dashboard/settings');
    mockPush.mockClear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('provides config after fetch', async () => {
    const fetchMock = mockConfigFetch();

    const { result } = await renderConfigContext();

    await waitFor(() => {
      expect(result.current.guildId).toBe('guild-123');
      expect(result.current.draftConfig).not.toBeNull();
    });
    expect(result.current.guildId).toBe('guild-123');
    expect(result.current.hasChanges).toBe(false);
    expect(result.current.saving).toBe(false);
  });

  it('updateDraftConfig marks hasChanges', async () => {
    mockConfigFetch();

    const { result } = await renderConfigContext();

    await waitFor(() => expect(result.current.draftConfig).not.toBeNull());
    act(() => {
      result.current.updateDraftConfig((prev) => ({
        ...prev,
        ai: { ...prev.ai, enabled: true },
      }));
    });
    expect(result.current.hasChanges).toBe(true);
  });

  it('discardChanges resets draft to saved', async () => {
    mockConfigFetch();

    const { result } = await renderConfigContext();

    await waitFor(() => expect(result.current.draftConfig).not.toBeNull());
    act(() => {
      result.current.updateDraftConfig((prev) => ({
        ...prev,
        ai: { ...prev.ai, enabled: true },
      }));
    });
    expect(result.current.hasChanges).toBe(true);
    act(() => result.current.discardChanges());
    expect(result.current.hasChanges).toBe(false);
  });

  it('throws when useConfigContext is used outside provider', async () => {
    const { useConfigContext } = await import('@/components/dashboard/config-context');
    expect(() => renderHook(() => useConfigContext())).toThrow(
      'useConfigContext must be used within ConfigProvider',
    );
  });

  it('derives activeCategoryId as null on landing page', async () => {
    mockPathname.mockReturnValue('/dashboard/settings');
    mockConfigFetch();

    const { result } = await renderConfigContext();

    await waitFor(() => expect(result.current.draftConfig).not.toBeNull());
    expect(result.current.activeCategoryId).toBeNull();
  });

  it('derives activeCategoryId from pathname', async () => {
    mockPathname.mockReturnValue('/dashboard/settings/ai-automation');
    mockConfigFetch();

    const { result } = await renderConfigContext();

    await waitFor(() => expect(result.current.draftConfig).not.toBeNull());
    expect(result.current.activeCategoryId).toBe('ai-automation');
  });

  it('returns empty visibleFeatureIds when activeCategoryId is null', async () => {
    mockPathname.mockReturnValue('/dashboard/settings');
    mockConfigFetch();

    const { result } = await renderConfigContext();

    await waitFor(() => expect(result.current.draftConfig).not.toBeNull());
    expect(result.current.visibleFeatureIds.size).toBe(0);
  });

  it('handleSearchSelect navigates to the category page', async () => {
    mockConfigFetch();

    const { result } = await renderConfigContext();

    await waitFor(() => expect(result.current.draftConfig).not.toBeNull());
    act(() => {
      result.current.handleSearchSelect({
        id: 'ai-chat-enabled',
        featureId: 'ai-chat',
        categoryId: 'ai-automation',
        label: 'Enable AI Chat',
        description: 'Turn bot chat responses on or off per guild.',
        keywords: ['ai'],
        isAdvanced: false,
      });
    });
    expect(mockPush).toHaveBeenCalledWith('/dashboard/settings/ai-automation');
  });

  it('handles guild selection, storage updates, and cancelled guild switches', async () => {
    const fetchMock = mockConfigFetch();

    const { result } = await renderConfigContext();

    await waitFor(() => expect(result.current.guildId).toBe('guild-123'));

    act(() => {
      const cancelled = new CustomEvent('volvox-bot:guild-selected', {
        detail: 'blocked-guild',
        cancelable: true,
      });
      cancelled.preventDefault();
      window.dispatchEvent(cancelled);
    });
    expect(result.current.guildId).toBe('guild-123');

    act(() => {
      window.dispatchEvent(new CustomEvent('volvox-bot:guild-selected', { detail: 'guild-456' }));
    });
    await waitFor(() => expect(result.current.guildId).toBe('guild-456'));

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'volvox-bot-selected-guild', newValue: null }),
      );
    });
    await waitFor(() => expect(result.current.guildId).toBe(''));
  });

  it('normalizes role menu option ids and reports fetch failures', async () => {
    const configWithMissingRoleId = {
      ...minimalConfig,
      welcome: {
        ...minimalConfig.welcome,
        roleMenu: { enabled: true, options: [{ label: 'Member', roleId: 'role-1' }] },
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(configResponse(configWithMissingRoleId))
      .mockResolvedValueOnce(configResponse({ error: 'Nope' }, { ok: false, status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = await renderConfigContext();

    await waitFor(() => expect(result.current.draftConfig?.welcome?.roleMenu?.options?.[0]?.id).toBeTruthy());

    await act(async () => {
      await result.current.fetchConfig('broken-guild');
    });

    expect(result.current.error).toBe('Nope');
    expect(toast.error).toHaveBeenCalledWith('Failed to load config', { description: 'Nope' });
  });

  it('tracks validation errors, search filtering, active tabs, and search keyboard shortcuts', async () => {
    mockPathname.mockReturnValue('/dashboard/settings/onboarding-growth');
    mockConfigFetch();

    const { result } = await renderConfigContext();

    await waitFor(() => expect(result.current.activeCategoryId).toBe('onboarding-growth'));
    await waitFor(() => expect(result.current.activeTabId).toBe('welcome'));

    act(() => result.current.handleSearchChange('role menu'));
    expect(result.current.searchResults.map((item) => item.id)).toContain('welcome-role-menu');
    expect(result.current.visibleFeatureIds.has('welcome')).toBe(true);

    act(() => {
      result.current.handleSearchSelect({
        id: 'welcome-role-menu',
        featureId: 'welcome',
        categoryId: 'onboarding-growth',
        label: 'Welcome Role Menu',
        description: 'Configure role menu options.',
        keywords: ['role menu'],
        isAdvanced: true,
      });
    });
    expect(result.current.forceOpenAdvancedFeatureId).toBe('welcome');

    act(() => {
      result.current.updateDraftConfig((prev) => ({
        ...prev,
        welcome: {
          ...prev.welcome,
          roleMenu: { enabled: true, options: [{ id: '1', label: '', roleId: '' }] },
        },
      }));
    });
    expect(result.current.hasValidationErrors).toBe(true);

    act(() => result.current.openDiffModal());
    expect(toast.error).toHaveBeenCalledWith('Cannot save', {
      description: 'Fix validation errors before saving.',
    });

    const input = document.createElement('input');
    input.id = 'config-search';
    document.body.append(input);
    const focusSpy = vi.spyOn(input, 'focus');
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true })));
    expect(focusSpy).toHaveBeenCalled();

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(result.current.searchQuery).toBe('');
  });

  it('opens the diff modal with changes and supports keyboard save shortcuts', async () => {
    mockConfigFetch();

    const { result } = await renderConfigContext();

    await waitFor(() => expect(result.current.draftConfig).not.toBeNull());
    act(() => result.current.openDiffModal());
    expect(toast.info).toHaveBeenCalledWith('No changes to save.');

    act(() => {
      result.current.updateDraftConfig((prev) => ({ ...prev, ai: { ...prev.ai, enabled: true } }));
    });
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true })));
    expect(result.current.showDiffModal).toBe(true);

    act(() => result.current.setShowDiffModal(false));
    const input = document.createElement('input');
    document.body.append(input);
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
    });
    expect(result.current.showDiffModal).toBe(false);
  });

  it('saves patches, refreshes config, reverts sections, and undoes the last save', async () => {
    const savedAgain = { ...minimalConfig, ai: { ...minimalConfig.ai, enabled: true } };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(configResponse(minimalConfig))
      .mockResolvedValueOnce(configResponse({ ok: true }))
      .mockResolvedValueOnce(configResponse(savedAgain));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = await renderConfigContext();

    await waitFor(() => expect(result.current.draftConfig).not.toBeNull());
    act(() => {
      result.current.updateDraftConfig((prev) => ({ ...prev, ai: { ...prev.ai, enabled: true } }));
    });

    await act(async () => {
      await result.current.executeSave();
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/guilds/guild-123/config',
      expect.objectContaining({ method: 'PUT', body: expect.stringContaining('ai.enabled') }),
    );
    expect(toast.success).toHaveBeenCalledWith('Config saved successfully!');
    expect(result.current.prevSavedConfig?.guildId).toBe('guild-123');

    act(() => result.current.undoLastSave());
    expect(result.current.prevSavedConfig).toBeNull();
    expect(toast.info).toHaveBeenCalledWith('Reverted to previous saved state. Save again to apply.');

    act(() => result.current.revertSection('ai'));
    expect(toast.success).toHaveBeenCalledWith('Reverted ai changes.');
  });

  it('surfaces save validation, no-op, unauthorized, and detailed API failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(configResponse(minimalConfig))
      .mockResolvedValueOnce(configResponse({ error: 'Bad config', details: ['bad path'] }, { ok: false, status: 400 }))
      .mockResolvedValueOnce(configResponse({}, { ok: false, status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const originalLocation = window.location;
    // @ts-expect-error jsdom location replacement for redirect assertion
    delete window.location;
    // @ts-expect-error minimal location mock for href assignment
    window.location = { href: '' };

    const { result } = await renderConfigContext();

    await waitFor(() => expect(result.current.draftConfig).not.toBeNull());
    await act(async () => {
      await result.current.executeSave();
    });
    expect(toast.info).toHaveBeenCalledWith('No changes to save.');

    act(() => result.current.updateDraftConfig((prev) => ({ ...prev, ai: { ...prev.ai, enabled: true } })));
    await act(async () => {
      await result.current.executeSave();
    });
    expect(toast.error).toHaveBeenCalledWith('Failed to save config', {
      description: 'Bad config: bad path',
    });

    await act(async () => {
      await result.current.executeSave();
    });
    expect(window.location.href).toBe('/login');

    // @ts-expect-error restore jsdom location
    window.location = originalLocation;
  });

  it('reacts to guild selection and storage events while respecting cancelled switches', async () => {
    const getItemSpy = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementationOnce(() => {
        throw new Error('storage blocked');
      })
      .mockImplementation((key) => (key === 'volvox-bot-selected-guild' ? 'guild-storage' : null));
    const fetchMock = mockConfigFetch();

    const { result } = await renderConfigContext();

    await waitFor(() => expect(result.current.guildId).toBe(''));
    expect(fetchMock).not.toHaveBeenCalled();

    const cancelled = new CustomEvent<string>('volvox-bot:guild-selected', {
      detail: 'guild-cancelled',
      cancelable: true,
    });
    cancelled.preventDefault();
    act(() => window.dispatchEvent(cancelled));
    expect(result.current.guildId).toBe('');

    act(() => {
      window.dispatchEvent(
        new CustomEvent<string>('volvox-bot:guild-selected', { detail: 'guild-event' }),
      );
    });
    await waitFor(() => expect(result.current.guildId).toBe('guild-event'));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/guilds/guild-event/config', expect.any(Object)),
    );

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'volvox-bot-selected-guild',
          newValue: 'guild-from-storage',
        }),
      );
    });
    await waitFor(() => expect(result.current.guildId).toBe('guild-from-storage'));

    getItemSpy.mockRestore();
  });

  it('handles fetch redirects, invalid payloads, API errors, and role menu id backfill', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(configResponse(null, { ok: false, status: 401, json: vi.fn() }))
      .mockResolvedValueOnce(configResponse({ nope: true }))
      .mockResolvedValueOnce(configResponse({ error: 'temporarily unavailable' }, { ok: false, status: 503 }))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            ...minimalConfig,
            welcome: {
              ...minimalConfig.welcome,
              roleMenu: {
                enabled: true,
                options: [{ id: '', label: 'Members', roleId: 'role-1' }],
              },
            },
          }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const originalLocation = window.location;
    // @ts-expect-error jsdom location replacement for redirect assertion
    delete window.location;
    // @ts-expect-error minimal location mock for href assignment
    window.location = { href: '' };

    const { result } = await renderConfigContext();

    await waitFor(() => expect(window.location.href).toBe('/login'));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/guilds/guild-123/config');

    await act(async () => result.current.fetchConfig('guild-invalid'));
    expect(result.current.error).toBe('Invalid config response');

    await act(async () => result.current.fetchConfig('guild-error'));
    expect(result.current.error).toBe('temporarily unavailable');
    expect(toast.error).toHaveBeenCalledWith('Failed to load config', {
      description: 'temporarily unavailable',
    });

    await act(async () => result.current.fetchConfig('guild-ok'));
    await waitFor(() => expect(result.current.draftConfig?.welcome?.roleMenu?.options?.[0]?.id).toBeTruthy());

    // @ts-expect-error restore jsdom location
    window.location = originalLocation;
  });

  it('derives search, active tabs, dirty counts, focus behavior, and category navigation', async () => {
    mockPathname.mockReturnValue('/dashboard/settings/onboarding-growth');
    mockConfigFetch();
    const rafSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const feature = document.createElement('section');
    feature.id = 'feature-welcome';
    feature.scrollIntoView = vi.fn();
    const focusTarget = document.createElement('button');
    feature.append(focusTarget);
    document.body.append(feature);

    const { result } = await renderConfigContext();

    await waitFor(() => expect(result.current.draftConfig).not.toBeNull());
    expect(result.current.activeCategoryId).toBe('onboarding-growth');
    expect(result.current.activeTabId).toBeTruthy();
    expect(result.current.visibleFeatureIds.size).toBeGreaterThan(0);

    act(() => result.current.handleSearchChange('role menu'));
    await waitFor(() => expect(result.current.searchResults.length).toBeGreaterThan(0));
    expect(result.current.visibleFeatureIds.has('welcome')).toBe(true);

    const roleMenuResult = result.current.searchResults.find(
      (item) => item.id === 'welcome-role-menu',
    );
    expect(roleMenuResult).toBeDefined();
    act(() => result.current.handleSearchSelect(roleMenuResult!));

    expect(mockPush).toHaveBeenCalledWith('/dashboard/settings/onboarding-growth');
    expect(result.current.activeTabId).toBe('welcome');
    expect(feature.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(document.activeElement).toBe(focusTarget);

    act(() => result.current.setActiveCategoryId(null));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/settings');

    act(() => result.current.setActiveCategoryId('ai-automation'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/settings/ai-automation');

    act(() => {
      result.current.updateDraftConfig((prev) => ({
        ...prev,
        welcome: { ...prev.welcome, enabled: true },
      }));
    });
    expect(result.current.changedSections).toContain('welcome');
    expect(result.current.dirtyCategoryCounts['onboarding-growth']).toBeGreaterThan(0);
    expect(result.current.changedCategoryCount).toBeGreaterThan(0);

    act(() => result.current.handleSearchChange(''));
    expect(result.current.searchQuery).toBe('');

    feature.remove();
    rafSpy.mockRestore();
    cancelSpy.mockRestore();
  });

  it('opens the diff modal from save actions and blocks invalid or unchanged saves', async () => {
    mockConfigFetch();

    const { result } = await renderConfigContext();

    await waitFor(() => expect(result.current.draftConfig).not.toBeNull());

    act(() => result.current.openDiffModal());
    expect(toast.info).toHaveBeenCalledWith('No changes to save.');

    await act(async () => result.current.executeSave());
    expect(toast.info).toHaveBeenCalledWith('No changes to save.');

    act(() => {
      result.current.updateDraftConfig((prev) => ({
        ...prev,
        welcome: {
          ...prev.welcome,
          roleMenu: { enabled: true, options: [{ id: '1', label: '', roleId: '' }] },
        },
      }));
    });
    expect(result.current.hasValidationErrors).toBe(true);
    act(() => result.current.openDiffModal());
    expect(toast.error).toHaveBeenCalledWith('Cannot save', {
      description: 'Fix validation errors before saving.',
    });
    await act(async () => result.current.executeSave());
    expect(toast.error).toHaveBeenCalledWith('Cannot save', {
      description: 'Fix validation errors before saving.',
    });

    act(() => result.current.discardChanges());
    act(() => {
      result.current.updateDraftConfig((prev) => ({
        ...prev,
        ai: { ...prev.ai, enabled: true },
      }));
    });
    act(() => result.current.openDiffModal());
    expect(result.current.showDiffModal).toBe(true);
    act(() => result.current.setShowDiffModal(false));
    expect(result.current.showDiffModal).toBe(false);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }));
    });
    expect(result.current.showDiffModal).toBe(true);

    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
    });
    expect(result.current.showDiffModal).toBe(true);
    input.remove();
  });

  it('saves, reverts, undoes, clears stale undo state, and reports failed saves', async () => {
    const savedAfterPut = { ...minimalConfig, ai: { ...minimalConfig.ai, enabled: true } };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(configResponse(minimalConfig))
      .mockResolvedValueOnce(configResponse({}))
      .mockResolvedValueOnce(configResponse(savedAfterPut))
      .mockResolvedValueOnce(configResponse({ details: ['bad patch'] }, { ok: false, status: 400 }))
      .mockResolvedValueOnce(configResponse({}, { ok: false, status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const originalLocation = window.location;
    // @ts-expect-error jsdom location replacement for redirect assertion
    delete window.location;
    // @ts-expect-error minimal location mock for href assignment
    window.location = { href: '' };

    const { result } = await renderConfigContext();

    await waitFor(() => expect(result.current.draftConfig).not.toBeNull());
    act(() => {
      result.current.updateDraftConfig((prev) => ({
        ...prev,
        ai: { ...prev.ai, enabled: true },
      }));
    });

    await act(async () => result.current.executeSave());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/guilds/guild-123/config',
      expect.objectContaining({ method: 'PUT', body: expect.any(String) }),
    );
    expect(toast.success).toHaveBeenCalledWith('Config saved successfully!');
    expect(result.current.prevSavedConfig?.guildId).toBe('guild-123');

    act(() => result.current.undoLastSave());
    expect(result.current.prevSavedConfig).toBeNull();
    expect(toast.info).toHaveBeenCalledWith('Reverted to previous saved state. Save again to apply.');

    act(() => result.current.revertSection('ai'));
    expect(toast.success).toHaveBeenCalledWith('Reverted ai changes.');

    act(() => {
      result.current.updateDraftConfig((prev) => ({
        ...prev,
        moderation: { ...prev.moderation, enabled: true },
      }));
    });
    await act(async () => result.current.executeSave());
    expect(toast.error).toHaveBeenCalledWith('Failed to save config', { description: 'HTTP 400: bad patch' });

    await act(async () => result.current.executeSave());
    expect(window.location.href).toBe('/login');

    // @ts-expect-error restore jsdom location
    window.location = originalLocation;
  });

  it('handles keyboard search shortcuts and beforeunload only when changes exist', async () => {
    mockConfigFetch();
    const searchInput = document.createElement('input');
    searchInput.id = 'config-search';
    document.body.append(searchInput);

    const { result } = await renderConfigContext();

    await waitFor(() => expect(result.current.draftConfig).not.toBeNull());

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '/' }));
    });
    expect(document.activeElement).toBe(searchInput);

    act(() => result.current.handleSearchChange('github'));
    expect(result.current.searchQuery).toBe('github');
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(result.current.searchQuery).toBe('');

    act(() => {
      result.current.updateDraftConfig((prev) => ({
        ...prev,
        ai: { ...prev.ai, enabled: true },
      }));
    });
    const beforeUnload = new Event('beforeunload', { cancelable: true });
    act(() => window.dispatchEvent(beforeUnload));
    expect(beforeUnload.defaultPrevented).toBe(true);

    searchInput.remove();
  });

});
