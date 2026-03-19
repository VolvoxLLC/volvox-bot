import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMembersStore } from '@/stores/members-store';
import type { MemberRow } from '@/components/dashboard/member-table';

const fakeMember = (overrides: Partial<MemberRow> = {}): MemberRow => ({
  id: '1',
  username: 'testuser',
  displayName: 'Test User',
  avatar: null,
  messages_sent: 10,
  xp: 100,
  level: 2,
  warning_count: 0,
  last_active: '2026-01-01T00:00:00Z',
  joinedAt: '2025-01-01T00:00:00Z',
  ...overrides,
});

function mockFetchSuccess(data: unknown, status = 200) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  } as Response);
}

function mockFetchError(message: string) {
  vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error(message));
}

describe('useMembersStore', () => {
  beforeEach(() => {
    useMembersStore.getState().resetAll();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Synchronous Actions ─────────────────────────────────────────

  it('initializes with default state', () => {
    const state = useMembersStore.getState();
    expect(state.members).toEqual([]);
    expect(state.nextAfter).toBeNull();
    expect(state.total).toBe(0);
    expect(state.filteredTotal).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.search).toBe('');
    expect(state.debouncedSearch).toBe('');
    expect(state.sortColumn).toBe('xp');
    expect(state.sortOrder).toBe('desc');
  });

  it('setMembers replaces the members array', () => {
    const members = [fakeMember({ id: '1' }), fakeMember({ id: '2' })];
    useMembersStore.getState().setMembers(members);
    expect(useMembersStore.getState().members).toEqual(members);
  });

  it('appendMembers adds to existing members', () => {
    useMembersStore.getState().setMembers([fakeMember({ id: '1' })]);
    useMembersStore.getState().appendMembers([fakeMember({ id: '2' })]);
    expect(useMembersStore.getState().members).toHaveLength(2);
  });

  it('setSearch / setDebouncedSearch update independently', () => {
    useMembersStore.getState().setSearch('hello');
    expect(useMembersStore.getState().search).toBe('hello');
    expect(useMembersStore.getState().debouncedSearch).toBe('');

    useMembersStore.getState().setDebouncedSearch('hello');
    expect(useMembersStore.getState().debouncedSearch).toBe('hello');
  });

  it('setSortColumn and setSortOrder update sort state', () => {
    useMembersStore.getState().setSortColumn('messages');
    useMembersStore.getState().setSortOrder('asc');
    expect(useMembersStore.getState().sortColumn).toBe('messages');
    expect(useMembersStore.getState().sortOrder).toBe('asc');
  });

  it('resetPagination clears members and cursor', () => {
    useMembersStore.getState().setMembers([fakeMember()]);
    useMembersStore.getState().setNextAfter('cursor123');
    useMembersStore.getState().resetPagination();
    expect(useMembersStore.getState().members).toEqual([]);
    expect(useMembersStore.getState().nextAfter).toBeNull();
  });

  it('resetAll returns to initial state', () => {
    const store = useMembersStore.getState();
    store.setMembers([fakeMember()]);
    store.setSearch('test');
    store.setError('some error');
    store.setTotal(42);
    store.resetAll();

    const state = useMembersStore.getState();
    expect(state.members).toEqual([]);
    expect(state.search).toBe('');
    expect(state.error).toBeNull();
    expect(state.total).toBe(0);
  });

  // ─── fetchMembers ────────────────────────────────────────────────

  it('fetchMembers sets members on success', async () => {
    const apiResponse = {
      members: [fakeMember({ id: '10' })],
      nextAfter: 'cursor-abc',
      total: 50,
      filteredTotal: 10,
    };
    mockFetchSuccess(apiResponse);

    const result = await useMembersStore.getState().fetchMembers({
      guildId: 'guild1',
      search: '',
      sortColumn: 'xp',
      sortOrder: 'desc',
      after: null,
      append: false,
    });

    expect(result).toBe('ok');
    const state = useMembersStore.getState();
    expect(state.members).toEqual(apiResponse.members);
    expect(state.nextAfter).toBe('cursor-abc');
    expect(state.total).toBe(50);
    expect(state.filteredTotal).toBe(10);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('fetchMembers appends when append=true', async () => {
    useMembersStore.getState().setMembers([fakeMember({ id: '1' })]);
    mockFetchSuccess({
      members: [fakeMember({ id: '2' })],
      nextAfter: null,
      total: 2,
    });

    await useMembersStore.getState().fetchMembers({
      guildId: 'guild1',
      search: '',
      sortColumn: 'xp',
      sortOrder: 'desc',
      after: 'cursor',
      append: true,
    });

    expect(useMembersStore.getState().members).toHaveLength(2);
    expect(useMembersStore.getState().members[1].id).toBe('2');
  });

  it('fetchMembers returns unauthorized on 401', async () => {
    mockFetchSuccess({}, 401);

    const result = await useMembersStore.getState().fetchMembers({
      guildId: 'guild1',
      search: '',
      sortColumn: 'xp',
      sortOrder: 'desc',
      after: null,
      append: false,
    });

    expect(result).toBe('unauthorized');
    expect(useMembersStore.getState().loading).toBe(false);
  });

  it('fetchMembers sets error on non-ok response', async () => {
    mockFetchSuccess({}, 500);

    const result = await useMembersStore.getState().fetchMembers({
      guildId: 'guild1',
      search: '',
      sortColumn: 'xp',
      sortOrder: 'desc',
      after: null,
      append: false,
    });

    expect(result).toBe('error');
    expect(useMembersStore.getState().error).toMatch(/Failed to fetch members/);
    expect(useMembersStore.getState().loading).toBe(false);
  });

  it('fetchMembers sets error on network failure', async () => {
    mockFetchError('Network error');

    const result = await useMembersStore.getState().fetchMembers({
      guildId: 'guild1',
      search: '',
      sortColumn: 'xp',
      sortOrder: 'desc',
      after: null,
      append: false,
    });

    expect(result).toBe('error');
    expect(useMembersStore.getState().error).toBe('Network error');
  });

  it('fetchMembers builds URL with search and sort params', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ members: [], nextAfter: null, total: 0 }),
    } as Response);

    await useMembersStore.getState().fetchMembers({
      guildId: 'guild1',
      search: 'test',
      sortColumn: 'messages',
      sortOrder: 'asc',
      after: 'cursor-x',
      append: false,
    });

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('search=test');
    expect(url).toContain('sort=messages');
    expect(url).toContain('order=asc');
    expect(url).toContain('after=cursor-x');
    expect(url).toContain('limit=50');
  });

  it('fetchMembers handles null filteredTotal', async () => {
    mockFetchSuccess({
      members: [],
      nextAfter: null,
      total: 0,
    });

    await useMembersStore.getState().fetchMembers({
      guildId: 'guild1',
      search: '',
      sortColumn: 'xp',
      sortOrder: 'desc',
      after: null,
      append: false,
    });

    expect(useMembersStore.getState().filteredTotal).toBeNull();
  });

  it('fetchMembers silently handles AbortError', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(abortError);

    const result = await useMembersStore.getState().fetchMembers({
      guildId: 'guild1',
      search: '',
      sortColumn: 'xp',
      sortOrder: 'desc',
      after: null,
      append: false,
    });

    expect(result).toBe('ok');
    expect(useMembersStore.getState().error).toBeNull();
    expect(useMembersStore.getState().loading).toBe(false);
  });

  it('ignores stale errors from superseded requests', async () => {
    let rejectFirst = vi.fn<[reason?: unknown], void>();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    fetchSpy
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectFirst.mockImplementation(reject);
          }) as Promise<Response>,
      )
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ members: [], nextAfter: null, total: 0 }),
      } as Response);

    const firstRequest = useMembersStore.getState().fetchMembers({
      guildId: 'guild1',
      search: '',
      sortColumn: 'xp',
      sortOrder: 'desc',
      after: null,
      append: false,
    });

    const secondResult = await useMembersStore.getState().fetchMembers({
      guildId: 'guild1',
      search: 'fresh',
      sortColumn: 'xp',
      sortOrder: 'desc',
      after: null,
      append: false,
    });

    rejectFirst(new Error('stale request failed'));
    const firstResult = await firstRequest;

    expect(secondResult).toBe('ok');
    expect(firstResult).toBe('ok');
    expect(useMembersStore.getState().error).toBeNull();
  });

  it('resetAll invalidates in-flight requests', async () => {
    let resolveFirst!: (value: Response | PromiseLike<Response>) => void;
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }) as Promise<Response>,
    );

    const pendingRequest = useMembersStore.getState().fetchMembers({
      guildId: 'guild1',
      search: '',
      sortColumn: 'xp',
      sortOrder: 'desc',
      after: null,
      append: false,
    });

    useMembersStore.getState().resetAll();
    resolveFirst({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ members: [fakeMember({ id: 'late' })], nextAfter: null, total: 1 }),
    } as Response);

    const result = await pendingRequest;

    expect(result).toBe('ok');
    expect(useMembersStore.getState().members).toEqual([]);
  });
});
