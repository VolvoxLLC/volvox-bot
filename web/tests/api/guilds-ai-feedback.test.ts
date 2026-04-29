import { describe, expect, it } from 'vitest';
import { NextResponse } from 'next/server';

import {
  expectProxiedRoutes,
  expectSharedProxyFailures,
  guildParams,
  mockAuthorizeGuildAdmin,
  proxyCases,
  request,
  setupProxyRouteMocks,
} from './helpers/proxy-route-test-helpers';

import * as aiRecentRoute from '@/app/api/guilds/[guildId]/ai-feedback/recent/route';
import * as aiStatsRoute from '@/app/api/guilds/[guildId]/ai-feedback/stats/route';

describe('guild ai feedback proxy routes', () => {
  setupProxyRouteMocks();

  it('covers ai feedback proxy routes and query forwarding', async () => {
    const cases = proxyCases([
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
    ]);

    await expectProxiedRoutes(cases);
  });

  it('covers missing guild guards for ai feedback routes', async () => {
    const missingGuildCases = [
      () => aiRecentRoute.GET(request('http://localhost/api'), guildParams('')),
      () => aiStatsRoute.GET(request('http://localhost/api'), guildParams('')),
    ];

    for (const call of missingGuildCases) {
      const response = await call();
      expect(response.status).toBe(400);
    }
  });

  it('returns auth, config, and upstream construction errors from ai feedback routes', async () => {
    const adminRoutes = [
      () => aiRecentRoute.GET(request('http://localhost/api'), guildParams('guild-1')),
      () => aiStatsRoute.GET(request('http://localhost/api'), guildParams('guild-1')),
    ];

    for (const call of adminRoutes) {
      await expectSharedProxyFailures(call, mockAuthorizeGuildAdmin);
    }
  });

  it('returns early for ai feedback auth proxy errors', async () => {
    const authResponse = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    mockAuthorizeGuildAdmin.mockResolvedValueOnce(authResponse);
    await expect(aiRecentRoute.GET(request('http://localhost/api'), guildParams())).resolves.toBe(
      authResponse,
    );
  });
});
