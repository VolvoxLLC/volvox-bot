import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsProvider, useAnalytics } from '@/contexts/analytics-context';
import { exportAnalyticsPdf } from '@/lib/analytics-pdf';
import { endOfDayIso, startOfDayIso } from '@/lib/analytics-utils';
import type { DashboardAnalytics } from '@/types/analytics';

const { mockUseGuildSelection } = vi.hoisted(() => ({
  mockUseGuildSelection: vi.fn(),
}));

vi.mock('@/hooks/use-guild-selection', () => ({
  useGuildSelection: (options?: { onGuildChange?: () => void }) => mockUseGuildSelection(options),
}));

vi.mock('@/lib/analytics-pdf', () => ({
  exportAnalyticsPdf: vi.fn(),
}));

const analyticsPayload: DashboardAnalytics = {
  guildId: 'guild/1',
  range: {
    type: 'week',
    from: '2026-02-01T00:00:00.000Z',
    to: '2026-02-07T23:59:59.999Z',
    interval: 'day',
    channelId: null,
  },
  kpis: {
    totalMessages: 10,
    aiRequests: 4,
    aiCostUsd: 1.23,
    activeUsers: 3,
    newMembers: 2,
  },
  realtime: {
    onlineMembers: 5,
    activeAiConversations: 1,
  },
  messageVolume: [
    {
      bucket: '2026-02-01T00:00:00.000Z',
      label: 'Feb 1',
      messages: 10,
      aiRequests: 4,
    },
  ],
  aiUsage: {
    byModel: [
      {
        model: 'claude',
        requests: 4,
        promptTokens: 100,
        completionTokens: 50,
        costUsd: 1.23,
      },
    ],
    tokens: { prompt: 100, completion: 50 },
  },
  channelActivity: [{ channelId: 'general,1', name: 'General "Chat"', messages: 10 }],
  topChannels: [{ channelId: 'top-1', name: 'Top, "Channel"', messages: 12 }],
  commandUsage: { source: 'logs', items: [{ command: '/help', uses: 7 }] },
  comparison: {
    previousRange: {
      from: '2026-01-25T00:00:00.000Z',
      to: '2026-01-31T23:59:59.999Z',
    },
    kpis: {
      totalMessages: 5,
      aiRequests: 0,
      aiCostUsd: 1.23,
      activeUsers: 0,
      newMembers: 1,
    },
  },
  heatmap: [{ dayOfWeek: 1, hour: 12, messages: 3 }],
  userEngagement: null,
  xpEconomy: null,
};

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const status = init.status ?? 200;
  return {
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function AnalyticsHarness() {
  const analytics = useAnalytics();

  return (
    <div>
      <output data-testid="loading">{String(analytics.loading)}</output>
      <output data-testid="error">{analytics.error ?? ''}</output>
      <output data-testid="guild">{analytics.analytics?.guildId ?? 'none'}</output>
      <output data-testid="range">{analytics.rangePreset}</output>
      <output data-testid="channel">{analytics.channelFilter ?? 'all'}</output>
      <output data-testid="updated">{analytics.lastUpdatedAt instanceof Date ? 'yes' : 'no'}</output>
      <button type="button" onClick={() => analytics.setRangePreset('today')}>Today</button>
      <button type="button" onClick={() => analytics.setCompareMode(true)}>Compare</button>
      <button type="button" onClick={() => analytics.setChannelFilter('channel-1')}>Channel</button>
      <button type="button" onClick={() => analytics.setCustomRange('2026-02-03', '2026-02-04')}>Custom</button>
      <button type="button" onClick={() => { analytics.refresh(true); }}>Background refresh</button>
      <button type="button" onClick={analytics.exportCsv}>Export CSV</button>
      <button type="button" onClick={analytics.exportPdf}>Export PDF</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <AnalyticsProvider>
      <AnalyticsHarness />
    </AnalyticsProvider>,
  );
}

async function withMockLocation<T>(callback: () => Promise<T> | T): Promise<T> {
  const originalLocation = window.location;
  // @ts-expect-error jsdom location is read-only unless replaced for this test.
  delete window.location;
  // @ts-expect-error only href is needed by the provider.
  window.location = { href: '' };

  try {
    return await callback();
  } finally {
    // @ts-expect-error restore mocked location.
    window.location = originalLocation;
  }
}

describe('AnalyticsProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockUseGuildSelection.mockReset();
    mockUseGuildSelection.mockReturnValue('guild/1');
    vi.mocked(exportAnalyticsPdf).mockClear();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(analyticsPayload));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches analytics, builds query strings, and exports CSV/PDF', async () => {
    const user = userEvent.setup();
    const createObjectURLSpy = vi.spyOn(globalThis.URL, 'createObjectURL').mockReturnValue('blob:csv');
    const revokeObjectURLSpy = vi.spyOn(globalThis.URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const clickSpy = vi.fn();
    const exportedBlobs: Blob[] = [];
    createObjectURLSpy.mockImplementation((blob) => {
      exportedBlobs.push(blob as Blob);
      return 'blob:csv';
    });

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName.toLowerCase() === 'a') {
        Object.defineProperty(element, 'click', { value: clickSpy, configurable: true });
      }
      return element;
    });

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('guild')).toHaveTextContent('guild/1'));
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/guilds/guild%2F1/analytics?range=week&interval=day',
      expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }),
    );
    expect(screen.getByTestId('updated')).toHaveTextContent('yes');

    await user.click(screen.getByRole('button', { name: 'Today' }));
    await waitFor(() => expect(String(vi.mocked(fetch).mock.calls.at(-1)?.[0])).toContain('range=today&interval=hour'));

    await user.click(screen.getByRole('button', { name: 'Compare' }));
    await waitFor(() => expect(String(vi.mocked(fetch).mock.calls.at(-1)?.[0])).toContain('compare=1'));

    await user.click(screen.getByRole('button', { name: 'Channel' }));
    await waitFor(() => expect(String(vi.mocked(fetch).mock.calls.at(-1)?.[0])).toContain('channelId=channel-1'));

    await user.click(screen.getByRole('button', { name: 'Custom' }));
    await waitFor(() => {
      const latestUrl = new URL(String(vi.mocked(fetch).mock.calls.at(-1)?.[0]), 'http://localhost');
      expect(latestUrl.searchParams.get('range')).toBe('custom');
      expect(latestUrl.searchParams.get('from')).toBe(startOfDayIso('2026-02-03'));
      expect(latestUrl.searchParams.get('to')).toBe(endOfDayIso('2026-02-04'));
      expect(latestUrl.searchParams.has('interval')).toBe(false);
    });

    const fetchCallsBeforeBackgroundRefresh = vi.mocked(fetch).mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Background refresh' }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(fetchCallsBeforeBackgroundRefresh));

    await user.click(screen.getByRole('button', { name: 'Export CSV' }));
    const exportedBlob = exportedBlobs.at(-1);
    expect(exportedBlob?.type).toContain('text/csv');
    await expect(exportedBlob?.text()).resolves.toContain('"Top, ""Channel"""');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:csv');

    await user.click(screen.getByRole('button', { name: 'Export PDF' }));
    expect(exportAnalyticsPdf).toHaveBeenCalledWith(analyticsPayload);
  });

  it('handles unauthorized, API, invalid payload, unknown, and abort errors', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ error: 'Unauthorized' }, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ error: 'analytics down' }, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ nope: true }))
      .mockRejectedValueOnce('boom')
      .mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));

    await withMockLocation(async () => {
      renderProvider();

      await waitFor(() => expect(window.location.href).toBe('/login'));

      await act(async () => {
        screen.getByRole('button', { name: 'Background refresh' }).click();
      });
      expect(screen.getByTestId('error')).toHaveTextContent('analytics down');

      await act(async () => {
        screen.getByRole('button', { name: 'Background refresh' }).click();
      });
      expect(screen.getByTestId('error')).toHaveTextContent('Invalid analytics payload from server');

      await act(async () => {
        screen.getByRole('button', { name: 'Background refresh' }).click();
      });
      expect(screen.getByTestId('error')).toHaveTextContent('Unknown error');

      await act(async () => {
        screen.getByRole('button', { name: 'Background refresh' }).click();
      });
      expect(screen.getByTestId('error')).toHaveTextContent('');
    });
  });

  it('throws when the hook is used outside the provider', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(() => render(<AnalyticsHarness />)).toThrow(
        'useAnalytics must be used within an AnalyticsProvider',
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('skips fetching analytics when no guild is selected', () => {
    mockUseGuildSelection.mockReturnValueOnce(undefined);
    renderProvider();
    expect(fetch).not.toHaveBeenCalled();
  });
});
