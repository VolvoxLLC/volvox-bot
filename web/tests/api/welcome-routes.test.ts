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

const BOT_API_BASE_URL = 'https://bot.internal:3001/api/v1';
const BOT_API_SECRET = 'bot-secret';
const GUILD_ID = 'guild-1';

type ProxyExpectation = {
  failureMessage: string;
  proxyOptions?: { method: 'POST' };
  routeLabel: string;
  upstreamPath: string;
};

function createRequest(path = '/api/guilds/guild-1/welcome/status') {
  return new NextRequest(new URL(path, 'https://localhost:3000'));
}

function expectWelcomeProxy({
  failureMessage,
  proxyOptions,
  routeLabel,
  upstreamPath,
}: ProxyExpectation) {
  expect(mockAuthorizeGuildAdmin).toHaveBeenCalledWith(
    expect.any(NextRequest),
    GUILD_ID,
    routeLabel,
  );
  expect(mockBuildUpstreamUrl).toHaveBeenCalledWith(BOT_API_BASE_URL, upstreamPath, routeLabel);
  expect(mockProxyToBotApi).toHaveBeenCalledWith(
    new URL(`${BOT_API_BASE_URL}${upstreamPath}`),
    BOT_API_SECRET,
    routeLabel,
    failureMessage,
    ...(proxyOptions ? [proxyOptions] : []),
  );
}

describe('welcome API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthorizeGuildAdmin.mockResolvedValue(null);
    mockGetBotApiConfig.mockReturnValue({
      baseUrl: BOT_API_BASE_URL,
      secret: BOT_API_SECRET,
    });
    mockBuildUpstreamUrl.mockImplementation(
      (baseUrl: string, path: string) => new URL(`${baseUrl}${path}`),
    );
    mockProxyToBotApi.mockResolvedValue(NextResponse.json({ ok: true }, { status: 200 }));
  });

  for (const routeCase of [
    {
      name: 'status',
      invoke: () =>
        getWelcomeStatus(createRequest(), { params: Promise.resolve({ guildId: GUILD_ID }) }),
      failureMessage: 'Failed to fetch welcome publish status',
      routeLabel: '[api/guilds/:guildId/welcome/status]',
      upstreamPath: '/guilds/guild-1/welcome/status',
    },
    {
      name: 'publish',
      invoke: () =>
        publishWelcome(createRequest('/api/guilds/guild-1/welcome/publish'), {
          params: Promise.resolve({ guildId: GUILD_ID }),
        }),
      failureMessage: 'Failed to publish welcome',
      proxyOptions: { method: 'POST' } as const,
      routeLabel: '[api/guilds/:guildId/welcome/publish]',
      upstreamPath: '/guilds/guild-1/welcome/publish',
    },
    {
      name: 'panel publish',
      invoke: () =>
        publishWelcomePanel(createRequest('/api/guilds/guild-1/welcome/publish/rules'), {
          params: Promise.resolve({ guildId: GUILD_ID, panelType: 'rules' }),
        }),
      failureMessage: 'Failed to publish welcome panel',
      proxyOptions: { method: 'POST' } as const,
      routeLabel: '[api/guilds/:guildId/welcome/publish/:panelType]',
      upstreamPath: '/guilds/guild-1/welcome/publish/rules',
    },
    {
      name: 'unknown panel publish',
      invoke: () =>
        publishWelcomePanel(createRequest('/api/guilds/guild-1/welcome/publish/intro'), {
          params: Promise.resolve({ guildId: GUILD_ID, panelType: 'intro' }),
        }),
      failureMessage: 'Failed to publish welcome panel',
      proxyOptions: { method: 'POST' } as const,
      routeLabel: '[api/guilds/:guildId/welcome/publish/:panelType]',
      upstreamPath: '/guilds/guild-1/welcome/publish/intro',
    },
  ]) {
    it(`proxies welcome ${routeCase.name} requests for guild admins`, async () => {
      const response = await routeCase.invoke();

      expectWelcomeProxy(routeCase);
      expect(response.status).toBe(200);
    });
  }
});
