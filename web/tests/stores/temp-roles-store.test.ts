import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTempRolesStore } from '@/stores/temp-roles-store';

const tempRole = {
  id: 1,
  guild_id: 'guild-1',
  user_id: 'user-1',
  user_tag: 'user#0001',
  role_id: 'role-1',
  role_name: 'Muted',
  moderator_id: 'mod-1',
  moderator_tag: 'mod#0001',
  reason: 'cooldown',
  duration: '1h',
  expires_at: '2026-01-01T01:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
};

const responseBody = {
  data: [tempRole],
  pagination: {
    page: 2,
    limit: 25,
    total: 1,
    pages: 1,
  },
};

function mockFetch(data: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response);
}

describe('useTempRolesStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useTempRolesStore.getState().reset();
  });

  afterEach(() => {
    useTempRolesStore.getState().reset();
    vi.restoreAllMocks();
  });

  it('setPage updates pagination state and refresh uses the selected page', async () => {
    useTempRolesStore.getState().setPage(3);
    const fetchSpy = mockFetch(responseBody);

    await useTempRolesStore.getState().refresh('guild-1');

    expect(fetchSpy).toHaveBeenCalledWith('/api/temp-roles?guildId=guild-1&page=3&limit=25', {
      cache: 'no-store',
    });
    expect(useTempRolesStore.getState().page).toBe(3);
  });

  it('fetches temporary roles with encoded guild id, stores data, and clears errors', async () => {
    useTempRolesStore.setState({ error: 'old error' });
    const fetchSpy = mockFetch(responseBody);

    const result = await useTempRolesStore.getState().fetch('guild & one', 2);

    expect(result).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledWith('/api/temp-roles?guildId=guild+%26+one&page=2&limit=25', {
      cache: 'no-store',
    });
    expect(useTempRolesStore.getState().data).toEqual(responseBody);
    expect(useTempRolesStore.getState().loading).toBe(false);
    expect(useTempRolesStore.getState().error).toBeNull();
  });

  it('returns unauthorized without replacing existing data', async () => {
    useTempRolesStore.setState({ data: responseBody });
    mockFetch({}, 401);

    const result = await useTempRolesStore.getState().fetch('guild-1', 1);

    expect(result).toBe('unauthorized');
    expect(useTempRolesStore.getState().data).toEqual(responseBody);
    expect(useTempRolesStore.getState().loading).toBe(false);
  });

  it('uses API error messages and falls back when error bodies are invalid', async () => {
    mockFetch({ error: 'No permission' }, 403);

    await useTempRolesStore.getState().fetch('guild-1', 1);
    expect(useTempRolesStore.getState().error).toBe('No permission');

    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('invalid json');
      },
    } as unknown as Response);

    await useTempRolesStore.getState().fetch('guild-1', 1);
    expect(useTempRolesStore.getState().error).toBe('Failed to load temp roles');
  });

  it('handles thrown fetch failures and reset clears runtime state', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'));

    await useTempRolesStore.getState().fetch('guild-1', 1);
    expect(useTempRolesStore.getState().error).toBe('Failed to load temp roles');
    expect(useTempRolesStore.getState().loading).toBe(false);

    useTempRolesStore.setState({ data: responseBody, page: 5, error: 'still broken' });
    useTempRolesStore.getState().reset();

    expect(useTempRolesStore.getState()).toMatchObject({ data: null, page: 1, error: null });
  });
});
