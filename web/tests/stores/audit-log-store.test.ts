import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuditLogStore } from '@/stores/audit-log-store';

const defaultFilters = {
  action: '',
  userId: '',
  startDate: '',
  endDate: '',
  offset: 0,
};

const entry = (id: number, action: string) => ({
  id,
  guild_id: 'g',
  user_id: 'u',
  action,
  target_type: null as string | null,
  target_id: null as string | null,
  details: null as Record<string, unknown> | null,
  ip_address: null as string | null,
  created_at: '',
});

describe('useAuditLogStore', () => {
  beforeEach(() => {
    useAuditLogStore.getState().reset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    useAuditLogStore.getState().reset();
    vi.restoreAllMocks();
  });

  it('supersedes an in-flight fetch: aborted request does not overwrite newer results', async () => {
    const secondEntries = [entry(2, 'fast')];

    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce((_input, init) => {
        const signal = init && typeof init === 'object' && 'signal' in init ? init.signal : undefined;
        return new Promise<Response>((resolve, reject) => {
          const t = setTimeout(() => {
            if (signal?.aborted) {
              reject(new DOMException('Aborted', 'AbortError'));
              return;
            }
            resolve({
              ok: true,
              status: 200,
              json: async () => ({ entries: [entry(1, 'slow')], total: 1 }),
            } as Response);
          }, 40);
          signal?.addEventListener('abort', () => {
            clearTimeout(t);
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ entries: secondEntries, total: 2 }),
      } as Response);

    const pSlow = useAuditLogStore.getState().fetch('guild-1', {
      ...defaultFilters,
      action: 'slow',
    });

    const pFast = useAuditLogStore.getState().fetch('guild-1', {
      ...defaultFilters,
      action: 'fast',
    });

    await pFast;

    expect(useAuditLogStore.getState().entries).toEqual(secondEntries);
    expect(useAuditLogStore.getState().total).toBe(2);

    await expect(pSlow).resolves.toBeUndefined();
    expect(useAuditLogStore.getState().entries).toEqual(secondEntries);
    expect(useAuditLogStore.getState().total).toBe(2);
  });

  it('passes AbortSignal to fetch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ entries: [], total: 0 }),
    } as Response);

    await useAuditLogStore.getState().fetch('guild-1', defaultFilters);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/guilds/guild-1/audit-log'),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('returns unauthorized without mutating entries when still current', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as Response);

    useAuditLogStore.setState({
      entries: [entry(1, 'x')],
      total: 5,
    });

    const res = await useAuditLogStore.getState().fetch('guild-1', defaultFilters);
    expect(res).toBe('unauthorized');
    expect(useAuditLogStore.getState().entries).toHaveLength(1);
    expect(useAuditLogStore.getState().total).toBe(5);
  });

  it('builds filter query params and refreshes with the stored filters', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ entries: [entry(3, 'ban')], total: 1 }),
    } as Response);

    useAuditLogStore.getState().setFilters({
      action: 'ban',
      userId: 'user-1',
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      offset: 50,
    });

    await useAuditLogStore.getState().refresh('guild/1');

    const requestUrl = String(fetchSpy.mock.calls[0]?.[0]);
    expect(requestUrl).toContain('/api/guilds/guild%2F1/audit-log?');
    expect(requestUrl).toContain('limit=25');
    expect(requestUrl).toContain('offset=50');
    expect(requestUrl).toContain('action=ban');
    expect(requestUrl).toContain('userId=user-1');
    expect(requestUrl).toContain('startDate=2026-04-01');
    expect(requestUrl).toContain('endDate=2026-04-30');
    expect(useAuditLogStore.getState().entries).toEqual([entry(3, 'ban')]);
  });

  it('surfaces fetch failures and unknown thrown values', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) } as Response)
      .mockRejectedValueOnce('bad network');

    await useAuditLogStore.getState().fetch('guild-1', defaultFilters);
    expect(useAuditLogStore.getState().error).toBe('Failed to fetch audit log (503)');
    expect(useAuditLogStore.getState().loading).toBe(false);

    await useAuditLogStore.getState().fetch('guild-1', defaultFilters);
    expect(useAuditLogStore.getState().error).toBe('Failed to fetch audit log');
  });

  it('aborts in-flight requests when requested and when resetting', async () => {
    const abortListeners: Array<() => void> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      const signal = init && typeof init === 'object' && 'signal' in init ? init.signal : undefined;
      signal?.addEventListener('abort', () => {
        abortListeners.forEach((listener) => listener());
      });
      return new Promise<Response>((_resolve, reject) => {
        abortListeners.push(() => reject(new DOMException('Aborted', 'AbortError')));
      });
    });

    const pending = useAuditLogStore.getState().fetch('guild-1', defaultFilters);
    useAuditLogStore.getState().abortInFlight();
    await expect(pending).resolves.toBeUndefined();

    useAuditLogStore.setState({ entries: [entry(4, 'kick')], total: 4, error: 'oops' });
    useAuditLogStore.getState().reset();

    expect(useAuditLogStore.getState()).toMatchObject({
      entries: [],
      total: 0,
      error: null,
      filters: defaultFilters,
    });
  });
});
