import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectJsonResponse } from './test-utils';

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

    await expectJsonResponse(response, 200, {});
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

    await expectJsonResponse(response, 200, {});
  });

  it('stringifies non-Error throws in fallback logging metadata', async () => {
    mockGetAuthOptions.mockImplementation(() => {
      throw 'missing auth env';
    });

    const { GET } = await importRouteModule();
    const response = await GET(
      createRequest('/api/auth/providers'),
      createContext(['providers']),
    );

    await expectJsonResponse(response, 200, {});
    expect(mockWarn).toHaveBeenCalledWith(
      '[auth] Auth route requested without valid environment configuration',
      expect.objectContaining({ pathname: '/api/auth/providers', error: 'missing auth env' }),
    );
  });

  it('returns an empty csrf token when auth env is unavailable for /csrf', async () => {
    mockGetAuthOptions.mockImplementation(() => {
      throw new Error('missing auth env');
    });

    const { GET } = await importRouteModule();
    const response = await GET(createRequest('/api/auth/csrf'), createContext(['csrf']));

    await expectJsonResponse(response, 200, { csrfToken: '' });
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
    await expectJsonResponse(response, 200, { ok: true });
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

  it('returns the CSRF fallback for POST requests when auth env is unavailable', async () => {
    mockGetAuthOptions.mockImplementation(() => {
      throw new Error('missing auth env');
    });

    const { POST } = await importRouteModule();
    const response = await POST(createRequest('/api/auth/csrf'), createContext(['csrf']));

    await expectJsonResponse(response, 200, { csrfToken: '' });
    expect(mockWarn).toHaveBeenCalledWith(
      '[auth] Auth route requested without valid environment configuration',
      expect.objectContaining({ pathname: '/api/auth/csrf', error: 'missing auth env' }),
    );
  });

  it('resets the cached handler after a failure and retries initialization on the next request', async () => {
    const firstHandler = vi.fn().mockRejectedValue(new Error('cached handler failed'));
    const secondResponse = NextResponse.json({ ok: true }, { status: 200 });
    const secondHandler = vi.fn().mockResolvedValue(secondResponse);

    mockGetAuthOptions.mockReturnValue({ providers: [] });
    mockNextAuth.mockReturnValueOnce(firstHandler).mockReturnValueOnce(secondHandler);

    const { GET } = await importRouteModule();

    const failedResponse = await GET(createRequest('/api/auth/session'), createContext(['session']));
    await expectJsonResponse(failedResponse, 200, {});
    expect(mockNextAuth).toHaveBeenCalledTimes(1);
    expect(firstHandler).toHaveBeenCalledTimes(1);

    const recoveredResponse = await GET(
      createRequest('/api/auth/providers'),
      createContext(['providers']),
    );

    expect(mockNextAuth).toHaveBeenCalledTimes(2);
    expect(secondHandler).toHaveBeenCalledTimes(1);
    await expectJsonResponse(recoveredResponse, 200, { ok: true });
    expect(mockWarn).toHaveBeenCalledWith(
      '[auth] Auth route requested without valid environment configuration',
      expect.objectContaining({ pathname: '/api/auth/session', error: 'cached handler failed' }),
    );
  });

  it('uses the same fallback for non-CSRF POST requests', async () => {
    mockGetAuthOptions.mockImplementation(() => {
      throw new Error('missing auth env');
    });

    const { POST } = await importRouteModule();
    const response = await POST(
      createRequest('/api/auth/callback/discord'),
      createContext(['callback', 'discord']),
    );

    await expectJsonResponse(response, 503, { error: 'AuthUnavailable' });
  });
});
