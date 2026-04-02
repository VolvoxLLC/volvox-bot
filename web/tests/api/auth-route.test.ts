import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

function createRequest(pathname: string) {
  return new NextRequest(new URL(`http://localhost:3000${pathname}`));
}

function createContext(nextauth: string[] = []) {
  return {
    params: Promise.resolve({ nextauth }),
  };
}

async function importRouteModule() {
  const route = await import('@/app/api/auth/[...nextauth]/route');
  return route;
}

describe('auth route fallback handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns a null session when auth env is unavailable for /session', async () => {
    mockGetAuthOptions.mockImplementation(() => {
      throw new Error('missing auth env');
    });

    const { GET } = await importRouteModule();
    const response = await GET(createRequest('/api/auth/session'), createContext(['session']));

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

    const { GET } = await importRouteModule();
    const response = await GET(
      createRequest('/api/auth/providers'),
      createContext(['providers']),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({});
  });

  it('returns an empty csrf token when auth env is unavailable for /csrf', async () => {
    mockGetAuthOptions.mockImplementation(() => {
      throw new Error('missing auth env');
    });

    const { GET } = await importRouteModule();
    const response = await GET(createRequest('/api/auth/csrf'), createContext(['csrf']));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ csrfToken: '' });
  });

  it('delegates to NextAuth when auth env is valid', async () => {
    const nextAuthResponse = NextResponse.json({ ok: true }, { status: 200 });
    const handler = vi.fn().mockResolvedValue(nextAuthResponse);
    mockGetAuthOptions.mockReturnValue({ providers: [] });
    mockNextAuth.mockReturnValue(handler);

    const { GET } = await importRouteModule();
    const request = createRequest('/api/auth/session');
    const context = createContext(['session']);
    const response = await GET(request, context);

    expect(mockNextAuth).toHaveBeenCalledWith({ providers: [] });
    expect(handler).toHaveBeenCalledWith(request, context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('reuses the cached NextAuth handler after the first successful request', async () => {
    const nextAuthResponse = NextResponse.json({ ok: true }, { status: 200 });
    const handler = vi.fn().mockResolvedValue(nextAuthResponse);
    mockGetAuthOptions.mockReturnValue({ providers: [] });
    mockNextAuth.mockReturnValue(handler);

    const { GET } = await importRouteModule();
    const firstRequest = createRequest('/api/auth/session');
    const firstContext = createContext(['session']);
    const secondRequest = createRequest('/api/auth/providers');
    const secondContext = createContext(['providers']);

    await GET(firstRequest, firstContext);
    await GET(secondRequest, secondContext);

    expect(mockNextAuth).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenNthCalledWith(2, secondRequest, secondContext);
  });

  it('uses the same fallback for POST requests', async () => {
    mockGetAuthOptions.mockImplementation(() => {
      throw new Error('missing auth env');
    });

    const { POST } = await importRouteModule();
    const response = await POST(
      createRequest('/api/auth/callback/discord'),
      createContext(['callback', 'discord']),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'AuthUnavailable' });
  });
});
