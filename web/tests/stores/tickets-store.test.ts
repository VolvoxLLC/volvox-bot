import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTicketsStore, type TicketStats, type TicketSummary } from '@/stores/tickets-store';

const ticket = (id: number, status = 'open'): TicketSummary => ({
  id,
  guild_id: 'guild-1',
  user_id: `user-${id}`,
  topic: id % 2 === 0 ? null : 'billing',
  status,
  thread_id: `thread-${id}`,
  channel_id: null,
  closed_by: null,
  close_reason: null,
  created_at: '2026-01-01T00:00:00Z',
  closed_at: null,
});

const stats: TicketStats = {
  openCount: 4,
  avgResolutionSeconds: 120,
  ticketsThisWeek: 9,
};

function mockFetch(data: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response);
}

describe('useTicketsStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useTicketsStore.getState().resetAll();
  });

  afterEach(() => {
    useTicketsStore.getState().resetAll();
    vi.restoreAllMocks();
  });

  it('setters update filters, reset page on status/search changes, and resetAll restores defaults', () => {
    const store = useTicketsStore.getState();

    store.setTickets([ticket(1)]);
    store.setTotal(10);
    store.setStats(stats);
    store.setLoading(true);
    store.setError('bad');
    store.setPage(4);
    store.setStatusFilter('closed');
    store.setSearch('user');
    store.setDebouncedSearch('user');

    expect(useTicketsStore.getState()).toMatchObject({
      tickets: [ticket(1)],
      total: 10,
      stats,
      loading: true,
      error: 'bad',
      page: 1,
      statusFilter: 'closed',
      search: 'user',
      debouncedSearch: 'user',
    });

    store.resetAll();
    expect(useTicketsStore.getState()).toMatchObject({
      tickets: [],
      total: 0,
      stats: null,
      loading: false,
      error: null,
      page: 1,
      statusFilter: '',
      search: '',
      debouncedSearch: '',
    });
  });

  it('fetchStats stores successful stats and forwards abort signals', async () => {
    const controller = new AbortController();
    const fetchSpy = mockFetch(stats);

    const result = await useTicketsStore.getState().fetchStats('guild / tickets', controller.signal);

    expect(result).toBe('ok');
    expect(fetchSpy).toHaveBeenCalledWith('/api/guilds/guild%20%2F%20tickets/tickets/stats', {
      signal: controller.signal,
    });
    expect(useTicketsStore.getState().stats).toEqual(stats);
  });

  it('fetchStats returns error for non-ok responses and thrown failures', async () => {
    mockFetch({}, 500);
    await expect(useTicketsStore.getState().fetchStats('guild-1')).resolves.toBe('error');
    expect(useTicketsStore.getState().stats).toBeNull();

    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'));
    await expect(useTicketsStore.getState().fetchStats('guild-1')).resolves.toBe('error');
  });

  it('fetchTickets builds filtered pagination queries and stores ticket data', async () => {
    const rows = [ticket(1), ticket(2, 'closed')];
    const fetchSpy = mockFetch({ tickets: rows, total: 2, page: 2, limit: 25 });

    const result = await useTicketsStore.getState().fetchTickets({
      guildId: 'guild & one',
      status: 'closed',
      user: 'user 1',
      page: 2,
    });

    expect(result).toBe('ok');
    expect(fetchSpy.mock.calls[0][0]).toBe(
      '/api/guilds/guild%20%26%20one/tickets?page=2&limit=25&status=closed&user=user+1',
    );
    expect(useTicketsStore.getState()).toMatchObject({
      tickets: rows,
      total: 2,
      loading: false,
      error: null,
    });
  });

  it('omits empty filters, returns unauthorized, and forwards abort signals', async () => {
    const controller = new AbortController();
    const fetchSpy = mockFetch({}, 401);

    const result = await useTicketsStore.getState().fetchTickets({
      guildId: 'guild-1',
      status: '',
      user: '',
      page: 1,
      signal: controller.signal,
    });

    expect(result).toBe('unauthorized');
    expect(fetchSpy).toHaveBeenCalledWith('/api/guilds/guild-1/tickets?page=1&limit=25', {
      signal: controller.signal,
    });
    expect(useTicketsStore.getState().loading).toBe(false);
  });

  it('sets errors for failed ticket responses, network failures, and aborts cleanly', async () => {
    mockFetch({}, 502);

    await expect(
      useTicketsStore.getState().fetchTickets({
        guildId: 'guild-1',
        status: '',
        user: '',
        page: 1,
      }),
    ).resolves.toBe('error');
    expect(useTicketsStore.getState().error).toBe('Failed to fetch tickets (502)');

    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network down'));
    await expect(
      useTicketsStore.getState().fetchTickets({
        guildId: 'guild-1',
        status: '',
        user: '',
        page: 1,
      }),
    ).resolves.toBe('error');
    expect(useTicketsStore.getState().error).toBe('network down');

    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));
    await expect(
      useTicketsStore.getState().fetchTickets({
        guildId: 'guild-1',
        status: '',
        user: '',
        page: 1,
      }),
    ).resolves.toBe('ok');
    expect(useTicketsStore.getState().loading).toBe(false);
  });

  it('refresh fetches stats and tickets from current filter state', async () => {
    useTicketsStore.getState().setStatusFilter('open');
    useTicketsStore.getState().setDebouncedSearch('user-7');
    useTicketsStore.getState().setPage(3);

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => stats } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ tickets: [ticket(7)], total: 1, page: 3, limit: 25 }),
      } as Response);

    await expect(useTicketsStore.getState().refresh('guild-1')).resolves.toBe('ok');

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/guilds/guild-1/tickets/stats');
    expect(fetchSpy.mock.calls[1][0]).toBe(
      '/api/guilds/guild-1/tickets?page=3&limit=25&status=open&user=user-7',
    );
  });

  it('refresh reports unauthorized from ticket fetch even when stats fail', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) } as Response);

    await expect(useTicketsStore.getState().refresh('guild-1')).resolves.toBe('unauthorized');
  });

  it('ignores stale ticket responses after resetAll', async () => {
    let resolveFirst!: (value: Response | PromiseLike<Response>) => void;
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }) as Promise<Response>,
    );

    const pending = useTicketsStore.getState().fetchTickets({
      guildId: 'guild-1',
      status: '',
      user: '',
      page: 1,
    });

    useTicketsStore.getState().resetAll();
    resolveFirst({
      ok: true,
      status: 200,
      json: async () => ({ tickets: [ticket(99)], total: 1, page: 1, limit: 25 }),
    } as Response);

    await expect(pending).resolves.toBe('ok');
    expect(useTicketsStore.getState().tickets).toEqual([]);
  });
});
