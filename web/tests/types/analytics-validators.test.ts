import { describe, expect, it } from 'vitest';
import { isDashboardAnalyticsPayload } from '@/types/analytics-validators';
import type { DashboardAnalytics } from '@/types/analytics';

const basePayload = {
  guildId: 'guild-1',
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
    aiCostUsd: null,
    activeUsers: 3,
    newMembers: 2,
  },
  realtime: {
    onlineMembers: null,
    activeAiConversations: 0,
  },
  messageVolume: [],
  aiUsage: {
    source: 'unavailable',
    byModel: [],
    tokens: { prompt: null, completion: null },
  },
  channelActivity: [],
  commandUsage: { source: 'unavailable', items: [] },
  comparison: {
    previousRange: {
      from: '2026-01-25T00:00:00.000Z',
      to: '2026-01-31T23:59:59.999Z',
    },
    kpis: {
      totalMessages: 5,
      aiRequests: 0,
      aiCostUsd: null,
      activeUsers: 1,
      newMembers: 0,
    },
  },
  heatmap: [],
  userEngagement: null,
  xpEconomy: null,
} satisfies DashboardAnalytics;

describe('isDashboardAnalyticsPayload', () => {
  it('accepts null AI cost KPI values for current and comparison ranges', () => {
    expect(isDashboardAnalyticsPayload(basePayload)).toBe(true);
  });

  it('rejects unavailable AI cost values that are omitted or non-numeric', () => {
    expect(
      isDashboardAnalyticsPayload({
        ...basePayload,
        kpis: { ...basePayload.kpis, aiCostUsd: undefined },
      }),
    ).toBe(false);

    expect(
      isDashboardAnalyticsPayload({
        ...basePayload,
        comparison: {
          ...basePayload.comparison,
          kpis: { ...basePayload.comparison.kpis, aiCostUsd: 'unavailable' },
        },
      }),
    ).toBe(false);
  });
});
