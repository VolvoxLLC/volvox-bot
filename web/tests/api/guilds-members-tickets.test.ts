import { describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

import {
  expectJson,
  expectProxiedRoutes,
  expectSharedProxyFailures,
  guildParams,
  mockAuthorizeGuildModerator,
  mockBuildUpstreamUrl,
  mockGetBotApiConfig,
  proxyCases,
  request,
  setupProxyRouteMocks,
} from './helpers/proxy-route-test-helpers';

import * as memberCasesRoute from '@/app/api/guilds/[guildId]/members/[userId]/cases/route';
import * as memberDetailRoute from '@/app/api/guilds/[guildId]/members/[userId]/route';
import * as membersExportRoute from '@/app/api/guilds/[guildId]/members/export/route';
import * as membersRoute from '@/app/api/guilds/[guildId]/members/route';
import * as ticketsDetailRoute from '@/app/api/guilds/[guildId]/tickets/[ticketId]/route';
import * as ticketsStatsRoute from '@/app/api/guilds/[guildId]/tickets/stats/route';
import * as ticketsRoute from '@/app/api/guilds/[guildId]/tickets/route';

describe('guild members, export, and ticket proxy routes', () => {
  setupProxyRouteMocks();

  it('covers guild moderator proxy routes and parameter forwarding', async () => {
    const cases = proxyCases([
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
    ]);

    await expectProxiedRoutes(cases);
  });

  it('covers member export success and upstream error handling', async () => {
    const ok = await membersExportRoute.GET(request('http://localhost/api'), guildParams('guild-1'));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Content-Disposition')).toBe('attachment; filename="members.csv"');

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response('bad export', { status: 503 }));
    const error = await membersExportRoute.GET(request('http://localhost/api'), guildParams('guild-1'));
    expect(error.status).toBe(503);
    await expectJson(error, { error: 'bad export' });
  });

  it('covers missing guild guards for member, export, and ticket routes', async () => {
    const missingGuildCases = [
      () => membersRoute.GET(request('http://localhost/api'), guildParams('')),
      () => memberDetailRoute.GET(request('http://localhost/api'), {
        params: Promise.resolve({ guildId: '', userId: 'user-1' }),
      }),
      () => memberCasesRoute.GET(request('http://localhost/api'), {
        params: Promise.resolve({ guildId: '', userId: 'user-1' }),
      }),
      () => membersExportRoute.GET(request('http://localhost/api'), guildParams('')),
      () => ticketsRoute.GET(request('http://localhost/api'), guildParams('')),
      () => ticketsDetailRoute.GET(request('http://localhost/api'), {
        params: Promise.resolve({ guildId: '', ticketId: 'ticket-1' }),
      }),
      () => ticketsStatsRoute.GET(request('http://localhost/api'), guildParams('')),
    ];

    for (const call of missingGuildCases) {
      const response = await call();
      expect(response.status).toBe(400);
    }
  });

  it('returns auth, config, and upstream construction errors from member, export, and ticket routes', async () => {
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
    ];

    for (const call of moderatorRoutes) {
      await expectSharedProxyFailures(call, mockAuthorizeGuildModerator);
    }
  });

  it('returns early for member and ticket shared proxy error responses', async () => {
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
  });
});
