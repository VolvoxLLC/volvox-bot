import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHealthStore } from '@/stores/health-store';
import type { BotHealth } from '@/components/dashboard/types';

const healthyPayload: BotHealth = {
  uptime: 1234,
  memory: {
    heapUsed: 10,
    heapTotal: 20,
    rss: 30,
  },
  discord: {
    ping: 42,
    guilds: 3,
  },
  errors: {
    lastHour: 0,
    lastDay: 1,
  },
  system: {
    cpuUsage: {
      user: 100,
      system: 50,
    },
    nodeVersion: 'v22.0.0',
  },
  restarts: [
    {
      timestamp: '2026-01-01T00:00:00Z',
      reason: 'deploy',
      version: '1.2.3',
      uptimeBefore: 99,
    },
  ],
};

function resetHealthStore() {
  useHealthStore.setState({ health: null, loading: false, error: null, lastUpdatedAt: null });
}

function mockFetch(data: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response);
}

describe('useHealthStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetHealthStore();
  });

  afterEach(() => {
    resetHealthStore();
    vi.restoreAllMocks();
  });

  it('setters update health, loading, and error state', () => {
    const store = useHealthStore.getState();

    store.setLoading(true);
    store.setError('boom');
    store.setHealth(healthyPayload);

    const state = useHealthStore.getState();
    expect(state.loading).toBe(true);
    expect(state.error).toBe('boom');
    expect(state.health).toEqual(healthyPayload);
    expect(state.lastUpdatedAt).toBeInstanceOf(Date);
  });

  it('refresh fetches with no-store cache and records validated payloads', async () => {
    const fetchSpy = mockFetch(healthyPayload);

    const result = await useHealthStore.getState().refresh('guild & one');

    expect(result).toBe('success');
    expect(fetchSpy).toHaveBeenCalledWith('/api/bot-health?guildId=guild+%26+one', {
      cache: 'no-store',
    });
    expect(useHealthStore.getState().health).toEqual(healthyPayload);
    expect(useHealthStore.getState().loading).toBe(false);
    expect(useHealthStore.getState().error).toBeNull();
    expect(useHealthStore.getState().lastUpdatedAt).toBeInstanceOf(Date);
  });

  it('returns unauthorized without trying to validate the unauthorized payload', async () => {
    mockFetch({ status: 'unauthorized', uptime: 1 }, 401);

    const result = await useHealthStore.getState().refresh('guild-1');

    expect(result).toBe('unauthorized');
    expect(useHealthStore.getState().loading).toBe(false);
    expect(useHealthStore.getState().error).toBeNull();
    expect(useHealthStore.getState().health).toBeNull();
  });

  it('uses API error payloads for failed responses and handles invalid JSON bodies', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ error: 'bot offline' }),
    } as Response);

    await expect(useHealthStore.getState().refresh('guild-1')).resolves.toBe('error');
    expect(useHealthStore.getState().error).toBe('bot offline');

    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    } as unknown as Response);

    await expect(useHealthStore.getState().refresh('guild-1')).resolves.toBe('error');
    expect(useHealthStore.getState().error).toBe('Failed to fetch health data');
  });

  it('rejects invalid successful payloads and stores network errors', async () => {
    mockFetch({ uptime: 1, memory: null });

    await expect(useHealthStore.getState().refresh('guild-1')).resolves.toBe('error');
    expect(useHealthStore.getState().error).toBe('Invalid health payload: missing memory');

    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('socket hang up'));

    await expect(useHealthStore.getState().refresh('guild-1')).resolves.toBe('error');
    expect(useHealthStore.getState().error).toBe('socket hang up');
    expect(useHealthStore.getState().loading).toBe(false);
  });
});
