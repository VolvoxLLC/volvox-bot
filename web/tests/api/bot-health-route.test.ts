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

import { GET } from '@/app/api/bot-health/route';

function createRequest(url = 'http://localhost:3000/api/bot-health?guildId=guild-1') {
  return new NextRequest(new URL(url));
}

describe('GET /api/bot-health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthorizeGuildAdmin.mockResolvedValue(null);
    mockGetBotApiConfig.mockReturnValue({
      baseUrl: 'http://bot.internal:3001/api/v1',
      secret: 'bot-secret',
    });
    mockBuildUpstreamUrl.mockReturnValue(new URL('http://bot.internal:3001/api/v1/health'));
    mockProxyToBotApi.mockResolvedValue(NextResponse.json({ ok: true }, { status: 200 }));
  });

  it('returns 400 when guildId is missing', async () => {
    const response = await GET(createRequest('http://localhost:3000/api/bot-health'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Missing guildId' });
    expect(mockAuthorizeGuildAdmin).not.toHaveBeenCalled();
  });

  it('returns auth error when requester is not authorized', async () => {
    mockAuthorizeGuildAdmin.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );

    const response = await GET(createRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('proxies health requests for authorized guild admins', async () => {
    const response = await GET(createRequest());

    expect(mockAuthorizeGuildAdmin).toHaveBeenCalledWith(
      expect.any(NextRequest),
      'guild-1',
      '[api/bot-health]',
    );
    expect(mockProxyToBotApi).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });
});
