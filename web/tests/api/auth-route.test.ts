import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { mockGetAuthOptions, mockNextAuth, mockWarn } = vi.hoisted(() => ({
  mockGetAuthOptions: vi.fn(),
  mockNextAuth: vi.fn(),
  mockWarn: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getAuthOptions: mockGetAuthOptions,
}));

vi.mock('next-auth', () => ({
  default: mockNextAuth,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    warn: mockWarn,
  },
}));

import { GET, POST } from '@/app/api/auth/[...nextauth]/route';

function createRequest(pathname: string) {
  return new NextRequest(new URL(`http://localhost:3000${pathname}`));
}

describe('auth route fallback handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a null session when auth env is unavailable for /session', async () => {
    mockGetAuthOptions.mockImplementation(() => {
      throw new Error('missing auth env');
    });

    const response = await GET(createRequest('/api/auth/session'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({});
    expect(mockWarn).toHaveBeenCalledWith(
      '[auth] Auth route requested without valid environment configuration',
      expect.objectContaining({ pathname: '/api/auth/session', error: 'missing auth env' }),
    );
  });

  it('returns an empty provider map when auth env is unavailable for /providers', async () => {
    mockGetAuthOptions.mockImplementation(() => {
      throw new Error('missing auth env');
    });

    const response = await GET(createRequest('/api/auth/providers'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({});
  });

  it('delegates to NextAuth when auth env is valid', async () => {
    const nextAuthResponse = NextResponse.json({ ok: true }, { status: 200 });
    const handler = vi.fn().mockResolvedValue(nextAuthResponse);
    mockGetAuthOptions.mockReturnValue({ providers: [] });
    mockNextAuth.mockReturnValue(handler);

    const request = createRequest('/api/auth/session');
    const response = await GET(request);

    expect(mockNextAuth).toHaveBeenCalledWith({ providers: [] });
    expect(handler).toHaveBeenCalledWith(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('uses the same fallback for POST requests', async () => {
    mockGetAuthOptions.mockImplementation(() => {
      throw new Error('missing auth env');
    });

    const response = await POST(createRequest('/api/auth/callback/discord'));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'AuthUnavailable' });
  });
});
