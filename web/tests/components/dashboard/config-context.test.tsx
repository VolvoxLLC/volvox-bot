import { renderHook, waitFor, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

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

describe('ConfigProvider', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    localStorage.setItem('volvox-bot-selected-guild', 'guild-123');
    mockPathname.mockReturnValue('/dashboard/settings');
    mockPush.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('provides config after fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(minimalConfig),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ConfigProvider, useConfigContext } = await import(
      '@/components/dashboard/config-context'
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConfigProvider>{children}</ConfigProvider>
    );
    const { result } = renderHook(() => useConfigContext(), { wrapper });

    await waitFor(() => expect(result.current.draftConfig).not.toBeNull());
    expect(result.current.guildId).toBe('guild-123');
    expect(result.current.hasChanges).toBe(false);
    expect(result.current.saving).toBe(false);
  });

  it('updateDraftConfig marks hasChanges', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(minimalConfig),
      }),
    );

    const { ConfigProvider, useConfigContext } = await import(
      '@/components/dashboard/config-context'
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConfigProvider>{children}</ConfigProvider>
    );
    const { result } = renderHook(() => useConfigContext(), { wrapper });

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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(minimalConfig),
      }),
    );

    const { ConfigProvider, useConfigContext } = await import(
      '@/components/dashboard/config-context'
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConfigProvider>{children}</ConfigProvider>
    );
    const { result } = renderHook(() => useConfigContext(), { wrapper });

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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(minimalConfig),
      }),
    );

    const { ConfigProvider, useConfigContext } = await import(
      '@/components/dashboard/config-context'
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConfigProvider>{children}</ConfigProvider>
    );
    const { result } = renderHook(() => useConfigContext(), { wrapper });

    await waitFor(() => expect(result.current.draftConfig).not.toBeNull());
    expect(result.current.activeCategoryId).toBeNull();
  });

  it('derives activeCategoryId from pathname', async () => {
    mockPathname.mockReturnValue('/dashboard/settings/ai-automation');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(minimalConfig),
      }),
    );

    const { ConfigProvider, useConfigContext } = await import(
      '@/components/dashboard/config-context'
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConfigProvider>{children}</ConfigProvider>
    );
    const { result } = renderHook(() => useConfigContext(), { wrapper });

    await waitFor(() => expect(result.current.draftConfig).not.toBeNull());
    expect(result.current.activeCategoryId).toBe('ai-automation');
  });

  it('returns empty visibleFeatureIds when activeCategoryId is null', async () => {
    mockPathname.mockReturnValue('/dashboard/settings');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(minimalConfig),
      }),
    );

    const { ConfigProvider, useConfigContext } = await import(
      '@/components/dashboard/config-context'
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConfigProvider>{children}</ConfigProvider>
    );
    const { result } = renderHook(() => useConfigContext(), { wrapper });

    await waitFor(() => expect(result.current.draftConfig).not.toBeNull());
    expect(result.current.visibleFeatureIds.size).toBe(0);
  });

  it('handleSearchSelect navigates to the category page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(minimalConfig),
      }),
    );

    const { ConfigProvider, useConfigContext } = await import(
      '@/components/dashboard/config-context'
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConfigProvider>{children}</ConfigProvider>
    );
    const { result } = renderHook(() => useConfigContext(), { wrapper });

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
});
