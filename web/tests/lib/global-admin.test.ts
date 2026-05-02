import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetServerSession, mockGetToken } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockGetToken: vi.fn(),
}));

vi.mock('next-auth', () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock('next-auth/jwt', () => ({
  getToken: mockGetToken,
}));

vi.mock('@/lib/auth', () => ({
  getAuthOptions: () => ({}),
}));

import {
  authorizeRequestGlobalAdmin,
  globalAdminAuthErrorResponse,
  isDashboardGlobalAdmin,
  isRequestGlobalAdmin,
} from '@/lib/global-admin';

function request() {
  return new NextRequest('http://localhost/api/global-admin');
}

describe('global admin helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('BOT_OWNER_IDS', 'owner-1, owner-2');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('authorizes route requests by BOT_OWNER_IDS and fails closed on refresh errors', async () => {
    mockGetToken.mockResolvedValueOnce({ id: 'owner-1' });
    await expect(isRequestGlobalAdmin(request())).resolves.toBe(true);

    mockGetToken.mockResolvedValueOnce({ id: 'owner-1', error: 'RefreshTokenError' });
    await expect(isRequestGlobalAdmin(request())).resolves.toBe(false);

    mockGetToken.mockResolvedValueOnce({ id: 'other-user' });
    await expect(isRequestGlobalAdmin(request())).resolves.toBe(false);
  });

  it('maps global admin route authorization failures to stable response statuses', async () => {
    mockGetToken.mockResolvedValueOnce({ accessToken: 'token', id: 'owner-1' });
    await expect(authorizeRequestGlobalAdmin(request())).resolves.toBeNull();
    expect(mockGetToken).toHaveBeenCalledTimes(1);

    mockGetToken.mockResolvedValueOnce({ accessToken: 'token', id: 'other-user' });
    await expect(authorizeRequestGlobalAdmin(request())).resolves.toMatchObject({ status: 403 });

    expect(globalAdminAuthErrorResponse({ ok: false, reason: 'unauthorized', token: null }).status).toBe(
      401,
    );
    expect(
      globalAdminAuthErrorResponse({
        ok: false,
        reason: 'token-expired',
        token: { error: 'RefreshTokenError' },
      }).status,
    ).toBe(401);
  });

  it('authorizes server components from the session user id and fails closed on errors', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'owner-2' } });
    await expect(isDashboardGlobalAdmin()).resolves.toBe(true);

    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'owner-2' },
      error: 'RefreshTokenError',
    });
    await expect(isDashboardGlobalAdmin()).resolves.toBe(false);

    mockGetServerSession.mockRejectedValueOnce(new Error('auth unavailable'));
    await expect(isDashboardGlobalAdmin()).resolves.toBe(false);
  });
});
