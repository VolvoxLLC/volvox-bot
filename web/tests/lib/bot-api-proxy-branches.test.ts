import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const {
  mockGetToken,
  mockGetBotApiBaseUrl,
  mockGetMutualGuilds,
  mockLoggerError,
} = vi.hoisted(() => ({
  mockGetToken: vi.fn(),
  mockGetBotApiBaseUrl: vi.fn(),
  mockGetMutualGuilds: vi.fn(),
  mockLoggerError: vi.fn(),
}));

vi.mock('next-auth/jwt', () => ({
  getToken: (...args: unknown[]) => mockGetToken(...args),
}));

vi.mock('@/lib/bot-api', () => ({
  getBotApiBaseUrl: () => mockGetBotApiBaseUrl(),
}));

vi.mock('@/lib/discord.server', () => ({
  getMutualGuilds: (...args: unknown[]) => mockGetMutualGuilds(...args),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: (...args: unknown[]) => mockLoggerError(...args),
  },
}));

import {
  authorizeGuildAdmin,
  authorizeGuildModerator,
  buildUpstreamUrl,
  getBotApiConfig,
  hasAdministratorPermission,
  hasModeratorPermission,
  proxyToBotApi,
} from '@/lib/bot-api-proxy';

function createRequest() {
  return new NextRequest('http://localhost:3000/api/test');
}

describe('bot-api-proxy branch coverage', () => {
  const realFetch = globalThis.fetch;
  const originalSecret = process.env.BOT_API_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
    process.env.BOT_API_SECRET = 'bot-secret';
    mockGetBotApiBaseUrl.mockReturnValue('https://bot.internal');
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    if (originalSecret === undefined) {
      delete process.env.BOT_API_SECRET;
    } else {
      process.env.BOT_API_SECRET = originalSecret;
    }
  });

  it('detects administrator permissions and invalid bitfields', () => {
    expect(hasAdministratorPermission('8')).toBe(true);
    expect(hasAdministratorPermission('32')).toBe(false);
    expect(hasAdministratorPermission('garbage')).toBe(false);
  });

  it('detects moderator permissions and invalid bitfields', () => {
    expect(hasModeratorPermission('32')).toBe(true);
    expect(hasModeratorPermission('2')).toBe(true);
    expect(hasModeratorPermission('4')).toBe(true);
    expect(hasModeratorPermission('0')).toBe(false);
    expect(hasModeratorPermission('garbage')).toBe(false);
  });

  it('returns 401 when the session token is missing', async () => {
    mockGetToken.mockResolvedValue(null);

    const response = await authorizeGuildAdmin(createRequest(), 'guild-1', '[test]');

    expect(response?.status).toBe(401);
    await expect(response?.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 when the refresh token has expired', async () => {
    mockGetToken.mockResolvedValue({
      accessToken: 'token',
      error: 'RefreshTokenError',
    });

    const response = await authorizeGuildAdmin(createRequest(), 'guild-1', '[test]');

    expect(response?.status).toBe(401);
    await expect(response?.json()).resolves.toEqual({
      error: 'Token expired. Please sign in again.',
    });
  });

  it('returns 502 when guild verification fails', async () => {
    mockGetToken.mockResolvedValue({ accessToken: 'token' });
    mockGetMutualGuilds.mockRejectedValue(new Error('discord blew up'));

    const response = await authorizeGuildAdmin(createRequest(), 'guild-1', '[test]');

    expect(response?.status).toBe(502);
    await expect(response?.json()).resolves.toEqual({
      error: 'Failed to verify guild permissions',
    });
    expect(mockLoggerError).toHaveBeenCalled();
  });

  it('returns 403 when the guild is missing or not manageable', async () => {
    mockGetToken.mockResolvedValue({ accessToken: 'token' });
    mockGetMutualGuilds.mockResolvedValue([
      { id: 'guild-2', owner: false, permissions: '0' },
      { id: 'guild-3', owner: false, permissions: '0' },
    ]);

    const response = await authorizeGuildAdmin(createRequest(), 'guild-1', '[test]');

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('returns null for guild owners and administrators', async () => {
    mockGetToken.mockResolvedValue({ accessToken: 'token' });
    mockGetMutualGuilds.mockResolvedValue([
      { id: 'guild-1', owner: true, permissions: '0' },
      { id: 'guild-2', owner: false, permissions: '8' },
    ]);

    await expect(authorizeGuildAdmin(createRequest(), 'guild-1', '[test]')).resolves.toBeNull();

    mockGetMutualGuilds.mockResolvedValue([{ id: 'guild-2', owner: false, permissions: '8' }]);

    await expect(authorizeGuildAdmin(createRequest(), 'guild-2', '[test]')).resolves.toBeNull();
  });

  it('allows moderator access for moderator-authorized routes', async () => {
    mockGetToken.mockResolvedValue({ accessToken: 'token', id: 'user-1' });
    mockGetMutualGuilds.mockResolvedValue([{ id: 'guild-1', owner: false, permissions: '0' }]);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 'guild-1', access: 'moderator' }],
    });

    await expect(authorizeGuildModerator(createRequest(), 'guild-1', '[test]')).resolves.toBeNull();
    await expect(authorizeGuildAdmin(createRequest(), 'guild-1', '[test]')).resolves.toMatchObject({
      status: 403,
    });
  });

  it('returns config when the bot api base url and secret are present', () => {
    expect(getBotApiConfig('[test]')).toEqual({
      baseUrl: 'https://bot.internal',
      secret: 'bot-secret',
    });
  });

  it('returns a 500 response when the bot api config is missing', async () => {
    mockGetBotApiBaseUrl.mockReturnValue('');
    delete process.env.BOT_API_SECRET;

    const response = getBotApiConfig('[test]');

    expect(response).toBeInstanceOf(NextResponse);
    expect((response as NextResponse).status).toBe(500);
    await expect((response as NextResponse).json()).resolves.toEqual({
      error: 'Bot API is not configured',
    });
  });

  it('normalizes upstream urls and rejects invalid ones', async () => {
    const upstreamUrl = buildUpstreamUrl('https://bot.internal///', 'guilds/123', '[test]');

    expect(upstreamUrl).toBeInstanceOf(URL);
    expect((upstreamUrl as URL).toString()).toBe('https://bot.internal/guilds/123');

    const invalidUrlResponse = buildUpstreamUrl('http://[::1', '/oops', '[test]');

    expect(invalidUrlResponse).toBeInstanceOf(NextResponse);
    expect((invalidUrlResponse as NextResponse).status).toBe(500);
    await expect((invalidUrlResponse as NextResponse).json()).resolves.toEqual({
      error: 'Bot API is not configured correctly',
    });
  });

  it('returns upstream text errors for non-json responses', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      headers: new Headers({ 'content-type': 'text/plain' }),
      status: 418,
      text: async () => 'teapot',
    });

    const response = await proxyToBotApi(
      new URL('https://bot.internal/test'),
      'secret',
      '[test]',
      'Failed',
    );

    expect(response.status).toBe(418);
    await expect(response.json()).resolves.toEqual({ error: 'teapot' });
  });

  it('maps timeout and generic failures to the right status codes', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce({ name: 'AbortError' });
    const abortResponse = await proxyToBotApi(
      new URL('https://bot.internal/test'),
      'secret',
      '[test]',
      'Aborted',
    );

    expect(abortResponse.status).toBe(504);
    await expect(abortResponse.json()).resolves.toEqual({ error: 'Aborted' });

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce({ name: 'TimeoutError' });
    const timeoutResponse = await proxyToBotApi(
      new URL('https://bot.internal/test'),
      'secret',
      '[test]',
      'Timed out',
    );

    expect(timeoutResponse.status).toBe(504);
    await expect(timeoutResponse.json()).resolves.toEqual({ error: 'Timed out' });

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));
    const errorResponse = await proxyToBotApi(
      new URL('https://bot.internal/test'),
      'secret',
      '[test]',
      'Crashed',
    );

    expect(errorResponse.status).toBe(500);
    await expect(errorResponse.json()).resolves.toEqual({ error: 'Crashed' });
  });
});
