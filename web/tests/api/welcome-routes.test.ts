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

import { POST as publishWelcome } from '@/app/api/guilds/[guildId]/welcome/publish/route';
import { POST as publishWelcomePanel } from '@/app/api/guilds/[guildId]/welcome/publish/[panelType]/route';
import { GET as getWelcomeStatus } from '@/app/api/guilds/[guildId]/welcome/status/route';

function createRequest(url = 'https://localhost:3000/api/guilds/guild-1/welcome/status') {
  return new NextRequest(new URL(url));
}

describe('welcome API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthorizeGuildAdmin.mockResolvedValue(null);
    mockGetBotApiConfig.mockReturnValue({
      baseUrl: 'https://bot.internal:3001/api/v1',
      secret: 'bot-secret',
    });
    mockBuildUpstreamUrl.mockImplementation(
      (baseUrl: string, path: string) => new URL(`${baseUrl}${path}`),
    );
    mockProxyToBotApi.mockResolvedValue(NextResponse.json({ ok: true }, { status: 200 }));
  });

  it('proxies welcome status requests for guild admins', async () => {
    const response = await getWelcomeStatus(createRequest(), {
      params: Promise.resolve({ guildId: 'guild-1' }),
    });

    expect(mockAuthorizeGuildAdmin).toHaveBeenCalledWith(
      expect.any(NextRequest),
      'guild-1',
      '[api/guilds/:guildId/welcome/status]',
    );
    expect(mockBuildUpstreamUrl).toHaveBeenCalledWith(
      'https://bot.internal:3001/api/v1',
      '/guilds/guild-1/welcome/status',
      '[api/guilds/:guildId/welcome/status]',
    );
    expect(mockProxyToBotApi).toHaveBeenCalledWith(
      new URL('https://bot.internal:3001/api/v1/guilds/guild-1/welcome/status'),
      'bot-secret',
      '[api/guilds/:guildId/welcome/status]',
      'Failed to fetch welcome publish status',
    );
    expect(response.status).toBe(200);
  });

  it('proxies welcome publish requests with POST', async () => {
    const response = await publishWelcome(
      createRequest('https://localhost:3000/api/guilds/guild-1/welcome/publish'),
      { params: Promise.resolve({ guildId: 'guild-1' }) },
    );

    expect(mockAuthorizeGuildAdmin).toHaveBeenCalledWith(
      expect.any(NextRequest),
      'guild-1',
      '[api/guilds/:guildId/welcome/publish]',
    );
    expect(mockBuildUpstreamUrl).toHaveBeenCalledWith(
      'https://bot.internal:3001/api/v1',
      '/guilds/guild-1/welcome/publish',
      '[api/guilds/:guildId/welcome/publish]',
    );
    expect(mockProxyToBotApi).toHaveBeenCalledWith(
      new URL('https://bot.internal:3001/api/v1/guilds/guild-1/welcome/publish'),
      'bot-secret',
      '[api/guilds/:guildId/welcome/publish]',
      'Failed to publish welcome',
      { method: 'POST' },
    );
    expect(response.status).toBe(200);
  });

  it('proxies individual welcome panel publish requests with POST', async () => {
    const response = await publishWelcomePanel(
      createRequest('https://localhost:3000/api/guilds/guild-1/welcome/publish/rules'),
      { params: Promise.resolve({ guildId: 'guild-1', panelType: 'rules' }) },
    );

    expect(mockAuthorizeGuildAdmin).toHaveBeenCalledWith(
      expect.any(NextRequest),
      'guild-1',
      '[api/guilds/:guildId/welcome/publish/:panelType]',
    );
    expect(mockBuildUpstreamUrl).toHaveBeenCalledWith(
      'https://bot.internal:3001/api/v1',
      '/guilds/guild-1/welcome/publish/rules',
      '[api/guilds/:guildId/welcome/publish/:panelType]',
    );
    expect(mockProxyToBotApi).toHaveBeenCalledWith(
      new URL('https://bot.internal:3001/api/v1/guilds/guild-1/welcome/publish/rules'),
      'bot-secret',
      '[api/guilds/:guildId/welcome/publish/:panelType]',
      'Failed to publish welcome panel',
      { method: 'POST' },
    );
    expect(response.status).toBe(200);
  });

  it('proxies unknown panel types to the bot API for canonical validation', async () => {
    const response = await publishWelcomePanel(
      createRequest('https://localhost:3000/api/guilds/guild-1/welcome/publish/intro'),
      { params: Promise.resolve({ guildId: 'guild-1', panelType: 'intro' }) },
    );

    expect(mockAuthorizeGuildAdmin).toHaveBeenCalledWith(
      expect.any(NextRequest),
      'guild-1',
      '[api/guilds/:guildId/welcome/publish/:panelType]',
    );
    expect(mockBuildUpstreamUrl).toHaveBeenCalledWith(
      'https://bot.internal:3001/api/v1',
      '/guilds/guild-1/welcome/publish/intro',
      '[api/guilds/:guildId/welcome/publish/:panelType]',
    );
    expect(mockProxyToBotApi).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });
});
