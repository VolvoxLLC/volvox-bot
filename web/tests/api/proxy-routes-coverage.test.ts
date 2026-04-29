import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const {
  mockAuthorizeGuildAdmin,
  mockAuthorizeGuildModerator,
  mockBuildUpstreamUrl,
  mockGetBotApiBaseUrl,
  mockGetBotApiConfig,
  mockGetToken,
  mockProxyToBotApi,
} = vi.hoisted(() => ({
  mockAuthorizeGuildAdmin: vi.fn(),
  mockAuthorizeGuildModerator: vi.fn(),
  mockBuildUpstreamUrl: vi.fn(),
  mockGetBotApiBaseUrl: vi.fn(),
  mockGetBotApiConfig: vi.fn(),
  mockGetToken: vi.fn(),
  mockProxyToBotApi: vi.fn(),
}));

vi.mock('@/lib/bot-api-proxy', () => ({
  authorizeGuildAdmin: mockAuthorizeGuildAdmin,
  authorizeGuildModerator: mockAuthorizeGuildModerator,
  buildUpstreamUrl: mockBuildUpstreamUrl,
  getBotApiConfig: mockGetBotApiConfig,
  proxyToBotApi: mockProxyToBotApi,
}));

vi.mock('@/lib/bot-api', () => ({
  getBotApiBaseUrl: mockGetBotApiBaseUrl,
}));

vi.mock('next-auth/jwt', () => ({
  getToken: mockGetToken,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import * as aiRecentRoute from '@/app/api/guilds/[guildId]/ai-feedback/recent/route';
import * as aiStatsRoute from '@/app/api/guilds/[guildId]/ai-feedback/stats/route';
import * as auditLogRoute from '@/app/api/guilds/[guildId]/audit-log/route';
import * as configRoute from '@/app/api/guilds/[guildId]/config/route';
import * as rolesRoute from '@/app/api/guilds/[guildId]/roles/route';
import * as conversationDetailRoute from '@/app/api/guilds/[guildId]/conversations/[conversationId]/route';
import * as conversationFlagRoute from '@/app/api/guilds/[guildId]/conversations/[conversationId]/flag/route';
import * as conversationFlagsRoute from '@/app/api/guilds/[guildId]/conversations/flags/route';
import * as conversationStatsRoute from '@/app/api/guilds/[guildId]/conversations/stats/route';
import * as conversationsRoute from '@/app/api/guilds/[guildId]/conversations/route';
import * as memberCasesRoute from '@/app/api/guilds/[guildId]/members/[userId]/cases/route';
import * as memberDetailRoute from '@/app/api/guilds/[guildId]/members/[userId]/route';
import * as membersExportRoute from '@/app/api/guilds/[guildId]/members/export/route';
import * as membersRoute from '@/app/api/guilds/[guildId]/members/route';
import * as ticketsDetailRoute from '@/app/api/guilds/[guildId]/tickets/[ticketId]/route';
import * as ticketsStatsRoute from '@/app/api/guilds/[guildId]/tickets/stats/route';
import * as ticketsRoute from '@/app/api/guilds/[guildId]/tickets/route';
import * as moderationCaseDetailRoute from '@/app/api/moderation/cases/[id]/route';
import * as moderationCasesRoute from '@/app/api/moderation/cases/route';
import * as moderationStatsRoute from '@/app/api/moderation/stats/route';
import * as userHistoryRoute from '@/app/api/moderation/user/[userId]/history/route';
import * as performanceRoute from '@/app/api/performance/route';
import * as thresholdsRoute from '@/app/api/performance/thresholds/route';
import * as statsRoute from '@/app/api/stats/route';
import * as tempRoleDetailRoute from '@/app/api/temp-roles/[id]/route';
import * as tempRolesRoute from '@/app/api/temp-roles/route';

const apiConfig = {
  baseUrl: 'http://bot.internal:3001/api/v1',
  secret: 'bot-secret',
};

function request(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(new URL(url), init);
}

function guildParams(guildId = 'guild 1') {
  return { params: Promise.resolve({ guildId }) };
}

async function expectJson(response: Response, expected: unknown) {
  await expect(response.json()).resolves.toEqual(expected);
}

describe('proxy route coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthorizeGuildAdmin.mockResolvedValue(null);
    mockAuthorizeGuildModerator.mockResolvedValue(null);
    mockGetBotApiConfig.mockReturnValue(apiConfig);
    mockGetBotApiBaseUrl.mockReturnValue('http://bot.internal:3001');
    mockGetToken.mockResolvedValue({ accessToken: 'access-token' });
    mockBuildUpstreamUrl.mockImplementation((baseUrl: string, path: string) => new URL(path, baseUrl));
    mockProxyToBotApi.mockResolvedValue(NextResponse.json({ ok: true }));
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('id,name\n1,Ada\n', {
        status: 200,
        headers: { 'Content-Type': 'text/csv' },
      }),
    );
  });

  it('covers guild admin proxy routes and query forwarding', async () => {
    const cases = [
      {
        call: () => aiRecentRoute.GET(request('http://localhost/api?limit=10'), guildParams()),
        path: '/guilds/guild%201/ai-feedback/recent',
        query: { limit: '10' },
      },
      {
        call: () => aiStatsRoute.GET(request('http://localhost/api?days=999'), guildParams()),
        path: '/guilds/guild%201/ai-feedback/stats',
        query: { days: '90' },
      },
      {
        call: () => auditLogRoute.GET(request('http://localhost/api?limit=25&offset=5&ignored=x'), guildParams()),
        path: '/guilds/guild%201/audit-log',
        query: { limit: '25', offset: '5' },
      },
      {
        call: () => conversationsRoute.GET(request('http://localhost/api?search=ai&channel=chan-1&page=2'), guildParams()),
        path: '/guilds/guild%201/conversations',
        query: { search: 'ai', channel: 'chan-1', page: '2' },
      },
      {
        call: () => conversationDetailRoute.GET(request('http://localhost/api'), {
          params: Promise.resolve({ guildId: 'guild 1', conversationId: 'conversation 1' }),
        }),
        path: '/guilds/guild%201/conversations/conversation%201',
      },
      {
        call: () => conversationFlagsRoute.GET(request('http://localhost/api?page=3&status=open&ignored=x'), guildParams()),
        path: '/guilds/guild%201/conversations/flags',
        query: { page: '3', status: 'open' },
      },
      {
        call: () => conversationStatsRoute.GET(request('http://localhost/api?range=7d'), guildParams()),
        path: '/guilds/guild%201/conversations/stats',
      },
    ];

    for (const routeCase of cases) {
      mockProxyToBotApi.mockClear();
      const response = await routeCase.call();
      expect(response.status).toBe(200);
      const upstream = mockProxyToBotApi.mock.calls.at(-1)?.[0] as URL;
      expect(upstream.pathname).toBe(routeCase.path);
      for (const [key, value] of Object.entries(routeCase.query ?? {})) {
        expect(upstream.searchParams.get(key)).toBe(value);
      }
    }
  });

  it('covers config read and write validation before proxying', async () => {
    await configRoute.GET(request('http://localhost/api'), guildParams());

    const patchResponse = await configRoute.PATCH(
      request('http://localhost/api', {
        method: 'PATCH',
        body: JSON.stringify({ path: 'features.xp.enabled', value: true }),
      }),
      guildParams(),
    );
    expect(patchResponse.status).toBe(200);
    expect(mockProxyToBotApi.mock.calls.at(-1)?.[4]).toMatchObject({ method: 'PATCH' });

    const putResponse = await configRoute.PUT(
      request('http://localhost/api', {
        method: 'PUT',
        body: JSON.stringify([{ path: 'features.levels.enabled', value: false }]),
      }),
      guildParams(),
    );
    expect(putResponse.status).toBe(200);
    expect(mockProxyToBotApi.mock.calls.at(-1)?.[4]).toMatchObject({ method: 'PUT' });

    const invalidPatch = await configRoute.PATCH(
      request('http://localhost/api', { method: 'PATCH', body: JSON.stringify({ path: '' }) }),
      guildParams(),
    );
    expect(invalidPatch.status).toBe(400);
    await expectJson(invalidPatch, {
      error: 'Invalid patch: expected { path: string, value: unknown }',
    });

    const invalidPut = await configRoute.PUT(
      request('http://localhost/api', { method: 'PUT', body: JSON.stringify({ path: 'x' }) }),
      guildParams(),
    );
    expect(invalidPut.status).toBe(400);
    await expectJson(invalidPut, { error: 'Invalid payload: expected an array of patches' });
  });

  it('covers conversation flag JSON validation and proxy body', async () => {
    const response = await conversationFlagRoute.POST(
      request('http://localhost/api', {
        method: 'POST',
        body: JSON.stringify({ messageId: 'msg-1', reason: 'spam' }),
      }),
      { params: Promise.resolve({ guildId: 'guild 1', conversationId: 'conversation 1' }) },
    );

    expect(response.status).toBe(200);
    expect(mockProxyToBotApi.mock.calls.at(-1)?.[4]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ messageId: 'msg-1', reason: 'spam' }),
    });

    const invalid = await conversationFlagRoute.POST(
      request('http://localhost/api', { method: 'POST', body: '{' }),
      { params: Promise.resolve({ guildId: 'guild 1', conversationId: 'conversation 1' }) },
    );
    expect(invalid.status).toBe(400);
  });

  it('covers guild moderator proxy routes and parameter forwarding', async () => {
    const cases = [
      {
        call: () => membersRoute.GET(request('http://localhost/api?search=ada&sort=xp&order=desc&after=42'), guildParams()),
        path: '/guilds/guild%201/members',
        query: { search: 'ada', sort: 'xp', order: 'desc', after: '42' },
      },
      {
        call: () => memberDetailRoute.GET(request('http://localhost/api'), {
          params: Promise.resolve({ guildId: 'guild 1', userId: 'user 1' }),
        }),
        path: '/guilds/guild%201/members/user%201',
      },
      {
        call: () => memberCasesRoute.GET(request('http://localhost/api?page=2&limit=5'), {
          params: Promise.resolve({ guildId: 'guild 1', userId: 'user 1' }),
        }),
        path: '/guilds/guild%201/members/user%201/cases',
        query: { page: '2', limit: '5' },
      },
      {
        call: () => ticketsRoute.GET(request('http://localhost/api?status=open&user=user-1&page=4'), guildParams()),
        path: '/guilds/guild%201/tickets',
        query: { status: 'open', user: 'user-1', page: '4' },
      },
      {
        call: () => ticketsDetailRoute.GET(request('http://localhost/api'), {
          params: Promise.resolve({ guildId: 'guild 1', ticketId: '77' }),
        }),
        path: '/guilds/guild%201/tickets/77',
      },
      {
        call: () => ticketsStatsRoute.GET(request('http://localhost/api'), guildParams()),
        path: '/guilds/guild%201/tickets/stats',
      },
    ];

    for (const routeCase of cases) {
      mockProxyToBotApi.mockClear();
      const response = await routeCase.call();
      expect(response.status).toBe(200);
      const upstream = mockProxyToBotApi.mock.calls.at(-1)?.[0] as URL;
      expect(upstream.pathname).toBe(routeCase.path);
      for (const [key, value] of Object.entries(routeCase.query ?? {})) {
        expect(upstream.searchParams.get(key)).toBe(value);
      }
    }
  });

  it('covers moderation proxy routes with required guild validation', async () => {
    const missingGuild = await moderationCasesRoute.GET(request('http://localhost/api'));
    expect(missingGuild.status).toBe(400);
    await expectJson(missingGuild, { error: 'guildId is required' });

    const cases = [
      {
        call: () => moderationCasesRoute.GET(request('http://localhost/api?guildId=guild-1&targetId=user-1&action=ban&page=2&ignored=x')),
        path: '/moderation/cases',
        query: { guildId: 'guild-1', targetId: 'user-1', action: 'ban', page: '2' },
      },
      {
        call: () => moderationCaseDetailRoute.GET(request('http://localhost/api?guildId=guild-1'), {
          params: Promise.resolve({ id: 'case-1' }),
        }),
        path: '/moderation/cases/case-1',
        query: { guildId: 'guild-1' },
      },
      {
        call: () => moderationStatsRoute.GET(request('http://localhost/api?guildId=guild-1')),
        path: '/moderation/stats',
        query: { guildId: 'guild-1' },
      },
      {
        call: () => userHistoryRoute.GET(request('http://localhost/api?guildId=guild-1&page=2'), {
          params: Promise.resolve({ userId: 'user-1' }),
        }),
        path: '/moderation/user/user-1/history',
        query: { guildId: 'guild-1', page: '2' },
      },
    ];

    for (const routeCase of cases) {
      mockProxyToBotApi.mockClear();
      const response = await routeCase.call();
      expect(response.status).toBe(200);
      const upstream = mockProxyToBotApi.mock.calls.at(-1)?.[0] as URL;
      expect(upstream.pathname).toBe(routeCase.path);
      for (const [key, value] of Object.entries(routeCase.query ?? {})) {
        expect(upstream.searchParams.get(key)).toBe(value);
      }
    }
  });

  it('covers performance and threshold authorization branches', async () => {
    await performanceRoute.GET(request('http://localhost/api'));
    await thresholdsRoute.GET(request('http://localhost/api'));
    await thresholdsRoute.PUT(
      request('http://localhost/api', { method: 'PUT', body: JSON.stringify({ slowQueryMs: 250 }) }),
    );

    expect(mockProxyToBotApi).toHaveBeenCalledWith(
      expect.any(URL),
      'bot-secret',
      '[api/performance/thresholds]',
      'Failed to update thresholds',
      expect.objectContaining({ method: 'PUT' }),
    );

    mockGetToken.mockResolvedValueOnce(null);
    const unauthorized = await performanceRoute.GET(request('http://localhost/api'));
    expect(unauthorized.status).toBe(401);

    mockGetToken.mockResolvedValueOnce({ accessToken: 'token', error: 'RefreshTokenError' });
    const expired = await thresholdsRoute.GET(request('http://localhost/api'));
    expect(expired.status).toBe(401);

    const invalidBody = await thresholdsRoute.PUT(
      request('http://localhost/api', { method: 'PUT', body: '{' }),
    );
    expect(invalidBody.status).toBe(400);
  });

  it('covers public stats proxy responses', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      Response.json({ guilds: 12, users: 34 }),
    );
    const ok = await statsRoute.GET();
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Cache-Control')).toContain('s-maxage=60');

    mockGetBotApiBaseUrl.mockReturnValueOnce(null);
    const unconfigured = await statsRoute.GET();
    expect(unconfigured.status).toBe(503);

    vi.mocked(global.fetch).mockResolvedValueOnce(new Response('nope', { status: 502 }));
    const upstreamError = await statsRoute.GET();
    expect(upstreamError.status).toBe(502);

    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('down'));
    const unavailable = await statsRoute.GET();
    expect(unavailable.status).toBe(503);
  });

  it('covers member export success and upstream error handling', async () => {
    const ok = await membersExportRoute.GET(request('http://localhost/api'), guildParams('guild-1'));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Content-Disposition')).toBe('attachment; filename="members.csv"');

    vi.mocked(global.fetch).mockResolvedValueOnce(new Response('bad export', { status: 503 }));
    const error = await membersExportRoute.GET(request('http://localhost/api'), guildParams('guild-1'));
    expect(error.status).toBe(503);
    await expectJson(error, { error: 'bad export' });
  });

  it('covers temp role list, assignment, and revoke routes', async () => {
    const missingListGuild = await tempRolesRoute.GET(request('http://localhost/api'));
    expect(missingListGuild.status).toBe(400);

    const list = await tempRolesRoute.GET(
      request('http://localhost/api?guildId=guild-1&userId=user-1&page=2&ignored=x'),
    );
    expect(list.status).toBe(200);
    let upstream = mockProxyToBotApi.mock.calls.at(-1)?.[0] as URL;
    expect(upstream.pathname).toBe('/temp-roles');
    expect(upstream.searchParams.get('guildId')).toBe('guild-1');
    expect(upstream.searchParams.get('userId')).toBe('user-1');

    const assign = await tempRolesRoute.POST(
      request('http://localhost/api', {
        method: 'POST',
        body: JSON.stringify({ guildId: 'guild-1', userId: 'user-1', roleId: 'role-1' }),
      }),
    );
    expect(assign.status).toBe(200);
    expect(mockProxyToBotApi.mock.calls.at(-1)?.[4]).toMatchObject({ method: 'POST' });

    const invalidAssign = await tempRolesRoute.POST(
      request('http://localhost/api', { method: 'POST', body: '{' }),
    );
    expect(invalidAssign.status).toBe(400);

    const revoke = await tempRoleDetailRoute.DELETE(
      request('http://localhost/api?guildId=guild-1'),
      { params: Promise.resolve({ id: 'temp role 1' }) },
    );
    expect(revoke.status).toBe(200);
    upstream = mockProxyToBotApi.mock.calls.at(-1)?.[0] as URL;
    expect(upstream.pathname).toBe('/temp-roles/temp%20role%201');
    expect(upstream.searchParams.get('guildId')).toBe('guild-1');
    expect(mockProxyToBotApi.mock.calls.at(-1)?.[4]).toMatchObject({ method: 'DELETE' });
  });

  it('covers missing guild guards across route families', async () => {
    const missingGuildCases = [
      () => aiRecentRoute.GET(request('http://localhost/api'), guildParams('')),
      () => aiStatsRoute.GET(request('http://localhost/api'), guildParams('')),
      () => auditLogRoute.GET(request('http://localhost/api'), guildParams('')),
      () => conversationsRoute.GET(request('http://localhost/api'), guildParams('')),
      () => conversationDetailRoute.GET(request('http://localhost/api'), {
        params: Promise.resolve({ guildId: '', conversationId: 'conversation-1' }),
      }),
      () => conversationFlagRoute.POST(
        request('http://localhost/api', {
          method: 'POST',
          body: JSON.stringify({ messageId: 'msg-1' }),
        }),
        { params: Promise.resolve({ guildId: 'guild-1', conversationId: '' }) },
      ),
      () => conversationFlagsRoute.GET(request('http://localhost/api'), guildParams('')),
      () => conversationStatsRoute.GET(request('http://localhost/api'), guildParams('')),
      () => membersRoute.GET(request('http://localhost/api'), guildParams('')),
      () => memberDetailRoute.GET(request('http://localhost/api'), {
        params: Promise.resolve({ guildId: '', userId: 'user-1' }),
      }),
      () => memberCasesRoute.GET(request('http://localhost/api'), {
        params: Promise.resolve({ guildId: '', userId: 'user-1' }),
      }),
      () => membersExportRoute.GET(request('http://localhost/api'), guildParams('')),
      () => rolesRoute.GET(request('http://localhost/api'), guildParams('')),
      () => ticketsRoute.GET(request('http://localhost/api'), guildParams('')),
      () => ticketsDetailRoute.GET(request('http://localhost/api'), {
        params: Promise.resolve({ guildId: '', ticketId: 'ticket-1' }),
      }),
      () => ticketsStatsRoute.GET(request('http://localhost/api'), guildParams('')),
      () => moderationCaseDetailRoute.GET(request('http://localhost/api'), {
        params: Promise.resolve({ id: 'case-1' }),
      }),
      () => moderationStatsRoute.GET(request('http://localhost/api')),
      () => userHistoryRoute.GET(request('http://localhost/api'), {
        params: Promise.resolve({ userId: 'user-1' }),
      }),
      () => tempRolesRoute.POST(
        request('http://localhost/api', { method: 'POST', body: JSON.stringify({}) }),
      ),
      () => tempRoleDetailRoute.DELETE(request('http://localhost/api'), {
        params: Promise.resolve({ id: 'temp-role-1' }),
      }),
    ];

    for (const call of missingGuildCases) {
      const response = await call();
      expect(response.status).toBe(400);
    }
  });

  it('returns auth, config, and upstream construction errors from guild admin routes', async () => {
    const adminRoutes = [
      () => aiRecentRoute.GET(request('http://localhost/api'), guildParams('guild-1')),
      () => aiStatsRoute.GET(request('http://localhost/api'), guildParams('guild-1')),
      () => auditLogRoute.GET(request('http://localhost/api'), guildParams('guild-1')),
      () => configRoute.GET(request('http://localhost/api'), guildParams('guild-1')),
      () => rolesRoute.GET(request('http://localhost/api'), guildParams('guild-1')),
      () => conversationsRoute.GET(request('http://localhost/api'), guildParams('guild-1')),
      () => conversationDetailRoute.GET(request('http://localhost/api'), {
        params: Promise.resolve({ guildId: 'guild-1', conversationId: 'conversation-1' }),
      }),
      () => conversationFlagRoute.POST(
        request('http://localhost/api', {
          method: 'POST',
          body: JSON.stringify({ messageId: 'msg-1' }),
        }),
        { params: Promise.resolve({ guildId: 'guild-1', conversationId: 'conversation-1' }) },
      ),
      () => conversationFlagsRoute.GET(request('http://localhost/api'), guildParams('guild-1')),
      () => conversationStatsRoute.GET(request('http://localhost/api'), guildParams('guild-1')),
      () => tempRolesRoute.GET(request('http://localhost/api?guildId=guild-1')),
      () => tempRolesRoute.POST(
        request('http://localhost/api', {
          method: 'POST',
          body: JSON.stringify({ guildId: 'guild-1', userId: 'user-1', roleId: 'role-1' }),
        }),
      ),
      () => tempRoleDetailRoute.DELETE(request('http://localhost/api?guildId=guild-1'), {
        params: Promise.resolve({ id: 'temp-role-1' }),
      }),
    ];

    for (const call of adminRoutes) {
      const authResponse = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      mockAuthorizeGuildAdmin.mockResolvedValueOnce(authResponse);
      await expect(call()).resolves.toBe(authResponse);

      const configResponse = NextResponse.json({ error: 'Missing config' }, { status: 500 });
      mockGetBotApiConfig.mockReturnValueOnce(configResponse);
      await expect(call()).resolves.toBe(configResponse);

      const upstreamResponse = NextResponse.json({ error: 'Bad upstream' }, { status: 500 });
      mockBuildUpstreamUrl.mockReturnValueOnce(upstreamResponse);
      await expect(call()).resolves.toBe(upstreamResponse);
    }
  });

  it('returns auth, config, and upstream construction errors from moderator routes', async () => {
    const moderatorRoutes = [
      () => membersRoute.GET(request('http://localhost/api'), guildParams('guild-1')),
      () => memberDetailRoute.GET(request('http://localhost/api'), {
        params: Promise.resolve({ guildId: 'guild-1', userId: 'user-1' }),
      }),
      () => memberCasesRoute.GET(request('http://localhost/api'), {
        params: Promise.resolve({ guildId: 'guild-1', userId: 'user-1' }),
      }),
      () => membersExportRoute.GET(request('http://localhost/api'), guildParams('guild-1')),
      () => ticketsRoute.GET(request('http://localhost/api'), guildParams('guild-1')),
      () => ticketsDetailRoute.GET(request('http://localhost/api'), {
        params: Promise.resolve({ guildId: 'guild-1', ticketId: 'ticket-1' }),
      }),
      () => ticketsStatsRoute.GET(request('http://localhost/api'), guildParams('guild-1')),
      () => moderationCasesRoute.GET(request('http://localhost/api?guildId=guild-1')),
      () => moderationCaseDetailRoute.GET(request('http://localhost/api?guildId=guild-1'), {
        params: Promise.resolve({ id: 'case-1' }),
      }),
      () => moderationStatsRoute.GET(request('http://localhost/api?guildId=guild-1')),
      () => userHistoryRoute.GET(request('http://localhost/api?guildId=guild-1'), {
        params: Promise.resolve({ userId: 'user-1' }),
      }),
    ];

    for (const call of moderatorRoutes) {
      const authResponse = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      mockAuthorizeGuildModerator.mockResolvedValueOnce(authResponse);
      await expect(call()).resolves.toBe(authResponse);

      const configResponse = NextResponse.json({ error: 'Missing config' }, { status: 500 });
      mockGetBotApiConfig.mockReturnValueOnce(configResponse);
      await expect(call()).resolves.toBe(configResponse);

      const upstreamResponse = NextResponse.json({ error: 'Bad upstream' }, { status: 500 });
      mockBuildUpstreamUrl.mockReturnValueOnce(upstreamResponse);
      await expect(call()).resolves.toBe(upstreamResponse);
    }
  });

  it('returns config and upstream construction errors from token-authenticated performance routes', async () => {
    const performanceRoutes = [
      () => performanceRoute.GET(request('http://localhost/api')),
      () => thresholdsRoute.GET(request('http://localhost/api')),
      () => thresholdsRoute.PUT(
        request('http://localhost/api', { method: 'PUT', body: JSON.stringify({ slowQueryMs: 250 }) }),
      ),
    ];

    for (const call of performanceRoutes) {
      const configResponse = NextResponse.json({ error: 'Missing config' }, { status: 500 });
      mockGetBotApiConfig.mockReturnValueOnce(configResponse);
      await expect(call()).resolves.toBe(configResponse);

      const upstreamResponse = NextResponse.json({ error: 'Bad upstream' }, { status: 500 });
      mockBuildUpstreamUrl.mockReturnValueOnce(upstreamResponse);
      await expect(call()).resolves.toBe(upstreamResponse);
    }
  });

  it('returns early for shared proxy error responses', async () => {
    const authResponse = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    mockAuthorizeGuildAdmin.mockResolvedValueOnce(authResponse);
    await expect(aiRecentRoute.GET(request('http://localhost/api'), guildParams())).resolves.toBe(
      authResponse,
    );

    const configResponse = NextResponse.json({ error: 'Missing config' }, { status: 500 });
    mockGetBotApiConfig.mockReturnValueOnce(configResponse);
    await expect(membersRoute.GET(request('http://localhost/api'), guildParams())).resolves.toBe(
      configResponse,
    );

    const urlResponse = NextResponse.json({ error: 'Bad upstream' }, { status: 500 });
    mockBuildUpstreamUrl.mockReturnValueOnce(urlResponse);
    await expect(ticketsRoute.GET(request('http://localhost/api'), guildParams())).resolves.toBe(
      urlResponse,
    );

    const missing = await conversationDetailRoute.GET(request('http://localhost/api'), {
      params: Promise.resolve({ guildId: '', conversationId: 'conversation-1' }),
    });
    expect(missing.status).toBe(400);
  });
});
