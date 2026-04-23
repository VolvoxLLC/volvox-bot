import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const {
  mockAuthorizeGuildAdmin,
  mockGetBotApiConfig,
  mockBuildUpstreamUrl,
  mockProxyToBotApi,
} = vi.hoisted(() => ({
  mockAuthorizeGuildAdmin: vi.fn(),
  mockGetBotApiConfig: vi.fn(),
  mockBuildUpstreamUrl: vi.fn(),
  mockProxyToBotApi: vi.fn(),
}));

vi.mock('@/lib/bot-api-proxy', () => ({
  authorizeGuildAdmin: mockAuthorizeGuildAdmin,
  getBotApiConfig: mockGetBotApiConfig,
  buildUpstreamUrl: mockBuildUpstreamUrl,
  proxyToBotApi: mockProxyToBotApi,
}));

import { GET } from '@/app/api/guilds/[guildId]/channels/route';

function createRequest(url = 'http://localhost:3000/api/guilds/guild-1/channels') {
  return new NextRequest(new URL(url));
}

describe('GET /api/guilds/[guildId]/channels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthorizeGuildAdmin.mockResolvedValue(null);
    mockGetBotApiConfig.mockReturnValue({
      baseUrl: 'http://bot.internal:3001/api/v1',
      secret: 'bot-secret',
    });
    mockBuildUpstreamUrl.mockReturnValue(
      new URL('http://bot.internal:3001/api/v1/guilds/guild-1/channels'),
    );
    mockProxyToBotApi.mockResolvedValue(NextResponse.json([{ id: '1' }], { status: 200 }));
  });

  it('returns 400 when guildId is missing', async () => {
    const response = await GET(createRequest(), { params: Promise.resolve({ guildId: '' }) });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Missing guildId' });
    expect(mockAuthorizeGuildAdmin).not.toHaveBeenCalled();
  });

  it('proxies channels without a server-side revalidation window', async () => {
    const response = await GET(createRequest(), { params: Promise.resolve({ guildId: 'guild-1' }) });

    expect(mockAuthorizeGuildAdmin).toHaveBeenCalledWith(
      expect.any(NextRequest),
      'guild-1',
      '[api/guilds/:guildId/channels]',
    );
    expect(mockBuildUpstreamUrl).toHaveBeenCalledWith(
      'http://bot.internal:3001/api/v1',
      '/guilds/guild-1/channels',
      '[api/guilds/:guildId/channels]',
    );
    expect(mockProxyToBotApi).toHaveBeenCalledWith(
      new URL('http://bot.internal:3001/api/v1/guilds/guild-1/channels'),
      'bot-secret',
      '[api/guilds/:guildId/channels]',
      'Failed to fetch channels',
    );
    expect(response.status).toBe(200);
  });
});
