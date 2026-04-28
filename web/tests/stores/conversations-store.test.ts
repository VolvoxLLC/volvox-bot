import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConversationsStore } from '@/stores/conversations-store';

const conversation = (id: number, preview = 'hello') => ({
  id,
  channelId: `channel-${id}`,
  channelName: `support-${id}`,
  participants: [
    {
      username: 'Bill',
      role: 'user',
      userId: 'user-1',
      avatar: null,
    },
  ],
  messageCount: 3,
  firstMessageAt: '2026-01-01T00:00:00Z',
  lastMessageAt: '2026-01-01T00:05:00Z',
  preview,
});

function mockFetch(data: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response);
}

describe('useConversationsStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useConversationsStore.getState().reset();
  });

  afterEach(() => {
    useConversationsStore.getState().reset();
    vi.restoreAllMocks();
  });

  it('updates filter options without discarding existing values', () => {
    const store = useConversationsStore.getState();

    store.setOpts({ search: 'refund' });
    store.setOpts({ page: 3 });

    expect(useConversationsStore.getState().currentOpts).toEqual({
      search: 'refund',
      channel: '',
      page: 3,
    });
  });

  it('fetches conversations with encoded guild id and active filters', async () => {
    const rows = [conversation(1, 'Need help')];
    const fetchSpy = mockFetch({ conversations: rows, total: 7 });

    const result = await useConversationsStore.getState().fetch('guild / one', {
      search: 'billing issue',
      channel: 'support',
      page: 2,
    });

    expect(result).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/guilds/guild%20%2F%20one/conversations?page=2&limit=25&search=billing+issue&channel=support',
    );
    expect(useConversationsStore.getState()).toMatchObject({
      conversations: rows,
      total: 7,
      currentOpts: { search: 'billing issue', channel: 'support', page: 2 },
      loading: false,
      error: null,
    });
  });

  it('omits optional query params, returns unauthorized, and leaves cached rows intact', async () => {
    useConversationsStore.setState({ conversations: [conversation(9)], total: 1 });
    const fetchSpy = mockFetch({}, 401);

    const result = await useConversationsStore.getState().fetch('guild-1', {
      search: '',
      channel: '',
      page: 1,
    });

    expect(result).toBe('unauthorized');
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/guilds/guild-1/conversations?page=1&limit=25');
    expect(useConversationsStore.getState().conversations).toHaveLength(1);
    expect(useConversationsStore.getState().loading).toBe(false);
  });

  it('stores response and network errors while clearing loading', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({}),
    } as Response);

    await useConversationsStore.getState().fetch('guild-1', { search: '', channel: '', page: 1 });
    expect(useConversationsStore.getState().error).toBe('Failed to fetch conversations (503)');
    expect(useConversationsStore.getState().loading).toBe(false);

    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network down'));

    await useConversationsStore.getState().fetch('guild-1', { search: '', channel: '', page: 1 });
    expect(useConversationsStore.getState().error).toBe('network down');
  });

  it('refreshes using the latest options and reset restores defaults', async () => {
    useConversationsStore.getState().setOpts({ search: 'renewal', channel: 'sales', page: 4 });
    const fetchSpy = mockFetch({ conversations: [conversation(2)], total: 1 });

    await useConversationsStore.getState().refresh('guild-2');

    expect(fetchSpy.mock.calls[0][0]).toContain('search=renewal');
    expect(fetchSpy.mock.calls[0][0]).toContain('channel=sales');
    expect(fetchSpy.mock.calls[0][0]).toContain('page=4');

    useConversationsStore.getState().reset();
    expect(useConversationsStore.getState()).toMatchObject({
      conversations: [],
      total: 0,
      error: null,
      currentOpts: { search: '', channel: '', page: 1 },
    });
  });
});
