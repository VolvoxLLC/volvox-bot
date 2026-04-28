import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardAnalytics } from '@/types/analytics';

const mockUseGuildSelection = vi.fn();
const mockSelectedGuildId = vi.fn<() => string | null>(() => 'guild/one');
const mockExportAnalyticsPdf = vi.fn();

vi.mock('@/hooks/use-guild-selection', () => ({
  useGuildSelection: (options?: { onGuildChange?: () => void }) => {
    mockUseGuildSelection(options);
    return mockSelectedGuildId();
  },
}));

vi.mock('@/lib/analytics-pdf', () => ({
  exportAnalyticsPdf: (...args: unknown[]) => mockExportAnalyticsPdf(...args),
}));

import { AnalyticsProvider, useAnalytics } from '@/contexts/analytics-context';

const analyticsPayload: DashboardAnalytics = {
  guildId: 'guild/one',
  range: {
    type: 'week',
    from: '2026-04-01T00:00:00.000Z',
    to: '2026-04-07T23:59:59.999Z',
    interval: 'day',
    channelId: null,
  },
  kpis: {
    totalMessages: 120,
    aiRequests: 50,
    aiCostUsd: 1.5,
    activeUsers: 20,
    newMembers: 10,
  },
  realtime: {
    onlineMembers: 8,
    activeAiConversations: 2,
  },
  messageVolume: [{ bucket: '2026-04-01T00:00:00.000Z', label: 'Apr 1', messages: 120, aiRequests: 50 }],
  aiUsage: {
    byModel: [{ model: 'gpt-test', requests: 50, promptTokens: 1000, completionTokens: 500, costUsd: 1.5 }],
    tokens: { prompt: 1000, completion: 500 },
  },
  channelActivity: [{ channelId: 'chan-1', name: 'general, "ops"', messages: 99 }],
  topChannels: [{ channelId: 'chan-1', name: 'general, "ops"', messages: 99 }],
  commandUsage: { source: 'events', items: [{ command: 'help', uses: 5 }] },
  comparison: {
    previousRange: { from: '2026-03-25T00:00:00.000Z', to: '2026-03-31T23:59:59.999Z' },
    kpis: {
      totalMessages: 100,
      aiRequests: 0,
      aiCostUsd: 1,
      activeUsers: 10,
      newMembers: 0,
    },
  },
  heatmap: [{ dayOfWeek: 1, hour: 9, messages: 4 }],
  userEngagement: null,
  xpEconomy: null,
};

function Consumer() {
  const analytics = useAnalytics();
  return (
    <div>
      <div data-testid="status">
        {analytics.loading ? 'loading' : 'idle'}:{analytics.error ?? 'ok'}:{analytics.analytics?.guildId ?? 'none'}
      </div>
      <div data-testid="range">{analytics.rangePreset}</div>
      <button type="button" onClick={() => analytics.setRangePreset('today')}>Today</button>
      <button type="button" onClick={() => analytics.setCustomRange('2026-04-10', '2026-04-12')}>Custom</button>
      <button type="button" onClick={() => analytics.setChannelFilter('channel 1')}>Channel</button>
      <button type="button" onClick={() => analytics.setCompareMode(true)}>Compare</button>
      <button type="button" onClick={() => analytics.refresh()}>Refresh</button>
      <button type="button" onClick={() => analytics.refresh(true)}>Background Refresh</button>
      <button type="button" onClick={() => analytics.exportCsv()}>CSV</button>
      <button type="button" onClick={() => analytics.exportPdf()}>PDF</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <AnalyticsProvider>
      <Consumer />
    </AnalyticsProvider>,
  );
}

async function waitForLoaded(fetchSpy: ReturnType<typeof vi.spyOn>) {
  await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('idle:ok:guild/one'));
}

describe('AnalyticsProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockUseGuildSelection.mockClear();
    mockSelectedGuildId.mockReturnValue('guild/one');
    mockExportAnalyticsPdf.mockClear();
  });

  it('fetches analytics with encoded guild and range query parameters', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => analyticsPayload,
    } as Response);

    renderProvider();
    await waitForLoaded(fetchSpy);

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/guilds/guild%2Fone/analytics?'),
      expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }),
    );
    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]), 'http://localhost');
    expect(requestUrl.searchParams.get('range')).toBe('week');
    expect(requestUrl.searchParams.get('interval')).toBe('day');
  });

  it('rebuilds the query for custom dates, channel filters, and compare mode', async () => {
    const originalTimezone = process.env.TZ;
    process.env.TZ = 'UTC';
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => analyticsPayload,
    } as Response);
    const user = userEvent.setup();

    try {
      renderProvider();
      await waitForLoaded(fetchSpy);

      await user.click(screen.getByRole('button', { name: 'Custom' }));
      await user.click(screen.getByRole('button', { name: 'Channel' }));
      await user.click(screen.getByRole('button', { name: 'Compare' }));

      await waitFor(() => {
        expect(
          fetchSpy.mock.calls.some(([url]) => {
            const parsed = new URL(String(url), 'http://localhost');
            return (
              parsed.searchParams.get('range') === 'custom' &&
              parsed.searchParams.get('from') === '2026-04-10T00:00:00.000Z' &&
              parsed.searchParams.get('to') === '2026-04-12T23:59:59.999Z' &&
              parsed.searchParams.get('channelId') === 'channel 1' &&
              parsed.searchParams.get('compare') === '1' &&
              !parsed.searchParams.has('interval')
            );
          }),
        ).toBe(true);
      });
    } finally {
      if (originalTimezone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTimezone;
      }
    }
  });

  it('redirects to login on unauthorized responses before reading payloads', async () => {
    const originalLocation = window.location;
    // @ts-expect-error jsdom location replacement for redirect assertion
    delete window.location;
    // @ts-expect-error minimal location mock for href assignment
    window.location = { href: '' };

    try {
      const unauthorizedJsonSpy = vi.fn().mockResolvedValue({ error: 'Unauthorized' });
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 401,
        json: unauthorizedJsonSpy,
      } as unknown as Response);

      renderProvider();
      expect(unauthorizedJsonSpy).not.toHaveBeenCalled();

      await waitFor(() => expect(window.location.href).toBe('/login'));
      expect(unauthorizedJsonSpy).not.toHaveBeenCalled();
    } finally {
      // @ts-expect-error restore jsdom location
      window.location = originalLocation;
    }
  });

  it('rejects invalid analytics payloads with an error state', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ...analyticsPayload, kpis: { totalMessages: 'bad' } }),
    } as Response);

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('idle:Invalid analytics payload from server:none');
    });
  });

  it('exports CSV with escaped cells and comparison delta math', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => analyticsPayload,
    } as Response);
    const createObjectURLSpy = vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:analytics');
    const revokeObjectURLSpy = vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName.toLowerCase() === 'a') {
        Object.defineProperty(element, 'click', { value: clickSpy, configurable: true });
      }
      return element;
    });

    const user = userEvent.setup();
    renderProvider();
    await waitForLoaded(fetchSpy);

    await user.click(screen.getByRole('button', { name: 'Compare' }));
    await waitFor(() => expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('compare=1'))).toBe(true));
    await user.click(screen.getByRole('button', { name: 'CSV' }));

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    const blob = createObjectURLSpy.mock.calls[0]?.[0] as Blob;
    await expect(blob.text()).resolves.toContain('Total messages,120,100,20');
    await expect(blob.text()).resolves.toContain('AI requests,50,0,');
    await expect(blob.text()).resolves.toContain('chan-1,"general, ""ops""",99');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:analytics');
  });

  it('dispatches PDF export with the loaded analytics payload', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => analyticsPayload,
    } as Response);

    const user = userEvent.setup();
    renderProvider();
    await waitForLoaded(fetchSpy);

    await user.click(screen.getByRole('button', { name: 'PDF' }));

    expect(mockExportAnalyticsPdf).toHaveBeenCalledWith(analyticsPayload);
  });


  it('skips network and export work when no guild or analytics payload exists', async () => {
    mockSelectedGuildId.mockReturnValue(null);
    const fetchSpy = vi.spyOn(global, 'fetch');
    const user = userEvent.setup();

    renderProvider();

    expect(screen.getByTestId('status')).toHaveTextContent('idle:ok:none');
    expect(fetchSpy).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'CSV' }));
    await user.click(screen.getByRole('button', { name: 'PDF' }));

    expect(mockExportAnalyticsPdf).not.toHaveBeenCalled();
  });

  it('surfaces API errors and preserves idle loading during background refreshes', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Analytics unavailable' }),
      } as Response)
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => analyticsPayload,
      } as Response);
    const user = userEvent.setup();

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('idle:Analytics unavailable:none');
    });

    await user.click(screen.getByRole('button', { name: 'Background Refresh' }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('status')).toHaveTextContent('idle:ok:guild/one');
  });

  it('exports CSV without comparison rows and falls back from missing top channels and commands', async () => {
    const payloadWithoutOptionalLists = {
      ...analyticsPayload,
      topChannels: undefined,
      commandUsage: undefined,
      comparison: null,
      kpis: { ...analyticsPayload.kpis, aiRequests: 0 },
      channelActivity: [{ channelId: 'chan-2', name: 'fallback', messages: 7 }],
    } as unknown as DashboardAnalytics;
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payloadWithoutOptionalLists,
    } as Response);
    const createObjectURLSpy = vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:no-compare');
    vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName.toLowerCase() === 'a') {
        Object.defineProperty(element, 'click', { value: vi.fn(), configurable: true });
      }
      return element;
    });

    const user = userEvent.setup();
    renderProvider();
    await waitForLoaded(fetchSpy);

    await user.click(screen.getByRole('button', { name: 'CSV' }));

    const blob = createObjectURLSpy.mock.calls[0]?.[0] as Blob;
    await expect(blob.text()).resolves.toContain('# Compare mode,disabled');
    await expect(blob.text()).resolves.toContain('AI requests,0,,');
    await expect(blob.text()).resolves.toContain('chan-2,fallback,7');
    await expect(blob.text()).resolves.toContain('# Source,unavailable');
  });

  it('throws when the hook is used outside the provider', () => {
    function BrokenConsumer() {
      useAnalytics();
      return null;
    }

    expect(() => render(<BrokenConsumer />)).toThrow('useAnalytics must be used within an AnalyticsProvider');
  });
});
