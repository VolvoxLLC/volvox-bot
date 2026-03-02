import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportAnalyticsPdf } from '@/lib/analytics-pdf';
import type { DashboardAnalytics } from '@/types/analytics';

function makeAnalytics(overrides: Partial<DashboardAnalytics> = {}): DashboardAnalytics {
  return {
    guildId: 'guild-123',
    range: {
      type: 'week',
      from: '2026-02-22T00:00:00.000Z',
      to: '2026-03-01T00:00:00.000Z',
      interval: 'day',
      channelId: null,
    },
    kpis: {
      totalMessages: 500,
      aiRequests: 100,
      aiCostUsd: 0.25,
      activeUsers: 42,
      newMembers: 7,
    },
    realtime: {
      onlineMembers: 12,
      activeAiConversations: 3,
    },
    messageVolume: [],
    aiUsage: {
      byModel: [
        {
          model: 'claude-sonnet',
          requests: 100,
          promptTokens: 5000,
          completionTokens: 2000,
          costUsd: 0.25,
        },
      ],
      tokens: { prompt: 5000, completion: 2000 },
    },
    channelActivity: [
      { channelId: 'ch1', name: 'general', messages: 300 },
      { channelId: 'ch2', name: 'dev', messages: 200 },
    ],
    heatmap: [],
    commandUsage: {
      source: 'logs',
      items: [
        { command: 'help', uses: 50 },
        { command: 'status', uses: 25 },
      ],
    },
    userEngagement: {
      trackedUsers: 30,
      totalMessagesSent: 400,
      totalReactionsGiven: 80,
      totalReactionsReceived: 65,
      avgMessagesPerUser: 13.3,
    },
    xpEconomy: {
      totalUsers: 20,
      totalXp: 5500,
      avgLevel: 2.8,
      maxLevel: 10,
    },
    ...overrides,
  };
}

describe('exportAnalyticsPdf', () => {
  let mockWin: {
    document: { write: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
    focus: ReturnType<typeof vi.fn>;
    print: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();

    mockWin = {
      document: {
        write: vi.fn(),
        close: vi.fn(),
      },
      focus: vi.fn(),
      print: vi.fn(),
      close: vi.fn(),
    };

    vi.spyOn(window, 'open').mockReturnValue(mockWin as unknown as Window);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('opens a new window and writes an HTML document', () => {
    exportAnalyticsPdf(makeAnalytics());

    expect(window.open).toHaveBeenCalledWith('', '_blank', expect.any(String));
    expect(mockWin.document.write).toHaveBeenCalledOnce();
    expect(mockWin.document.close).toHaveBeenCalledOnce();
    expect(mockWin.focus).toHaveBeenCalledOnce();
  });

  it('HTML output contains the guild ID', () => {
    exportAnalyticsPdf(makeAnalytics());

    const html: string = mockWin.document.write.mock.calls[0]?.[0] ?? '';
    expect(html).toContain('guild-123');
  });

  it('HTML output contains KPI labels', () => {
    exportAnalyticsPdf(makeAnalytics());

    const html: string = mockWin.document.write.mock.calls[0]?.[0] ?? '';
    expect(html).toContain('Total messages');
    expect(html).toContain('AI requests');
    expect(html).toContain('Active users');
    expect(html).toContain('New members');
  });

  it('HTML output includes channel names', () => {
    exportAnalyticsPdf(makeAnalytics());

    const html: string = mockWin.document.write.mock.calls[0]?.[0] ?? '';
    expect(html).toContain('general');
    expect(html).toContain('dev');
  });

  it('HTML output includes command usage entries', () => {
    exportAnalyticsPdf(makeAnalytics());

    const html: string = mockWin.document.write.mock.calls[0]?.[0] ?? '';
    expect(html).toContain('/help');
    expect(html).toContain('/status');
  });

  it('HTML output includes user engagement section when present', () => {
    exportAnalyticsPdf(makeAnalytics());

    const html: string = mockWin.document.write.mock.calls[0]?.[0] ?? '';
    expect(html).toContain('User Engagement');
    expect(html).toContain('Tracked users');
    expect(html).toContain('Avg messages / user');
  });

  it('omits user engagement section when null', () => {
    exportAnalyticsPdf(makeAnalytics({ userEngagement: null }));

    const html: string = mockWin.document.write.mock.calls[0]?.[0] ?? '';
    expect(html).not.toContain('User Engagement');
  });

  it('HTML output includes XP economy section when present', () => {
    exportAnalyticsPdf(makeAnalytics());

    const html: string = mockWin.document.write.mock.calls[0]?.[0] ?? '';
    expect(html).toContain('XP Economy');
    expect(html).toContain('Total XP distributed');
    expect(html).toContain('Average level');
  });

  it('omits XP economy section when null', () => {
    exportAnalyticsPdf(makeAnalytics({ xpEconomy: null }));

    const html: string = mockWin.document.write.mock.calls[0]?.[0] ?? '';
    expect(html).not.toContain('XP Economy');
  });

  it('HTML output includes AI usage section when models present', () => {
    exportAnalyticsPdf(makeAnalytics());

    const html: string = mockWin.document.write.mock.calls[0]?.[0] ?? '';
    expect(html).toContain('AI Usage by Model');
    expect(html).toContain('claude-sonnet');
  });

  it('omits AI usage section when no models', () => {
    exportAnalyticsPdf(
      makeAnalytics({ aiUsage: { byModel: [], tokens: { prompt: 0, completion: 0 } } }),
    );

    const html: string = mockWin.document.write.mock.calls[0]?.[0] ?? '';
    expect(html).not.toContain('AI Usage by Model');
  });

  it('triggers print after 500ms timeout', () => {
    exportAnalyticsPdf(makeAnalytics());

    expect(mockWin.print).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(mockWin.print).toHaveBeenCalledOnce();
    expect(mockWin.close).toHaveBeenCalledOnce();
  });

  it('does nothing when window.open returns null (popup blocked)', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);

    // Should not throw
    expect(() => exportAnalyticsPdf(makeAnalytics())).not.toThrow();
  });

  it('escapes HTML special characters in guild ID', () => {
    exportAnalyticsPdf(makeAnalytics({ guildId: '<script>alert(1)</script>' }));

    const html: string = mockWin.document.write.mock.calls[0]?.[0] ?? '';
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('shows empty state when no channels', () => {
    exportAnalyticsPdf(makeAnalytics({ channelActivity: [], topChannels: [] }));

    const html: string = mockWin.document.write.mock.calls[0]?.[0] ?? '';
    expect(html).toContain('No channel data for this period');
  });

  it('shows empty state when no command usage', () => {
    exportAnalyticsPdf(makeAnalytics({ commandUsage: { source: 'unavailable', items: [] } }));

    const html: string = mockWin.document.write.mock.calls[0]?.[0] ?? '';
    expect(html).toContain('No command usage data for this period');
  });
});
