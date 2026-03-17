import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useModerationStore } from '@/stores/moderation-store';
import type { CaseListResponse, ModStats } from '@/components/dashboard/moderation-types';

const fakeStats: ModStats = {
  totalCases: 42,
  last24h: 3,
  last7d: 10,
  byAction: { warn: 5, kick: 2 },
  topTargets: [{ userId: '123', tag: 'user#0001', count: 4 }],
};

const fakeCases: CaseListResponse = {
  cases: [
    {
      id: 1,
      guild_id: 'guild1',
      case_number: 1,
      action: 'warn',
      target_id: '123',
      target_tag: 'user#0001',
      moderator_id: '456',
      moderator_tag: 'mod#0001',
      reason: 'test',
      duration: null,
      expires_at: null,
      log_message_id: null,
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 2,
      guild_id: 'guild1',
      case_number: 2,
      action: 'kick',
      target_id: '789',
      target_tag: 'user#0002',
      moderator_id: '456',
      moderator_tag: 'mod#0001',
      reason: 'spam',
      duration: null,
      expires_at: null,
      log_message_id: null,
      created_at: '2026-01-02T00:00:00Z',
    },
  ],
  total: 2,
  page: 1,
  pages: 1,
};

function mockFetchSuccess(data: unknown, status = 200) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(structuredClone(data)),
  } as Response);
}

function mockFetchError(message: string) {
  vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error(message));
}

describe('useModerationStore', () => {
  beforeEach(() => {
    useModerationStore.getState().resetOnGuildChange();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Synchronous Actions ─────────────────────────────────────────

  it('initializes with default state', () => {
    const state = useModerationStore.getState();
    expect(state.page).toBe(1);
    expect(state.sortDesc).toBe(true);
    expect(state.actionFilter).toBe('all');
    expect(state.userSearch).toBe('');
    expect(state.userHistoryInput).toBe('');
    expect(state.lookupUserId).toBeNull();
    expect(state.userHistoryPage).toBe(1);
    expect(state.casesData).toBeNull();
    expect(state.casesLoading).toBe(false);
    expect(state.casesError).toBeNull();
    expect(state.stats).toBeNull();
    expect(state.statsLoading).toBe(false);
    expect(state.statsError).toBeNull();
    expect(state.userHistoryData).toBeNull();
    expect(state.userHistoryLoading).toBe(false);
    expect(state.userHistoryError).toBeNull();
  });

  it('setPage updates page', () => {
    useModerationStore.getState().setPage(3);
    expect(useModerationStore.getState().page).toBe(3);
  });

  it('toggleSortDesc flips sortDesc and resets casesData', () => {
    useModerationStore.setState({ casesData: { ...fakeCases } });

    useModerationStore.getState().toggleSortDesc();
    expect(useModerationStore.getState().sortDesc).toBe(false);
    // Cases should be reset to null so the component re-fetches
    expect(useModerationStore.getState().casesData).toBeNull();

    useModerationStore.getState().toggleSortDesc();
    expect(useModerationStore.getState().sortDesc).toBe(true);
  });

  it('setActionFilter updates the action filter', () => {
    useModerationStore.getState().setActionFilter('warn');
    expect(useModerationStore.getState().actionFilter).toBe('warn');
  });

  it('setUserSearch updates user search', () => {
    useModerationStore.getState().setUserSearch('123456');
    expect(useModerationStore.getState().userSearch).toBe('123456');
  });

  it('clearFilters resets filters and page', () => {
    useModerationStore.getState().setActionFilter('ban');
    useModerationStore.getState().setUserSearch('abc');
    useModerationStore.getState().setPage(5);
    useModerationStore.getState().clearFilters();

    const state = useModerationStore.getState();
    expect(state.actionFilter).toBe('all');
    expect(state.userSearch).toBe('');
    expect(state.page).toBe(1);
  });

  it('clearUserHistory resets user history state including data', () => {
    useModerationStore.getState().setLookupUserId('123');
    useModerationStore.getState().setUserHistoryInput('123');
    useModerationStore.getState().setUserHistoryPage(3);
    useModerationStore.setState({ userHistoryData: fakeCases, userHistoryError: 'err' });

    useModerationStore.getState().clearUserHistory();

    const state = useModerationStore.getState();
    expect(state.lookupUserId).toBeNull();
    expect(state.userHistoryInput).toBe('');
    expect(state.userHistoryPage).toBe(1);
    expect(state.userHistoryData).toBeNull();
    expect(state.userHistoryError).toBeNull();
  });

  it('resetOnGuildChange resets all state', () => {
    useModerationStore.getState().setPage(5);
    useModerationStore.getState().setActionFilter('ban');
    useModerationStore.setState({ casesData: fakeCases, stats: fakeStats });

    useModerationStore.getState().resetOnGuildChange();

    const state = useModerationStore.getState();
    expect(state.page).toBe(1);
    expect(state.actionFilter).toBe('all');
    expect(state.casesData).toBeNull();
    expect(state.stats).toBeNull();
  });

  // ─── fetchStats ──────────────────────────────────────────────────

  it('fetchStats sets stats on success', async () => {
    mockFetchSuccess(fakeStats);

    const result = await useModerationStore.getState().fetchStats('guild1');

    expect(result).toBe('ok');
    expect(useModerationStore.getState().stats).toEqual(fakeStats);
    expect(useModerationStore.getState().statsLoading).toBe(false);
    expect(useModerationStore.getState().statsError).toBeNull();
  });

  it('fetchStats returns unauthorized on 401', async () => {
    mockFetchSuccess({}, 401);

    const result = await useModerationStore.getState().fetchStats('guild1');

    expect(result).toBe('unauthorized');
    expect(useModerationStore.getState().statsLoading).toBe(false);
  });

  it('fetchStats sets error on failure', async () => {
    mockFetchSuccess({ error: 'Server error' }, 500);

    const result = await useModerationStore.getState().fetchStats('guild1');

    expect(result).toBe('error');
    expect(useModerationStore.getState().statsError).toBe('Server error');
    expect(useModerationStore.getState().statsLoading).toBe(false);
  });

  it('fetchStats sets generic error on network failure', async () => {
    mockFetchError('Network error');

    const result = await useModerationStore.getState().fetchStats('guild1');

    expect(result).toBe('error');
    expect(useModerationStore.getState().statsError).toBe('Network error');
  });

  it('fetchStats silently handles AbortError', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(abortError);

    const result = await useModerationStore.getState().fetchStats('guild1');

    expect(result).toBe('ok');
    expect(useModerationStore.getState().statsError).toBeNull();
    expect(useModerationStore.getState().statsLoading).toBe(false);
  });

  // ─── fetchCases ──────────────────────────────────────────────────

  it('fetchCases sets cases on success', async () => {
    mockFetchSuccess(fakeCases);

    const result = await useModerationStore.getState().fetchCases('guild1');

    expect(result).toBe('ok');
    expect(useModerationStore.getState().casesData).toEqual(fakeCases);
    expect(useModerationStore.getState().casesLoading).toBe(false);
  });

  it('fetchCases sends order=asc when sortDesc is false', async () => {
    useModerationStore.getState().setSortDesc(false);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(structuredClone(fakeCases)),
    } as Response);

    await useModerationStore.getState().fetchCases('guild1');

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('order=asc');
  });

  it('fetchCases returns unauthorized on 401', async () => {
    mockFetchSuccess({}, 401);

    const result = await useModerationStore.getState().fetchCases('guild1');

    expect(result).toBe('unauthorized');
  });

  it('fetchCases builds URL with filters', async () => {
    useModerationStore.getState().setPage(2);
    useModerationStore.getState().setActionFilter('ban');
    useModerationStore.getState().setUserSearch('123');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ cases: [], total: 0, page: 2, pages: 1 }),
    } as Response);

    await useModerationStore.getState().fetchCases('guild1');

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('guildId=guild1');
    expect(url).toContain('page=2');
    expect(url).toContain('action=ban');
    expect(url).toContain('targetId=123');
    expect(url).toContain('limit=25');
  });

  it('fetchCases omits action param when filter is "all"', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ cases: [], total: 0, page: 1, pages: 1 }),
    } as Response);

    await useModerationStore.getState().fetchCases('guild1');

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).not.toContain('action=');
  });

  it('fetchCases sets error on server error with message', async () => {
    mockFetchSuccess({ error: 'Custom error message' }, 500);

    const result = await useModerationStore.getState().fetchCases('guild1');

    expect(result).toBe('error');
    expect(useModerationStore.getState().casesError).toBe('Custom error message');
  });

  // ─── fetchUserHistory ────────────────────────────────────────────

  it('fetchUserHistory sets data on success', async () => {
    mockFetchSuccess(fakeCases);

    const result = await useModerationStore.getState().fetchUserHistory('guild1', 'user123', 1);

    expect(result).toBe('ok');
    expect(useModerationStore.getState().userHistoryData).toEqual(fakeCases);
    expect(useModerationStore.getState().userHistoryLoading).toBe(false);
  });

  it('fetchUserHistory returns unauthorized on 401', async () => {
    mockFetchSuccess({}, 401);

    const result = await useModerationStore.getState().fetchUserHistory('guild1', 'user123', 1);

    expect(result).toBe('unauthorized');
  });

  it('fetchUserHistory sets error on failure', async () => {
    mockFetchError('Connection refused');

    const result = await useModerationStore.getState().fetchUserHistory('guild1', 'user123', 1);

    expect(result).toBe('error');
    expect(useModerationStore.getState().userHistoryError).toBe('Connection refused');
  });

  it('fetchUserHistory builds correct URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ cases: [], total: 0, page: 1, pages: 1 }),
    } as Response);

    await useModerationStore.getState().fetchUserHistory('guild1', 'user456', 3);

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('/api/moderation/user/user456/history');
    expect(url).toContain('guildId=guild1');
    expect(url).toContain('page=3');
    expect(url).toContain('limit=25');
  });

  it('fetchUserHistory silently handles AbortError', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(abortError);

    const result = await useModerationStore.getState().fetchUserHistory('guild1', 'user123', 1);

    expect(result).toBe('ok');
    expect(useModerationStore.getState().userHistoryError).toBeNull();
    expect(useModerationStore.getState().userHistoryLoading).toBe(false);
  });
});
